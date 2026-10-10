import { scoreRound, type StatusMap } from "@notenkraker/core";
import type { NotenkrakerClient, Profile, Round, Song, Student, StudentNote } from "./types.js";

/**
 * In-memory/localStorage-implementatie van hetzelfde contract. Voor
 * ontwikkeling zonder Supabase, voor tests, en als fallback wanneer er geen
 * verbinding is. Eén "ouder"-profiel (kinderen onder één login), geen echte auth.
 */
export function createLocalNotenkraker(storageKey = "notenkraker-local"): NotenkrakerClient {
  type State = { students: Student[]; notes: StudentNote[]; rounds: Round[]; songs: Array<Song & { studentId: string }> };
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
  const profile: Profile = { id: "local", role: "ouder", displayName: "Lokaal" };
  const authListeners = new Set<(p: Profile | null) => void>();

  return {
    auth: {
      async signInWithPassword() { authListeners.forEach((cb) => cb(profile)); },
      async signUpWithPassword() { authListeners.forEach((cb) => cb(profile)); },
      async signInWithGoogle() { authListeners.forEach((cb) => cb(profile)); },
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
        const r: Round = { id: uid(), studentId: sub.studentId, mode: sub.mode, ms: sub.ms, playedAt: now(), answers: sub.answers, ...scoreRound({ mode: sub.mode, lives: 3, ms: sub.ms, answers: sub.answers }, statuses) };
        state.rounds.unshift(r); save(); return r;
      },
      async recent(sid, limit = 6) { return state.rounds.filter((r) => r.studentId === sid).slice(0, limit); },
      async progress(sid) {
        const rs = state.rounds.filter((r) => r.studentId === sid);
        return { xp: rs.reduce((s, r) => s + r.xp, 0), streakDays: 0, rounds: rs.length, weakNotes: [], promotionCandidates: [] };
      },
    },
    songs: {
      async list(sid) { return state.songs.filter((s) => s.studentId === sid); },
      async create(sid, song) { const s = { ...song, id: uid(), createdAt: now(), studentId: sid }; state.songs.push(s); save(); return s; },
      async remove(id) { state.songs = state.songs.filter((s) => s.id !== id); save(); },
    },
  };
}
