import { lessonPeriod } from "./homework.js";
import { lessonEnd, weekOf } from "./lessons.js";
import { ageProfile, scoreRound, type StatusMap } from "@notenkraker/core";
import type { BankTask, Book, Homework, HomeworkTask, HomeworkTemplate, TaskInput, NotenkrakerClient, PracticeSession, Profile, Round, Song, Student, StudentNote } from "./types.js";

/**
 * In-memory/localStorage-implementatie van hetzelfde contract. Voor
 * ontwikkeling zonder Supabase, voor tests, en als fallback wanneer er geen
 * verbinding is, en voor de route zonder account (/oefenen, rol "leerling"). Eén profiel
 * (standaard "ouder": kinderen onder één login), geen echte auth.
 */
export function createLocalNotenkraker(storageKey = "notenkraker-local", opts: { role?: Profile["role"]; displayName?: string } = {}): NotenkrakerClient {
  type State = { students: Student[]; notes: StudentNote[]; rounds: Round[]; practice?: PracticeSession[]; homework?: Homework[]; schedule?: Record<string, number | null>; templates?: HomeworkTemplate[]; books?: Book[]; bank?: BankTask[]; songs: Array<Song & { studentId: string }> };
  const load = (): State => {
    try { const raw = globalThis.localStorage?.getItem(storageKey); if (raw) return JSON.parse(raw) as State; } catch { /* geen storage */ }
    return { students: [], notes: [], rounds: [], songs: [] };
  };
  const state = load();
  const save = () => { try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(state)); } catch { /* geen storage */ } };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const now = () => new Date().toISOString();
  const listeners = new Map<string, Set<(n: StudentNote[]) => void>>();
  const emit = (sid: string) => listeners.get(sid)?.forEach((cb) => cb(state.notes.filter((n) => n.studentId === sid)));
  /** opdracht als huiswerk in een les (lokaal: geen bladmuziek of opnames, wel of er om een opname gevraagd wordt) */
  const toTask = (t: TaskInput, lessonId: string, position: number): HomeworkTask => {
    const b = state.books?.find((x) => x.id === t.bookId);
    return { id: t.id ?? uid(), homeworkId: lessonId, homeworkItemId: uid(), position, kind: t.kind, title: t.title, bookTitle: b?.title ?? "", bookAuthor: b?.author ?? "",
      page: t.page, chapter: t.chapter, number: t.number, track: t.track, doneAt: null, sheetPath: null, sheetName: "", examplePath: null,
      recording: t.kind === "stuk" && !!t.recording, recordings: [], week: 1, weeks: [], progress: null };
  };
  /** noten van het huiswerk op "in de les"; wat het kind al kent blijft */
  const notesToLes = (sid: string, notes: string[]) => {
    for (const n of notes) {
      if (state.notes.some((x) => x.studentId === sid && x.noteId === n && x.status === "kent")) continue;
      state.notes = state.notes.filter((x) => !(x.studentId === sid && x.noteId === n));
      state.notes.push({ studentId: sid, noteId: n, status: "les", updatedAt: now() });
    }
  };
  const profile: Profile = { id: "local", role: opts.role ?? "ouder", displayName: opts.displayName ?? "Lokaal" };
  const authListeners = new Set<(p: Profile | null) => void>();

  return {
    auth: {
      async signInWithPassword() { authListeners.forEach((cb) => cb(profile)); },
      async signUpWithPassword() { authListeners.forEach((cb) => cb(profile)); },
      async signInWithGoogle() { authListeners.forEach((cb) => cb(profile)); },
      async signInWithEmailLink() { authListeners.forEach((cb) => cb(profile)); },
      async chooseRole() { /* lokaal is er alleen het ouderprofiel */ },
      async signOut() { authListeners.forEach((cb) => cb(null)); },
      async currentProfile() { return profile; },
      onAuthChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    },
    students: {
      async list() { return [...state.students].sort((a, b) => a.name.localeCompare(b.name)); },
      async create(input) { const s: Student = { id: uid(), name: input.name, instrumentId: input.instrumentId, naming: input.naming ?? "nl", userId: null, createdAt: now() }; state.students.push(s); save(); return s; },
      async update(id, patch) { const s = state.students.find((x) => x.id === id); if (!s) throw new Error("onbekend"); Object.assign(s, patch); save(); return s; },
      async remove(id) { state.students = state.students.filter((s) => s.id !== id); state.notes = state.notes.filter((n) => n.studentId !== id); save(); },
      async linkByCode() { throw new Error("niet beschikbaar zonder backend"); },
      async claimByCode() { throw new Error("niet beschikbaar zonder backend"); },
      async inviteCode() { throw new Error("niet beschikbaar zonder backend"); },
      async guardians() { return []; },
      async setRecordingConsent() { /* lokaal geen opnames */ },
    },
    notes: {
      async list(sid) { return state.notes.filter((n) => n.studentId === sid); },
      async setStatus(sid, noteId, status) {
        state.notes = state.notes.filter((n) => !(n.studentId === sid && n.noteId === noteId));
        if (status) state.notes.push({ studentId: sid, noteId, status, updatedAt: now() });
        save(); emit(sid);
      },
      subscribe(sid, cb) {
        if (!listeners.has(sid)) listeners.set(sid, new Set());
        listeners.get(sid)!.add(cb); cb(state.notes.filter((n) => n.studentId === sid));
        return () => { listeners.get(sid)?.delete(cb); };
      },
    },
    rounds: {
      async submit(sub) {
        const statuses: StatusMap = Object.fromEntries(state.notes.filter((n) => n.studentId === sub.studentId).map((n) => [n.noteId, n.status]));
        const r: Round = { id: uid(), studentId: sub.studentId, mode: sub.mode, ms: sub.ms, playedAt: now(), answers: sub.answers, ...scoreRound({ mode: sub.mode, lives: ageProfile(state.students.find((s) => s.id === sub.studentId)?.ageBand).lives, ms: sub.ms, answers: sub.answers }, statuses) };
        state.rounds.unshift(r); save(); return r;
      },
      async recent(sid, limit = 6) { return state.rounds.filter((r) => r.studentId === sid).slice(0, limit); },
      async progress(sid) {
        const rs = state.rounds.filter((r) => r.studentId === sid);
        return { xp: rs.reduce((s, r) => s + r.xp, 0), streakDays: 0, rounds: rs.length, weakNotes: [], promotionCandidates: [] };
      },
    },
    // lokaal controleert niemand de klok; alleen voor ontwikkelen zonder backend
    practice: {
      async start(sid) {
        const s: PracticeSession = { id: uid(), studentId: sid, startedAt: now(), endedAt: now(), done: false, playedSeconds: 0, minutes: [], notes: [], label: "sax" };
        (state.practice ??= []).unshift(s); save(); return s;
      },
      async update(id, { minutes, notes, done = false }) {
        const s = state.practice?.find((x) => x.id === id);
        if (!s || s.done) throw new Error("sessie is al afgesloten");
        const elapsed = Math.floor((Date.now() - Date.parse(s.startedAt)) / 1000);
        const played = Math.min(elapsed, minutes.reduce((n, m) => n + m.s, 0));
        Object.assign(s, { endedAt: now(), done, minutes, notes, playedSeconds: played, label: played >= 120 && notes.length <= 1 ? "twijfel" : "sax" });
        save(); return s;
      },
      async recent(sid, limit = 20) { return (state.practice ?? []).filter((s) => s.studentId === sid).slice(0, limit); },
    },
    // lokaal (zonder account) geeft niemand huiswerk; dit is er voor ontwikkelen zonder backend
    homework: {
      /** zelfde gemaksvorm als de Supabase-client: één les per Homework; week en weeks uit de lessen van de leerling */
      async list(sid, limit = 50) {
        const mine = (state.homework ?? []).filter((h) => h.studentId === sid && h.status !== "afgezegd");
        return (state.homework ?? []).filter((h) => h.studentId === sid).map((h) => ({
          ...h,
          tasks: h.tasks.map((t) => {
            const starts = mine.filter((x) => x.tasks.some((y) => y.id === t.id)).map((x) => ({ lessonId: x.id, start: x.startDate })).sort((a, b) => a.start.localeCompare(b.start));
            const weeks = starts.map((x, k) => ({ ...x, end: lessonEnd(starts[k + 1] ? [starts[k + 1]!.start] : [], x.start) }));
            return { ...t, weeks, week: weekOf(weeks, h.id) || 1 };
          }),
        })).sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, limit);
      },
      async give(ids, which, input, tasks, carry = {}) {
        const today = now().slice(0, 10);
        for (const sid of ids) {
          const per = lessonPeriod(state.schedule?.[sid] ?? null, which);
          let h = (state.homework ?? []).find((x) => x.studentId === sid && x.givenBy === profile.id && x.status !== "afgezegd" && x.dueDate >= today
            && (which === "deze" ? x.startDate <= today : x.startDate > today));
          if (h) h.notes = [...new Set([...h.notes, ...input.notes])];
          else {
            h = { id: uid(), groupId: `lokaal-${sid}`, studentId: sid, givenBy: profile.id, givenByRole: profile.role === "leraar" ? "leraar" : "ouder",
              givenByName: profile.displayName, createdAt: now(), startDate: per.start, dueDate: per.due, status: per.start <= today ? "gegeven" : "gepland",
              ...input, piece: "", pieceNote: "", tasks: [] };
            (state.homework ??= []).unshift(h);
          }
          const lesson = h;
          // meegaan: dezelfde opdracht (zelfde id, met zijn opnames) in deze les, met een nieuw vinkje
          for (const aid of carry[sid] ?? []) {
            const from = (state.homework ?? []).flatMap((x) => x.tasks).find((t) => t.id === aid);
            if (from && !lesson.tasks.some((t) => t.id === aid)) lesson.tasks.push({ ...from, homeworkId: lesson.id, homeworkItemId: uid(), position: lesson.tasks.length, doneAt: null });
          }
          for (const t of tasks) lesson.tasks.push(toTask(t, lesson.id, lesson.tasks.length));
          notesToLes(sid, input.notes);
          emit(sid);
        }
        save(); return ids.length;
      },
      async templates() { return [...(state.templates ?? [])].sort((a, b) => a.name.localeCompare(b.name)); },
      async saveTemplate(t) { const x = { ...t, id: uid() }; (state.templates ??= []).push(x); save(); return x; },
      async removeTemplate(id) { state.templates = (state.templates ?? []).filter((t) => t.id !== id); save(); },
      async update(lessonId, input, tasks) {
        const h = state.homework?.find((x) => x.id === lessonId);
        if (!h) throw new Error("onbekend huiswerk");
        Object.assign(h, { notes: input.notes, minutesPerDay: input.minutesPerDay, daysPerWeek: input.daysPerWeek, remark: input.remark, startDate: input.startDate });
        const old = h.tasks;
        h.tasks = tasks.map((t, i) => {
          const prev = old.find((x) => x.id === t.id);
          return prev ? { ...prev, ...toTask(t, lessonId, i), id: prev.id, homeworkItemId: prev.homeworkItemId, doneAt: prev.doneAt, recordings: prev.recordings, progress: prev.progress }
            : toTask(t, lessonId, i);
        });
        notesToLes(h.studentId, input.notes);
        save(); emit(h.studentId);
      },
      async end(lessonId) {
        const h = state.homework?.find((x) => x.id === lessonId);
        if (!h) return;
        h.status = "afgezegd"; save(); emit(h.studentId);
      },
      async submitRecording() { throw new Error("niet beschikbaar zonder backend"); },
      async reactToRecording() { throw new Error("niet beschikbaar zonder backend"); },
      async deleteRecording() { throw new Error("niet beschikbaar zonder backend"); },
      async setTaskDone(homeworkItemId, _sid, done) {
        for (const h of state.homework ?? []) for (const t of h.tasks) if (t.homeworkItemId === homeworkItemId) t.doneAt = done ? now() : null;
        save();
      },
      async schedule(sid) { return state.schedule?.[sid] ?? null; },
      async setSchedule(sid, weekday) { (state.schedule ??= {})[sid] = weekday; save(); },
      async setProgress(assignmentId, _sid, status, grade) {
        for (const h of state.homework ?? []) for (const t of h.tasks) if (t.id === assignmentId) t.progress = { status, grade };
        save();
      },
    },
    // zonder account geen bestanden
    files: {
      async uploadSheet() { throw new Error("niet beschikbaar zonder backend"); },
      async uploadRecording() { throw new Error("niet beschikbaar zonder backend"); },
      async removeRecording() { /* niets */ },
      async url() { throw new Error("niet beschikbaar zonder backend"); },
    },
    books: {
      async list() { return [...(state.books ?? [])].sort((a, b) => a.title.localeCompare(b.title)); },
      async save(b) { const x = { ...b, id: b.id ?? uid() }; state.books = [...(state.books ?? []).filter((y) => y.id !== x.id), x]; save(); return x; },
      async remove(id) { state.books = (state.books ?? []).filter((b) => b.id !== id); save(); },
    },
    bank: {
      async list() { return [...(state.bank ?? [])].sort((a, b) => a.title.localeCompare(b.title)); },
      async save(t) { const x = { ...t, id: t.id ?? uid() }; state.bank = [...(state.bank ?? []).filter((y) => y.id !== x.id), x]; save(); return x; },
      async remove(id) { state.bank = (state.bank ?? []).filter((b) => b.id !== id); save(); },
      async assign() { throw new Error("niet beschikbaar zonder backend"); },
    },
    // zonder account geen feedback en geen beheer
    feedback: {
      async send() { throw new Error("niet beschikbaar zonder backend"); },
      async list() { return []; },
      async setStatus() { /* niets */ },
    },
    admin: {
      async users() { return []; },
      async setFeedbackAllowed() { /* niets */ },
      async setRole() { /* niets */ },
      async invite() { throw new Error("niet beschikbaar zonder backend"); },
    },
    songs: {
      async list(sid) { return state.songs.filter((s) => s.studentId === sid); },
      async create(sid, song) { const s = { ...song, id: uid(), createdAt: now(), studentId: sid }; state.songs.push(s); save(); return s; },
      async remove(id) { state.songs = state.songs.filter((s) => s.id !== id); save(); },
    },
  };
}
