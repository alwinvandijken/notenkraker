import { childSummary } from "@notenkraker/client";
import { client } from "@/lib/client";
import { withProgress, type CurrentHomework } from "@/components/Huiswerk";
import { todayGoal } from "@/lib/vandaag";

export interface TodayData { items: CurrentHomework[]; today: number; goal: number; streak: number }

/** huiswerk, minuten van vandaag en dagen op rij; voor Vandaag en het resultaat van Spelen (AC-120) */
export async function loadToday(studentId: string, { withHomework, dailyGoal }: { withHomework: boolean; dailyGoal: number }): Promise<TodayData> {
  const [list, rounds, sessions] = await Promise.all([
    withHomework ? client.homework.list(studentId).catch(() => []) : Promise.resolve([]),
    client.rounds.recent(studentId, 200), client.practice.recent(studentId, 50),
  ]);
  const summary = childSummary({ rounds, sessions, statuses: {}, noteIds: [] });
  const items = withProgress(list, rounds, sessions);
  return { items, streak: summary.streak, ...todayGoal(items, { summaryToday: summary.days[6]!.minutes, dailyGoal }) };
}
