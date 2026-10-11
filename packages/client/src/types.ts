import type { AgeBand, Experience, NoteId, NoteStatus, RoundResult } from "@notenkraker/core";

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
  /** mag feedback geven (AC-116); zet alleen een admin */
  canGiveFeedback?: boolean;
}

/** feedback van een gebruiker (AC-116); alleen een admin leest het */
export type FeedbackKind = "idee" | "fout" | "vraag";
export type FeedbackStatus = "nieuw" | "bekeken" | "linear" | "klaar";
export interface FeedbackInput { kind: FeedbackKind; message: string; screen: string; url: string; device: string; version: string }
export interface Feedback extends FeedbackInput {
  id: string;
  userId: string | null;
  displayName: string;
  role: Role | null;
  status: FeedbackStatus;
  linearUrl: string | null;
  createdAt: string;
}
export interface AdminUser { id: string; displayName: string; email: string; role: Role | null; canGiveFeedback: boolean; createdAt: string }

export interface Student {
  id: string;
  name: string;
  instrumentId: string;
  naming: "nl" | "en";
  /** auth user van de leerling zelf, als die een eigen login heeft */
  userId?: string | null;
  createdAt: string;
  /** uit de kennismaking (AC-115); null = niet ingevuld */
  ageBand?: AgeBand | null;
  experience?: Experience | null;
  /** kennismaking afgerond of overgeslagen; null = nog vragen */
  onboardedAt?: string | null;
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

/**
 * Huiswerk van een ouder of leraar (AC-113). Ieder geeft zijn eigen huiswerk; per gever telt het
 * nieuwste. dueDate is jjjj-mm-dd; naam en rol van de gever staan erbij, want een leerling mag
 * hun profielen niet lezen.
 */
export interface Homework {
  id: string;
  studentId: string;
  givenBy: string;
  givenByRole: "ouder" | "leraar";
  givenByName: string;
  createdAt: string;
  dueDate: string;
  minutesPerDay: number;
  daysPerWeek: number;
  notes: NoteId[];
  piece: string;
  pieceNote: string;
  remark: string;
}
export type HomeworkInput = Pick<Homework, "studentId" | "dueDate" | "minutesPerDay" | "daysPerWeek" | "notes" | "piece" | "pieceNote" | "remark">;

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
  update(id: string, patch: Partial<Pick<Student, "name" | "instrumentId" | "naming" | "ageBand" | "experience" | "onboardedAt">>): Promise<Student>;
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

export interface HomeworkApi {
  /** nieuwste eerst, ook ouder huiswerk */
  list(studentId: string, limit?: number): Promise<Homework[]>;
  /** alleen een ouder (eigenaar) of gekoppelde leraar; de noten komen op "in de les" */
  give(input: HomeworkInput): Promise<Homework>;
}

export interface FeedbackApi {
  /** alleen als het profiel canGiveFeedback heeft */
  send(input: FeedbackInput): Promise<void>;
  /** alleen voor een admin; nieuwste eerst */
  list(): Promise<Feedback[]>;
  setStatus(id: string, status: FeedbackStatus, linearUrl?: string | null): Promise<void>;
}

/** beheer, alleen voor een admin */
export interface AdminApi {
  users(): Promise<AdminUser[]>;
  setFeedbackAllowed(userId: string, allowed: boolean): Promise<void>;
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
  homework: HomeworkApi;
  feedback: FeedbackApi;
  admin: AdminApi;
  songs: SongsApi;
}
