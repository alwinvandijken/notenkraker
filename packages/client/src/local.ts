import { lessonPeriod } from "./homework.js";
import { ageProfile, scoreRound, type StatusMap } from "@notenkraker/core";
import type { BankTask, Book, Homework, HomeworkTask, HomeworkTemplate, NotenkrakerClient, PracticeSession, Profile, Round, Song, Student, StudentNote } from "./types.js";

/**
 * In-memory/localStorage-implementatie van hetzelfde contract. Voor
 * ontwikkeling zonder Supabase, voor tests, en als fallback wanneer er geen
 * verbinding is, en voor de route zonder account (/oefenen, rol "leerling"). Eén profiel
 * (standaard "ouder": kinderen onder één login), geen echte auth.
 */
export function createLocalNotenkraker(storageKey = "notenkraker-local", opts: { role?: Profile["role"]; displayName?: string } = {}): NotenkrakerClient {
  type State = { students: Student[]; notes: StudentNote[]; rounds: Round[]; practice?: PracticeSession[]; homework?: Homework[]; templates?: HomeworkTemplate[]; books?: Book[]; bank?: BankTask[]; songs: Array<Song & { studentId: string }> };
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
      async list(sid, limit = 20) { return (state.homework ?? []).filter((h) => h.studentId === sid).slice(0, limit); },
      async give(input) {
        const h: Homework = { startDate: now().slice(0, 10), ...input, id: uid(), givenBy: profile.id, givenByRole: profile.role === "leraar" ? "leraar" : "ouder", givenByName: profile.displayName, createdAt: now(), tasks: [] };
        (state.homework ??= []).unshift(h);
        for (const n of input.notes) {
          if (!state.notes.some((x) => x.studentId === input.studentId && x.noteId === n && x.status === "kent")) {
            state.notes = state.notes.filter((x) => !(x.studentId === input.studentId && x.noteId === n));
            state.notes.push({ studentId: input.studentId, noteId: n, status: "les", updatedAt: now() });
          }
        }
        save(); emit(input.studentId); return h;
      },
      async giveMany(ids, input) {
        for (const sid of ids) await this.give({ ...input, studentId: sid });
        return ids.length;
      },
      async templates() { return [...(state.templates ?? [])].sort((a, b) => a.name.localeCompare(b.name)); },
      async saveTemplate(t) { const x = { ...t, id: uid() }; (state.templates ??= []).push(x); save(); return x; },
      async removeTemplate(id) { state.templates = (state.templates ?? []).filter((t) => t.id !== id); save(); },
      async giveWithTasks(ids, input, tasks) {
        for (const sid of ids) {
          const h = await this.give({ ...input, studentId: sid, piece: "", pieceNote: "" });
          h.tasks = tasks.map((t, i): HomeworkTask => {
            const b = state.books?.find((x) => x.id === t.bookId);
            return { id: uid(), homeworkId: h.id, position: i, kind: t.kind, title: t.title, bookTitle: b?.title ?? "", bookAuthor: b?.author ?? "",
              page: t.page, chapter: t.chapter, number: t.number, track: t.track, doneAt: null,
              sheetPath: null, sheetName: "", examplePath: null, recording: t.kind === "stuk" && !!t.recording, recordings: [] };
          });
        }
        save(); return ids.length;
      },
      async giveForLesson(ids, which, input, tasks) {
        for (const sid of ids) {
          const st = state.students.find((x) => x.id === sid);
          const per = lessonPeriod(st?.lessonWeekday, which);
          const today = now().slice(0, 10);
          const prev = (state.homework ?? []).find((h) => h.studentId === sid && h.givenBy === profile.id && h.dueDate >= today
            && (which === "deze" ? h.startDate <= today : h.startDate > today));
          if (prev) {
            prev.notes = [...new Set([...prev.notes, ...input.notes])];
            await this.update(prev.id, { ...prev, startDate: prev.startDate }, [...prev.tasks.map((t) => ({ ...t, id: t.id, bookId: null })), ...tasks]);
          } else {
            await this.giveWithTasks([sid], { ...input, dueDate: per.due }, tasks);
            const h = state.homework?.find((x) => x.studentId === sid);
            if (h) h.startDate = per.start;
          }
        }
        save(); return ids.length;
      },
      async update(homeworkId, input, tasks) {
        const h = state.homework?.find((x) => x.id === homeworkId);
        if (!h) throw new Error("onbekend huiswerk");
        Object.assign(h, { notes: input.notes, minutesPerDay: input.minutesPerDay, daysPerWeek: input.daysPerWeek, remark: input.remark, startDate: input.startDate, dueDate: input.dueDate });
        const old = h.tasks ?? [];
        h.tasks = tasks.map((t, i): HomeworkTask => {
          const prev = old.find((x) => x.id === t.id);
          const b = state.books?.find((x) => x.id === t.bookId);
          return { id: prev?.id ?? uid(), homeworkId, position: i, kind: t.kind, title: t.title, bookTitle: b?.title ?? prev?.bookTitle ?? "", bookAuthor: b?.author ?? prev?.bookAuthor ?? "",
            page: t.page, chapter: t.chapter, number: t.number, track: t.track, doneAt: prev?.doneAt ?? null,
            sheetPath: null, sheetName: "", examplePath: null, recording: t.kind === "stuk" && !!t.recording, recordings: prev?.recordings ?? [] };
        });
        save(); emit(h.studentId);
      },
      async end(homeworkId) {
        const h = state.homework?.find((x) => x.id === homeworkId);
        if (!h) return;
        const d = new Date(); d.setDate(d.getDate() - 1);
        h.dueDate = d.toISOString().slice(0, 10); save(); emit(h.studentId);
      },
      async submitRecording() { throw new Error("niet beschikbaar zonder backend"); },
      async reactToRecording() { throw new Error("niet beschikbaar zonder backend"); },
      async deleteRecording() { throw new Error("niet beschikbaar zonder backend"); },
      async setTaskDone(taskId, done) {
        for (const h of state.homework ?? []) for (const t of h.tasks ?? []) if (t.id === taskId) t.doneAt = done ? now() : null;
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
