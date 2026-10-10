// POST /rounds — ronde inleveren. De server is de waarheid voor sterren en XP.
// Scoreregels: zelfde code als packages/core/src/game (gekopieerd, Deno kan het
// workspace-pakket niet importeren; houd gelijk — zie CI-check in docs).
import { clients, cors, json } from "../_shared/supabase.ts";

type Answer = { expected: string; given: string | null; correct: boolean };
const WEIGHT_XP = (st: string | undefined) => (st === "les" || st === "moet" ? 20 : 10);

function scoreRound(answers: Answer[], lives: number, statuses: Record<string, string>) {
  const mistakes = answers.filter((a) => !a.correct).length;
  const completed = mistakes < lives;
  const stars = !completed ? 0 : mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
  let xp = 0;
  for (const a of answers) if (a.correct) xp += WEIGHT_XP(statuses[a.expected]);
  if (completed && mistakes === 0) xp += 50;
  return { completed, mistakes, stars, xp, wrongNotes: answers.filter((a) => !a.correct).map((a) => a.expected) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { user, service } = clients(req);
  const body = await req.json();
  const { studentId, mode, ms, answers } = body as { studentId: string; mode: string; ms: number; answers: Answer[] };
  if (!studentId || !Array.isArray(answers)) return json({ error: "ongeldige ronde" }, 400);

  // RLS controleert of de aanroeper bij deze leerling mag
  const { data: student } = await user.from("students").select("id, age_band").eq("id", studentId).maybeSingle();
  if (!student) return json({ error: "geen toegang" }, 403);
  // levens per leeftijdsgroep, zoals core/learner.ageProfile: 6–8 jaar 4, anders 3 (AC-115)
  const lives = student.age_band === "6-8" ? 4 : 3;

  const { data: notes } = await service.from("student_notes").select("note_id,status").eq("student_id", studentId);
  const statuses = Object.fromEntries((notes ?? []).map((n) => [n.note_id, n.status]));
  const score = scoreRound(answers, lives, statuses);

  const { data: round, error } = await service.from("rounds").insert({
    student_id: studentId, mode, ms, answers,
    completed: score.completed, mistakes: score.mistakes, stars: score.stars, xp: score.xp, wrong_notes: score.wrongNotes,
  }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ round });
});
