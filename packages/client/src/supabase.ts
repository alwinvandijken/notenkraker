import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promotionCandidates, scoreRound } from "@notenkraker/core";
import type {
  AdminApi, AdminUser, AuthApi, BankApi, FilesApi, BankTask, Book, BooksApi, HomeworkTask, TaskInput, TaskRecording, Guardian, Feedback, FeedbackApi, Homework, HomeworkApi, HomeworkTemplate, InvitePurpose, NotenkrakerClient, NotesApi, PracticeApi, PracticeSession, Profile, Progress, Role, Round, RoundsApi, RoundSubmission,
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
    async signInWithEmailLink(email, redirectTo) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
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
      const { data } = await sb.from("profiles").select("id, role, display_name, can_give_feedback").eq("id", user.id).maybeSingle();
      return {
        id: user.id, role: (data?.role ?? null) as Role | null, displayName: data?.display_name ?? user.email ?? "", email: user.email ?? undefined,
        canGiveFeedback: data?.can_give_feedback === true,
      };
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(async () => cb(await auth.currentProfile()));
      return () => data.subscription.unsubscribe();
    },
  };

  const rowToStudent = (r: Record<string, unknown>): Student => ({
    id: r.id as string, name: r.name as string, instrumentId: r.instrument_id as string,
    naming: (r.naming as "nl" | "en") ?? "nl", userId: (r.user_id as string | null) ?? null, ownerId: r.owner_id as string, createdAt: r.created_at as string,
    ageBand: (r.age_band as Student["ageBand"]) ?? null, experience: (r.experience as Student["experience"]) ?? null,
    onboardedAt: (r.onboarded_at as string | null) ?? null, recordingConsent: r.recording_consent === true,
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
    async setRecordingConsent(studentId, allowed) {
      const { error } = await sb.rpc("set_recording_consent", { p_student: studentId, p_allowed: allowed });
      if (error) throw error;
    },
    async guardians() {
      const { data, error } = await sb.rpc("my_guardians");
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r): Guardian => ({ studentId: r.student_id as string, name: r.name as string, role: r.role as Guardian["role"] }));
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
    tasks: ((r.homework_tasks as Array<Record<string, unknown>>) ?? []).map(rowToTask).sort((a, b) => a.position - b.position),
  });

  const rowToTask = (r: Record<string, unknown>): HomeworkTask => ({
    id: r.id as string, homeworkId: r.homework_id as string, position: r.position as number, kind: r.kind as HomeworkTask["kind"],
    title: r.title as string, bookTitle: (r.book_title as string) ?? "", bookAuthor: (r.book_author as string) ?? "",
    page: (r.page as string) ?? "", chapter: (r.chapter as string) ?? "", number: (r.number as string) ?? "", track: (r.track as string) ?? "",
    doneAt: (r.done_at as string | null) ?? null,
    sheetPath: (r.sheet_path as string | null) ?? null, sheetName: (r.sheet_name as string) ?? "", examplePath: (r.example_path as string | null) ?? null,
    recording: r.recording === true,
    recordings: ((r.task_recordings as Array<Record<string, unknown>>) ?? []).map(rowToRecording).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
  });
  const rowToRecording = (r: Record<string, unknown>): TaskRecording => ({
    id: r.id as string, taskId: r.task_id as string, path: (r.path as string | null) ?? null, submittedAt: r.submitted_at as string,
    deletedAt: (r.deleted_at as string | null) ?? null, reactionEmoji: (r.reaction_emoji as string) ?? "", reaction: (r.reaction as string) ?? "",
    reactedAt: (r.reacted_at as string | null) ?? null,
  });
  /** opdracht in de vorm die de databasefuncties verwachten */
  const taskToJson = (t: TaskInput) => ({
    kind: t.kind, title: t.title, book_id: t.bookId ?? null, page: t.page, chapter: t.chapter, number: t.number, track: t.track, bank_id: t.bankId ?? null,
    sheet_path: t.sheetPath ?? null, sheet_name: t.sheetName ?? "", example_path: t.examplePath ?? null, recording: t.recording ?? false,
  });

  const rowToTemplate = (r: Record<string, unknown>): HomeworkTemplate => ({
    id: r.id as string, name: r.name as string, notes: (r.notes as string[]) ?? [], minutesPerDay: r.minutes_per_day as number,
    daysPerWeek: r.days_per_week as number, piece: (r.piece as string) ?? "", pieceNote: (r.piece_note as string) ?? "", remark: (r.remark as string) ?? "",
    tasks: (r.tasks as TaskInput[]) ?? [],
  });

  // geven is een databasefunctie: die controleert wie het mag en zet de noten op "in de les"
  const homework: HomeworkApi = {
    async list(studentId, limit = 20) {
      const { data, error } = await sb.from("homework").select("*, homework_tasks(*, task_recordings(*))").eq("student_id", studentId).order("created_at", { ascending: false }).limit(limit);
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
    async giveMany(studentIds, input) {
      const { data, error } = await sb.rpc("give_homework_many", {
        p_students: studentIds, p_notes: input.notes, p_minutes: input.minutesPerDay, p_days: input.daysPerWeek,
        p_piece: input.piece, p_piece_note: input.pieceNote, p_remark: input.remark, p_due: input.dueDate,
      });
      if (error) throw error;
      return data as number;
    },
    async templates() {
      const { data, error } = await sb.from("homework_templates").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(rowToTemplate);
    },
    async saveTemplate(t) {
      const { data, error } = await sb.from("homework_templates").insert({
        name: t.name, notes: t.notes, minutes_per_day: t.minutesPerDay, days_per_week: t.daysPerWeek,
        piece: t.piece, piece_note: t.pieceNote, remark: t.remark, tasks: t.tasks,
      }).select().single();
      if (error) throw error;
      return rowToTemplate(data);
    },
    async removeTemplate(id) {
      const { error } = await sb.from("homework_templates").delete().eq("id", id);
      if (error) throw error;
    },
    async giveWithTasks(studentIds, input, tasks) {
      const { data, error } = await sb.rpc("give_homework_with_tasks", {
        p_students: studentIds, p_notes: input.notes, p_minutes: input.minutesPerDay, p_days: input.daysPerWeek,
        p_remark: input.remark, p_due: input.dueDate, p_tasks: tasks.map(taskToJson),
      });
      if (error) throw error;
      return data as number;
    },
    async setTaskDone(taskId, done) {
      const { error } = await sb.rpc("set_task_done", { p_task: taskId, p_done: done });
      if (error) throw error;
    },
    async submitRecording(taskId, path, seconds) {
      const { error } = await sb.rpc("submit_recording", { p_task: taskId, p_path: path, p_seconds: Math.round(seconds) });
      if (error) throw error;
    },
    async deleteRecording(recordingId) {
      const { data, error } = await sb.rpc("delete_recording", { p_recording: recordingId });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    async reactToRecording(recordingId, emoji, text) {
      const { error } = await sb.rpc("react_to_recording", { p_recording: recordingId, p_emoji: emoji, p_text: text });
      if (error) throw error;
    },
  };

  /** bestandsnaam veilig maken voor Storage: letters, cijfers, punt, streepje */
  const safe = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(-80) || "bestand";
  const files: FilesApi = {
    async uploadSheet(file, name) {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("niet ingelogd");
      const path = `${user.id}/${crypto.randomUUID()}-${safe(name)}`;
      const { error } = await sb.storage.from("bladmuziek").upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      return path;
    },
    async uploadRecording(studentId, taskId, audio, ext) {
      const path = `${studentId}/${taskId}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("opnames").upload(path, audio, { contentType: audio.type || undefined });
      if (error) throw error;
      return path;
    },
    async removeRecording(path) {
      const { error } = await sb.storage.from("opnames").remove([path]);
      if (error) throw error;
    },
    async url(bucket, path) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  };

  const rowToBook = (r: Record<string, unknown>): Book => ({ id: r.id as string, title: r.title as string, author: (r.author as string) ?? "", hasAudio: r.has_audio === true });
  const books: BooksApi = {
    async list() {
      const { data, error } = await sb.from("books").select("*").order("title");
      if (error) throw error;
      return (data ?? []).map(rowToBook);
    },
    async save(b) {
      const row = { title: b.title, author: b.author, has_audio: b.hasAudio };
      const { data, error } = b.id ? await sb.from("books").update(row).eq("id", b.id).select().single() : await sb.from("books").insert(row).select().single();
      if (error) throw error;
      return rowToBook(data);
    },
    async remove(id) { const { error } = await sb.from("books").delete().eq("id", id); if (error) throw error; },
  };

  const rowToBank = (r: Record<string, unknown>): BankTask => ({
    id: r.id as string, kind: r.kind as BankTask["kind"], title: r.title as string, bookId: (r.book_id as string | null) ?? null,
    page: (r.page as string) ?? "", chapter: (r.chapter as string) ?? "", number: (r.number as string) ?? "", track: (r.track as string) ?? "",
    categories: (r.categories as string[]) ?? [],
    sheetPath: (r.sheet_path as string | null) ?? null, sheetName: (r.sheet_name as string) ?? "", examplePath: (r.example_path as string | null) ?? null,
    recording: r.recording === true,
  });
  const bank: BankApi = {
    async list() {
      const { data, error } = await sb.from("task_bank").select("*").order("title");
      if (error) throw error;
      return (data ?? []).map(rowToBank);
    },
    async save(t) {
      const row = { kind: t.kind, title: t.title, book_id: t.bookId ?? null, page: t.page, chapter: t.chapter, number: t.number, track: t.track, categories: t.categories,
        sheet_path: t.sheetPath ?? null, sheet_name: t.sheetName ?? "", example_path: t.examplePath ?? null, recording: t.recording ?? false };
      const { data, error } = t.id ? await sb.from("task_bank").update(row).eq("id", t.id).select().single() : await sb.from("task_bank").insert(row).select().single();
      if (error) throw error;
      return rowToBank(data);
    },
    async remove(id) { const { error } = await sb.from("task_bank").delete().eq("id", id); if (error) throw error; },
    async assign(studentIds, bankIds, dueDate) {
      const { data, error } = await sb.rpc("assign_tasks", { p_students: studentIds, p_bank_ids: bankIds, p_due: dueDate });
      if (error) throw error;
      return data as number;
    },
  };

  const rowToFeedback = (r: Record<string, unknown>): Feedback => ({
    id: r.id as string, userId: (r.user_id as string | null) ?? null, displayName: r.display_name as string, role: (r.role as Role | null) ?? null,
    kind: r.kind as Feedback["kind"], message: r.message as string, screen: r.screen as string, url: r.url as string,
    device: r.device as string, version: r.version as string, status: r.status as Feedback["status"],
    linearUrl: (r.linear_url as string | null) ?? null, createdAt: r.created_at as string,
  });

  const feedback: FeedbackApi = {
    async send(input) {
      const { error } = await sb.rpc("give_feedback", {
        p_kind: input.kind, p_message: input.message, p_screen: input.screen, p_url: input.url, p_device: input.device, p_version: input.version,
      });
      if (error) throw error;
    },
    async list() {
      const { data, error } = await sb.from("feedback").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []).map(rowToFeedback);
    },
    async setStatus(id, status, linearUrl) {
      const patch: Record<string, unknown> = { status };
      if (linearUrl !== undefined) patch.linear_url = linearUrl;
      const { error } = await sb.from("feedback").update(patch).eq("id", id);
      if (error) throw error;
    },
  };

  const admin: AdminApi = {
    async users() {
      const { data, error } = await sb.rpc("admin_users");
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r): AdminUser => ({
        id: r.id as string, displayName: r.display_name as string, email: (r.email as string) ?? "", role: (r.role as Role | null) ?? null,
        canGiveFeedback: r.can_give_feedback === true, createdAt: r.created_at as string,
      }));
    },
    async setFeedbackAllowed(userId, allowed) {
      const { error } = await sb.rpc("set_feedback_allowed", { p_user: userId, p_allowed: allowed });
      if (error) throw error;
    },
    async invite(input) {
      const { error } = await sb.functions.invoke("admin-invite", { body: input });
      if (error) {
        // de Edge Function geeft { error: "bestaat al" | … } terug; die tekst willen we tonen
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? error.message);
      }
    },
    async setRole(userId, role) {
      const { error } = await sb.rpc("set_role", { p_user: userId, p_role: role });
      if (error) throw error;
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

  return { auth, students, notes, rounds, practice, homework, books, files, bank, feedback, admin, songs };
}

/** Lokale scorefunctie, voor optimistische UI en voor de Edge Function (zelfde core). */
export { scoreRound };
