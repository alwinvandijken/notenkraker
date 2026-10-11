import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promotionCandidates, scoreRound } from "@notenkraker/core";
import type {
  AuthApi, Homework, HomeworkApi, InvitePurpose, NotenkrakerClient, NotesApi, PracticeApi, PracticeSession, Profile, Progress, Role, Round, RoundsApi, RoundSubmission,
  SelfRole, Song, SongsApi, Student, StudentNote, StudentsApi,
} from "./types.js";

/**
 * Supabase-implementatie van het contract. Tabellen: zie supabase/migrations.
 * Reads gaan via PostgREST met RLS; commando's met logica via Edge Functions.
 */

export interface SupabaseClientOptions {
  url: string;
  anonKey: string;
  /** voor tests: eigen supabase-js instantie */
  client?: SupabaseClient;
}

export function createSupabaseNotenkraker(opts: SupabaseClientOptions): NotenkrakerClient {
  const sb = opts.client ?? createClient(opts.url, opts.anonKey);

  const auth: AuthApi = {
    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUpWithPassword(email, password, role: SelfRole, displayName) {
      const { error } = await sb.auth.signUp({ email, password, options: { data: { role, display_name: displayName } } });
      if (error) throw error;
    },
    async signInWithGoogle(redirectTo) {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      if (error) throw error;
    },
    async chooseRole(role) {
      const { error } = await sb.rpc("choose_role", { p_role: role });
      if (error) throw error;
    },
    async signOut() { await sb.auth.signOut(); },
    async currentProfile() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const { data } = await sb.from("profiles").select("id, role, display_name").eq("id", user.id).maybeSingle();
      return { id: user.id, role: (data?.role ?? null) as Role | null, displayName: data?.display_name ?? user.email ?? "", email: user.email ?? undefined };
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(async () => cb(await auth.currentProfile()));
      return () => data.subscription.unsubscribe();
    },
  };

  const rowToStudent = (r: Record<string, unknown>): Student => ({
    id: r.id as string, name: r.name as string, instrumentId: r.instrument_id as string,
    naming: (r.naming as "nl" | "en") ?? "nl", userId: (r.user_id as string | null) ?? null, createdAt: r.created_at as string,
    ageBand: (r.age_band as Student["ageBand"]) ?? null, experience: (r.experience as Student["experience"]) ?? null,
    onboardedAt: (r.onboarded_at as string | null) ?? null,
  });

  const students: StudentsApi = {
    async list() {
      const { data, error } = await sb.from("students").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(rowToStudent);
    },
    async create(input) {
      const { data, error } = await sb.from("students").insert({ name: input.name, instrument_id: input.instrumentId, naming: input.naming ?? "nl" }).select().single();
      if (error) throw error;
      return rowToStudent(data);
    },
    async update(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.instrumentId !== undefined) row.instrument_id = patch.instrumentId;
      if (patch.naming !== undefined) row.naming = patch.naming;
      if (patch.ageBand !== undefined) row.age_band = patch.ageBand;
      if (patch.experience !== undefined) row.experience = patch.experience;
      if (patch.onboardedAt !== undefined) row.onboarded_at = patch.onboardedAt;
      const { data, error } = await sb.from("students").update(row).eq("id", id).select().single();
      if (error) throw error;
      return rowToStudent(data);
    },
    async remove(id) { const { error } = await sb.from("students").delete().eq("id", id); if (error) throw error; },
    async linkByCode(code) {
      const { data, error } = await sb.functions.invoke("link-student", { body: { code } });
      if (error) throw error;
      return rowToStudent(data.student);
    },
    async claimByCode(code) {
      const { data, error } = await sb.rpc("claim_student", { p_code: code });
      if (error) throw error;
      return rowToStudent(data);
    },
    async inviteCode(studentId, purpose: InvitePurpose = "leraar") {
      const { data, error } = await sb.functions.invoke("invite-code", { body: { studentId, purpose } });
      if (error) throw error;
      return data.code as string;
    },
  };

  const rowToNote = (r: Record<string, unknown>): StudentNote => ({
    studentId: r.student_id as string, noteId: r.note_id as string, status: r.status as StudentNote["status"], updatedAt: r.updated_at as string,
  });

  const notes: NotesApi = {
    async list(studentId) {
      const { data, error } = await sb.from("student_notes").select("*").eq("student_id", studentId);
      if (error) throw error;
      return (data ?? []).map(rowToNote);
    },
    async setStatus(studentId, noteId, status) {
      if (status === null) {
        const { error } = await sb.from("student_notes").delete().match({ student_id: studentId, note_id: noteId });
        if (error) throw error;
      } else {
        const { error } = await sb.from("student_notes").upsert({ student_id: studentId, note_id: noteId, status, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    },
    subscribe(studentId, cb) {
      const push = () => notes.list(studentId).then(cb).catch(() => {});
      void push();
      const ch = sb.channel(`student_notes:${studentId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "student_notes", filter: `student_id=eq.${studentId}` }, push)
        .subscribe();
      return () => { void sb.removeChannel(ch); };
    },
  };

  const rowToRound = (r: Record<string, unknown>): Round => ({
    id: r.id as string, studentId: r.student_id as string, mode: r.mode as Round["mode"], ms: r.ms as number,
    playedAt: r.played_at as string, completed: r.completed as boolean, mistakes: r.mistakes as number,
    stars: r.stars as Round["stars"], xp: r.xp as number, wrongNotes: (r.wrong_notes as string[]) ?? [],
    answers: (r.answers as Round["answers"]) ?? [],
  });

  const rounds: RoundsApi = {
    async submit(round: RoundSubmission) {
      // De Edge Function berekent de score opnieuw met dezelfde core-functie; de client
      // doet het ook vast, zodat de UI niet hoeft te wachten.
      const { data, error } = await sb.functions.invoke("rounds", { body: round });
      if (error) throw error;
      return rowToRound(data.round);
    },
    async recent(studentId, limit = 6) {
      const { data, error } = await sb.from("rounds").select("*").eq("student_id", studentId).order("played_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map(rowToRound);
    },
    async progress(studentId): Promise<Progress> {
      const [{ data: rs }, { data: ns }] = await Promise.all([
        sb.from("rounds").select("*").eq("student_id", studentId).order("played_at", { ascending: false }).limit(50),
        sb.from("student_notes").select("*").eq("student_id", studentId),
      ]);
      const list = (rs ?? []).map(rowToRound);
      const statuses = Object.fromEntries((ns ?? []).map((n) => [n.note_id as string, n.status as StudentNote["status"]]));
      const weak = new Map<string, { wrong: number; asked: number }>();
      for (const r of list) for (const n of r.wrongNotes) { const w = weak.get(n) ?? { wrong: 0, asked: 0 }; w.wrong++; weak.set(n, w); }
      const days = new Set(list.map((r) => r.playedAt.slice(0, 10)));
      let streak = 0; const d = new Date();
      while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
      return {
        xp: list.reduce((s, r) => s + r.xp, 0),
        streakDays: streak,
        rounds: list.length,
        weakNotes: [...weak.entries()].map(([noteId, w]) => ({ noteId, ...w })).sort((a, b) => b.wrong - a.wrong),
        promotionCandidates: promotionCandidates(statuses, list),
      };
    },
  };

  const rowToSession = (r: Record<string, unknown>): PracticeSession => ({
    id: r.id as string, studentId: r.student_id as string, startedAt: r.started_at as string, endedAt: r.ended_at as string,
    done: r.done as boolean, playedSeconds: r.played_seconds as number, minutes: (r.minutes as PracticeSession["minutes"]) ?? [],
    notes: (r.notes as string[]) ?? [], label: r.label as PracticeSession["label"],
  });

  // start en update zijn databasefuncties: de server zet de tijd en controleert de minuten
  const practice: PracticeApi = {
    async start(studentId) {
      const { data, error } = await sb.rpc("practice_start", { p_student: studentId });
      if (error) throw error;
      return rowToSession(data);
    },
    async update(id, { minutes, notes, done = false }) {
      const { data, error } = await sb.rpc("practice_update", { p_id: id, p_minutes: minutes, p_notes: notes, p_done: done });
      if (error) throw error;
      return rowToSession(data);
    },
    async recent(studentId, limit = 20) {
      const { data, error } = await sb.from("practice_sessions").select("*").eq("student_id", studentId).order("started_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map(rowToSession);
    },
  };

  const rowToHomework = (r: Record<string, unknown>): Homework => ({
    id: r.id as string, studentId: r.student_id as string, givenBy: r.given_by as string,
    givenByRole: r.given_by_role as Homework["givenByRole"], givenByName: r.given_by_name as string, createdAt: r.created_at as string,
    dueDate: r.due_date as string, minutesPerDay: r.minutes_per_day as number, daysPerWeek: r.days_per_week as number,
    notes: (r.notes as string[]) ?? [], piece: (r.piece as string) ?? "", pieceNote: (r.piece_note as string) ?? "", remark: (r.remark as string) ?? "",
  });

  // geven is een databasefunctie: die controleert wie het mag en zet de noten op "in de les"
  const homework: HomeworkApi = {
    async list(studentId, limit = 20) {
      const { data, error } = await sb.from("homework").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map(rowToHomework);
    },
    async give(input) {
      const { data, error } = await sb.rpc("give_homework", {
        p_student: input.studentId, p_notes: input.notes, p_minutes: input.minutesPerDay, p_days: input.daysPerWeek,
        p_piece: input.piece, p_piece_note: input.pieceNote, p_remark: input.remark, p_due: input.dueDate,
      });
      if (error) throw error;
      return rowToHomework(data);
    },
  };

  const rowToSong = (r: Record<string, unknown>): Song => ({
    id: r.id as string, title: r.title as string, instrumentId: r.instrument_id as string,
    source: r.source as Song["source"], notes: r.notes as Song["notes"], createdAt: r.created_at as string,
  });

  const songs: SongsApi = {
    async list(studentId) {
      const { data, error } = await sb.from("songs").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToSong);
    },
    async create(studentId, song) {
      const { data, error } = await sb.from("songs").insert({ student_id: studentId, title: song.title, instrument_id: song.instrumentId, source: song.source, notes: song.notes }).select().single();
      if (error) throw error;
      return rowToSong(data);
    },
    async remove(id) { const { error } = await sb.from("songs").delete().eq("id", id); if (error) throw error; },
  };

  return { auth, students, notes, rounds, practice, homework, songs };
}

/** Lokale scorefunctie, voor optimistische UI en voor de Edge Function (zelfde core). */
export { scoreRound };
