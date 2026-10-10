import { create } from "zustand";
import type { StatusMap } from "@notenkraker/core";
import type { Profile, Student } from "@notenkraker/client";
import { client } from "./client";

interface AppState {
  profile: Profile | null | undefined; // undefined = nog onbekend
  students: Student[];
  studentId: string | null;
  statuses: StatusMap;
  mode: "learn" | "game";
  init(): Promise<void>;
  refreshProfile(): Promise<void>;
  loadStudents(): Promise<void>;
  selectStudent(id: string | null): void;
  setStatus(noteId: string, status: StatusMap[string] | null): Promise<void>;
  setMode(m: AppState["mode"]): void;
}

let unsubNotes: (() => void) | null = null;

export const useApp = create<AppState>((set, get) => ({
  profile: undefined,
  students: [],
  studentId: null,
  statuses: {},
  mode: (localStorage.getItem("nk.mode") as AppState["mode"]) || "learn",

  async init() {
    const profile = await client.auth.currentProfile();
    set({ profile });
    client.auth.onAuthChange((p) => { set({ profile: p }); if (p) void get().loadStudents(); else set({ students: [], studentId: null, statuses: {} }); });
    if (profile) await get().loadStudents();
  },

  async refreshProfile() {
    const profile = await client.auth.currentProfile();
    set({ profile });
    if (profile) await get().loadStudents();
  },

  async loadStudents() {
    const students = await client.students.list();
    set({ students });
    const remembered = localStorage.getItem("nk.student");
    const pick = students.find((s) => s.id === remembered) ?? students[0] ?? null;
    get().selectStudent(pick?.id ?? null);
  },

  selectStudent(id) {
    unsubNotes?.(); unsubNotes = null;
    set({ studentId: id, statuses: {} });
    localStorage.setItem("nk.student", id ?? "");
    if (!id) return;
    unsubNotes = client.notes.subscribe(id, (notes) => set({ statuses: Object.fromEntries(notes.map((n) => [n.noteId, n.status])) }));
  },

  async setStatus(noteId, status) {
    const { studentId, statuses } = get();
    if (!studentId) return;
    const next = { ...statuses };
    if (status) next[noteId] = status; else delete next[noteId];
    set({ statuses: next }); // optimistisch
    await client.notes.setStatus(studentId, noteId, status);
  },

  setMode(m) { localStorage.setItem("nk.mode", m); set({ mode: m }); },
}));
