import type { NoteId, NoteStatus, RoundResult } from "@notenkraker/core";

/**
 * Het contract tussen frontends en backend. Elke frontend praat alleen met
 * `NotenkrakerClient`; wat erachter zit (Supabase, lokaal, mock) is inwisselbaar.
 * Houd dit gelijk aan packages/api/openapi.yaml.
 */

/** leerling en ouder kies je zelf; leraar en admin worden toegewezen (zie docs/ARCHITECTURE.md) */
export type Role = "leerling" | "ouder" | "leraar" | "admin";
/** rollen die een gebruiker zelf mag kiezen */
export type SelfRole = Extract<Role, "leerling" | "ouder">;
/** waarvoor een uitnodigingscode is: een leraar koppelen of het kind zelf laten inloggen */
export type InvitePurpose = "leraar" | "kind";

export interface Profile {
  id: string;          // auth user id
  /** null = nog geen rol gekozen (eerste Google-login) */
  role: Role | null;
  displayName: string;
  email?: string;
}

export interface Student {
  id: string;
  name: string;
  instrumentId: string;
  naming: "nl" | "en";
  /** auth user van de leerling zelf, als die een eigen login heeft */
  userId?: string | null;
  createdAt: string;
}

export interface StudentNote { studentId: string; noteId: NoteId; status: NoteStatus; updatedAt: string }

export interface RoundSubmission {
  studentId: string;
  mode: "buttons" | "mic";
  ms: number;
  answers: Array<{ expected: NoteId; given: NoteId | null; correct: boolean }>;
}

export interface Round extends RoundResult {
  id: string;
  studentId: string;
  mode: "buttons" | "mic";
  ms: number;
  playedAt: string;
  answers: RoundSubmission["answers"];
}

/** vrij oefenen met de oefentimer (AC-112); start en einde zijn de tijd van de server */
export interface PracticeMinute { s: number; notes: NoteId[] }
export interface PracticeSession {
  id: string;
  studentId: string;
  startedAt: string;
  endedAt: string;
  done: boolean;
  playedSeconds: number;
  minutes: PracticeMinute[];
  notes: NoteId[];
  /** twijfel: minuten lang steeds dezelfde noot */
  label: "sax" | "twijfel";
}

export interface SongNote { id?: NoteId; rest?: boolean; duration: "1" | "2" | "4" | "8" | "16" }
export interface Song {
  id: string;
  title: string;
  instrumentId: string;
  source: "manual" | "chat" | "omr";
  notes: SongNote[];
  createdAt: string;
}

export interface Progress {
  xp: number;
  streakDays: number;
  rounds: number;
  weakNotes: Array<{ noteId: NoteId; wrong: number; asked: number }>;
  promotionCandidates: NoteId[];
}

export interface AuthApi {
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string, role: SelfRole, displayName: string): Promise<void>;
  /** eenmalig na de eerste Google-login */
  chooseRole(role: SelfRole): Promise<void>;
  signInWithGoogle(redirectTo?: string): Promise<void>;
  signOut(): Promise<void>;
  currentProfile(): Promise<Profile | null>;
  onAuthChange(cb: (profile: Profile | null) => void): () => void;
}

export interface StudentsApi {
  list(): Promise<Student[]>;
  create(input: { name: string; instrumentId: string; naming?: "nl" | "en" }): Promise<Student>;
  update(id: string, patch: Partial<Pick<Student, "name" | "instrumentId" | "naming">>): Promise<Student>;
  remove(id: string): Promise<void>;
  /** leraar koppelt een leerling via uitnodigingscode */
  linkByCode(code: string): Promise<Student>;
  /** kind met eigen login koppelt zich aan het leerlingprofiel dat de ouder aanmaakte */
  claimByCode(code: string): Promise<Student>;
  inviteCode(studentId: string, purpose?: InvitePurpose): Promise<string>;
}

export interface NotesApi {
  list(studentId: string): Promise<StudentNote[]>;
  setStatus(studentId: string, noteId: NoteId, status: NoteStatus | null): Promise<void>;
  subscribe(studentId: string, cb: (notes: StudentNote[]) => void): () => void;
}

export interface RoundsApi {
  submit(round: RoundSubmission): Promise<Round>;
  recent(studentId: string, limit?: number): Promise<Round[]>;
  progress(studentId: string): Promise<Progress>;
}

export interface PracticeApi {
  start(studentId: string): Promise<PracticeSession>;
  /** tijdens het oefenen elke halve minuut, en met done: true bij Klaar */
  update(id: string, input: { minutes: PracticeMinute[]; notes: NoteId[]; done?: boolean }): Promise<PracticeSession>;
  recent(studentId: string, limit?: number): Promise<PracticeSession[]>;
}

export interface SongsApi {
  list(studentId: string): Promise<Song[]>;
  create(studentId: string, song: Omit<Song, "id" | "createdAt">): Promise<Song>;
  remove(id: string): Promise<void>;
}

export interface NotenkrakerClient {
  auth: AuthApi;
  students: StudentsApi;
  notes: NotesApi;
  rounds: RoundsApi;
  practice: PracticeApi;
  songs: SongsApi;
}
