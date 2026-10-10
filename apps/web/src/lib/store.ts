import { create } from "zustand";
import type { StatusMap } from "@notenkraker/core";
import type { Profile, Student } from "@notenkraker/client";
import { client } from "./client";
import { clearInvite, koppelFout, pendingInvite } from "./koppel";

interface AppState {
  profile: Profile | null | undefined; // undefined = nog onbekend
  students: Student[];
  studentId: string | null;
  statuses: StatusMap;
  mode: "learn" | "game";
  /** uitkomst van koppelen via link of code, voor een melding bovenaan */
  koppelMelding: { ok: boolean; text: string } | null;
  init(): Promise<void>;
  /** koppelt een ingelogd kind met de code uit een uitnodigingslink, als die er is */
  claimPendingInvite(): Promise<void>;
  claimByCode(code: string): Promise<boolean>;
  dismissKoppelMelding(): void;
  refreshProfile(): Promise<void>;
  loadStudents(): Promise<void>;
  selectStudent(id: string | null): void;
  setStatus(noteId: string, status: StatusMap[string] | null): Promise<void>;
  setMode(m: AppState["mode"]): void;
}

let unsubNotes: (() => void) | null = null;
/** alleen de laatst gestarte loadStudents telt; een eerdere kan later binnenkomen (bijv. tijdens koppelen) */
let loadSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  profile: undefined,
  students: [],
  studentId: null,
  statuses: {},
  mode: (localStorage.getItem("nk.mode") as AppState["mode"]) || "learn",
  koppelMelding: null,

  async init() {
    const profile = await client.auth.currentProfile();
    set({ profile });
    client.auth.onAuthChange((p) => {
      set({ profile: p });
      if (p) void get().claimPendingInvite().then(() => get().loadStudents());
      else set({ students: [], studentId: null, statuses: {} });
    });
    if (profile) { await get().claimPendingInvite(); await get().loadStudents(); }
  },

  async claimPendingInvite() {
    const code = pendingInvite(localStorage);
    if (!code || !get().profile) return;
    clearInvite(localStorage); // eerst wissen: init en onAuthChange kunnen tegelijk komen
    await get().claimByCode(code);
  },

  async claimByCode(code) {
    try {
      const s = await client.students.claimByCode(code);
      localStorage.setItem("nk.student", s.id);
      set({ koppelMelding: { ok: true, text: `Gekoppeld! Je oefent nu met ${s.name}, het profiel van je ouder. Je ouder ziet je voortgang.` } });
      await get().refreshProfile();
      return true;
    } catch (err) {
      set({ koppelMelding: { ok: false, text: koppelFout(err) } });
      return false;
    }
  },

  dismissKoppelMelding() { set({ koppelMelding: null }); },

  async refreshProfile() {
    const profile = await client.auth.currentProfile();
    set({ profile });
    if (profile) await get().loadStudents();
  },

  async loadStudents() {
    const seq = ++loadSeq;
    const students = await client.students.list();
    if (seq !== loadSeq) return;
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
