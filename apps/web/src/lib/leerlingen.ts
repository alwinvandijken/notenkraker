import type { Homework, HomeworkStatus } from "@notenkraker/client";

/**
 * De leerlingentabel van de leraar op de desktop (AC-117): één rij per leerling, te sorteren en te
 * filteren. "Status" sorteert zoals het overzicht: loopt achter, even opletten, geen huiswerk, gaat goed.
 */
export interface TableRow {
  id: string;
  name: string;
  /** geoefende minuten deze week (laatste 7 dagen) */
  weekMinutes: number;
  /** doel van het eigen huiswerk (minuten per dag × dagen), of null zonder eigen huiswerk */
  goalMinutes: number | null;
  status: HomeworkStatus | "geen";
  /** einddatum van het eigen huiswerk, jjjj-mm-dd */
  due: string | null;
  known: number;
  daysSinceLast: number | null;
  /** huiswerk van anderen (bijv. de ouder), voor de avatars */
  others: Homework[];
}
export type SortKey = "name" | "weekMinutes" | "status" | "due" | "known" | "daysSinceLast";
export type StatusFilter = HomeworkStatus | "geen" | "alle";

const STATUS_ORDER = { achter: 0, opletten: 1, geen: 2, goed: 3 } as const;

export function sortRows(rows: TableRow[], key: SortKey, dir: "asc" | "desc"): TableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (r: TableRow): string | number | null =>
    key === "name" ? r.name.toLocaleLowerCase("nl") : key === "status" ? STATUS_ORDER[r.status] : r[key];
  return [...rows].sort((a, b) => {
    const va = value(a), vb = value(b);
    // leeg (nooit geoefend, geen einddatum) altijd achteraan
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    const c = typeof va === "string" ? va.localeCompare(vb as string, "nl") : va - (vb as number);
    return c * sign || a.name.localeCompare(b.name, "nl");
  });
}

export function filterRows(rows: TableRow[], status: StatusFilter, query: string): TableRow[] {
  const q = query.trim().toLocaleLowerCase("nl");
  return rows.filter((r) => (status === "alle" || r.status === status) && (!q || r.name.toLocaleLowerCase("nl").includes(q)));
}
