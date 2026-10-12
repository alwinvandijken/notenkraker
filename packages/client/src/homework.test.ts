import { describe, expect, it } from "vitest";
import { allCategories, recordingKeptUntil, currentHomework, upcomingHomework, lessonPeriod, dueLabel, homeworkProgress, taskReference, worstStatus } from "./homework.js";
import type { Homework, PracticeSession, Round } from "./types.js";

// Zaterdag 10 oktober 2026, 16:00 lokale tijd
const now = new Date(2026, 9, 10, 16, 0);
const at = (daysAgo: number, hour = 15) => new Date(2026, 9, 10 - daysAgo, hour, 0).toISOString();
const day = (offset: number) => { const d = new Date(2026, 9, 10 + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function hw(opts: Partial<Homework> = {}): Homework {
  return {
    id: "h1", studentId: "s1", givenBy: "marieke", givenByRole: "leraar", givenByName: "Marieke",
    createdAt: at(1, 17), startDate: day(-1), dueDate: day(6), minutesPerDay: 20, daysPerWeek: 5,
    notes: ["d4"], piece: "Toonladder G", pieceNote: "", remark: "", tasks: [], ...opts,
  };
}
const round = (daysAgo: number, minutes: number): Round => ({
  id: `r${daysAgo}-${minutes}`, studentId: "s1", mode: "buttons", ms: minutes * 60_000, playedAt: at(daysAgo),
  answers: [], completed: true, mistakes: 0, stars: 3, xp: 10, wrongNotes: [],
});
const session = (daysAgo: number, minutes: number): PracticeSession => ({
  id: `p${daysAgo}-${minutes}`, studentId: "s1", startedAt: at(daysAgo, 10), endedAt: at(daysAgo, 11), done: true,
  playedSeconds: minutes * 60, minutes: [], notes: [], label: "sax",
});

describe("currentHomework", () => {
  it("toont al het lopende huiswerk, ook twee van dezelfde gever (nieuwste eerst)", () => {
    const oud = hw({ id: "oud", createdAt: at(8), dueDate: day(0) });
    const nieuw = hw({ id: "nieuw" });
    expect(currentHomework([oud, nieuw], now).map((h) => h.id)).toEqual(["nieuw", "oud"]);
  });

  it("toont huiswerk van leraar en ouder naast elkaar", () => {
    const ouder = hw({ id: "ouder", givenBy: "olaf", givenByRole: "ouder", givenByName: "Olaf" });
    expect(currentHomework([hw(), ouder], now).map((h) => h.id).sort()).toEqual(["h1", "ouder"]);
  });

  it("huiswerk voor de volgende les telt pas vanaf de startdatum", () => {
    const volgende = hw({ id: "volgende", startDate: day(3), dueDate: day(9) });
    expect(currentHomework([hw(), volgende], now).map((h) => h.id)).toEqual(["h1"]);
    expect(upcomingHomework([hw(), volgende], now).map((h) => h.id)).toEqual(["volgende"]);
  });

  it("laat verlopen huiswerk weg, maar huiswerk dat vandaag afloopt niet", () => {
    expect(currentHomework([hw({ dueDate: day(-1) })], now)).toEqual([]);
    expect(currentHomework([hw({ dueDate: day(0) })], now)).toHaveLength(1);
  });
});

describe("homeworkProgress", () => {
  it("telt een dag als gehaald als spel en vrij oefenen samen het dagdoel halen", () => {
    const p = homeworkProgress(hw(), { rounds: [round(1, 10)], sessions: [session(1, 10), session(0, 5)], now });
    expect(p.doneDays).toBe(1);
    expect(p.todayMinutes).toBe(5);
  });

  it("geeft per dag van gegeven tot einddatum een bolletje", () => {
    const p = homeworkProgress(hw(), { rounds: [round(1, 20), round(0, 12)], sessions: [], now });
    expect(p.days.map((d) => d.state)).toEqual(["ok", "half", "future", "future", "future", "future", "future", "future"]);
    expect(p.days[1]!.today).toBe(true);
  });

  it("vraagt over een week zoveel dagen als de dagen per week", () => {
    expect(homeworkProgress(hw({ createdAt: at(0, 9), dueDate: day(7) }), { rounds: [], sessions: [], now }).goalDays).toBe(5);
    expect(homeworkProgress(hw({ createdAt: at(0, 9), dueDate: day(14) }), { rounds: [], sessions: [], now }).goalDays).toBe(10);
    expect(homeworkProgress(hw({ createdAt: at(0, 9), dueDate: day(2), daysPerWeek: 7 }), { rounds: [], sessions: [], now }).goalDays).toBe(2);
  });

  it("gaat goed als er nog genoeg dagen over zijn", () => {
    expect(homeworkProgress(hw(), { rounds: [], sessions: [], now }).status).toBe("goed");
  });

  it("is even opletten als elke dag die nog over is moet gebeuren", () => {
    // gegeven gisteren, elke dag: 5 dagen nodig, nog 5 dagen over (vandaag t/m over 4 dagen)
    const p = homeworkProgress(hw({ dueDate: day(4), daysPerWeek: 7 }), { rounds: [], sessions: [], now });
    expect(p.status).toBe("opletten");
  });

  it("loopt achter als het doel niet meer te halen is", () => {
    // 6 dagen geleden gegeven, 5 dagen nodig, niets gedaan, nog 2 dagen over
    expect(homeworkProgress(hw({ createdAt: at(6), dueDate: day(1) }), { rounds: [], sessions: [], now }).status).toBe("achter");
  });

  it("gaat goed zodra het doel gehaald is, ook vandaag nog", () => {
    const p = homeworkProgress(hw({ daysPerWeek: 2, dueDate: day(0), createdAt: at(6) }), { rounds: [round(3, 20), round(0, 25)], sessions: [], now });
    expect(p.doneDays).toBe(2);
    expect(p.status).toBe("goed");
  });

  it("telt vandaag niet als resterende dag als vandaag al gehaald is", () => {
    // 5 nodig, 1 gehaald (vandaag), nog over: morgen t/m over 4 dagen = 4 → precies genoeg
    const p = homeworkProgress(hw({ dueDate: day(4), daysPerWeek: 7 }), { rounds: [round(0, 20)], sessions: [], now });
    expect(p.daysLeft).toBe(4);
    expect(p.status).toBe("opletten");
  });
});

describe("dueLabel", () => {
  it("zegt vandaag, morgen, de dag van de week of de datum", () => {
    expect(dueLabel(day(0), now)).toBe("vandaag");
    expect(dueLabel(day(1), now)).toBe("morgen");
    expect(dueLabel(day(6), now)).toBe("vr");
    expect(dueLabel(day(8), now)).toBe("18 okt");
  });
});

describe("worstStatus", () => {
  it("geeft de slechtste status, of geen als er geen huiswerk is", () => {
    expect(worstStatus(["goed", "achter", "opletten"])).toBe("achter");
    expect(worstStatus(["goed", "opletten"])).toBe("opletten");
    expect(worstStatus([])).toBe("geen");
  });
});

describe("taskReference", () => {
  it("noemt boek, hoofdstuk, bladzijde, nummer en track, alleen wat er is", () => {
    expect(taskReference({ bookTitle: "Saxofoon Methode 1", chapter: "4", page: "23", number: "12", track: "17" }))
      .toBe("Saxofoon Methode 1 · hoofdstuk 4 · blz. 23 · nr. 12 · track 17");
    expect(taskReference({ bookTitle: "Methode 2", chapter: "", page: "8", number: "", track: "" })).toBe("Methode 2 · blz. 8");
    expect(taskReference({ bookTitle: "", chapter: "", page: "", number: "", track: "" })).toBe("");
  });
});

describe("allCategories", () => {
  it("begint met de vaste lijst en voegt eigen categorieën toe, zonder dubbele", () => {
    expect(allCategories([["Toonladders", "Kerst"], ["kerst", "Duetten"]]))
      .toEqual(["Toonladders", "Etudes", "Liedjes", "Theorie", "Techniek", "Kerst", "Duetten"]);
  });
});

describe("recordingKeptUntil", () => {
  it("bewaart een opname tot 4 weken na de einddatum", () => {
    expect(recordingKeptUntil("2026-10-16")).toBe("2026-11-13");
    expect(recordingKeptUntil("2026-12-20")).toBe("2027-01-17");
  });
});

describe("lessonPeriod", () => {
  // now = zaterdag 10 oktober 2026
  it("zonder lesdag: deze les vanaf vandaag, de volgende een week later", () => {
    expect(lessonPeriod(null, "deze", now)).toEqual({ start: day(0), due: day(6) });
    expect(lessonPeriod(null, "volgende", now)).toEqual({ start: day(7), due: day(13) });
  });
  it("met lesdag dinsdag: deze les liep vanaf dinsdag, de volgende begint komende dinsdag", () => {
    expect(lessonPeriod(2, "deze", now)).toEqual({ start: day(-4), due: day(2) });
    expect(lessonPeriod(2, "volgende", now)).toEqual({ start: day(3), due: day(9) });
  });
  it("op de lesdag zelf begint deze les vandaag", () => {
    expect(lessonPeriod(6, "deze", now)).toEqual({ start: day(0), due: day(6) });
  });
});
