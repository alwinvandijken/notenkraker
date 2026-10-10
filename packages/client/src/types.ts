import type { NoteId, NoteStatus, RoundResult } from "@notenkraker/core";

/**
 * Het contract tussen frontends en backend. Elke frontend praat alleen met
 * `NotenkrakerClient`; wat erachter zit (Supabase, lokaal, mock) is inwisselbaar.
 * Houd dit gelijk aan packages/api/openapi.yaml.
 */

export type Role = "leerling" | "leraar";

export interface Profile {
  id: string;          // auth user id
  role: Role;
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
  signUpWithPassword(email: string, password: string, role: Role, displayName: string): Promise<void>;
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
  inviteCode(studentId: string): Promise<string>;
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
  songs: SongsApi;
}
