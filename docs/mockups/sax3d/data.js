// Gedeelde gegevens voor de 3D-sax-mock-ups. Grepen en klepnamen uit packages/instruments/src/altsax.json.
export const FINGERINGS = {"bes3":[["L1","L2","L3","R4","R5","R6","lc","lbb"]],"b3":[["L1","L2","L3","R4","R5","R6","lc","lb"]],"c4":[["L1","L2","L3","R4","R5","R6","lc"]],"cis4":[["L1","L2","L3","R4","R5","R6","lc","cs"]],"d4":[["L1","L2","L3","R4","R5","R6"]],"es4":[["L1","L2","L3","R4","R5","R6","eb"]],"e4":[["L1","L2","L3","R4","R5"]],"f4":[["L1","L2","L3","R4"]],"fis4":[["L1","L2","L3","R5"]],"g4":[["L1","L2","L3"]],"gis4":[["L1","L2","L3","gs"]],"a4":[["L1","L2"]],"bes4":[["L1","bis"],["L1","R4"]],"b4":[["L1"]],"c5":[["L2"],["L1","sC"]],"cis5":[[]],"d5":[["oct","L1","L2","L3","R4","R5","R6"]],"es5":[["oct","L1","L2","L3","R4","R5","R6","eb"]],"e5":[["oct","L1","L2","L3","R4","R5"]],"f5":[["oct","L1","L2","L3","R4"]],"fis5":[["oct","L1","L2","L3","R5"]],"g5":[["oct","L1","L2","L3"]],"gis5":[["oct","L1","L2","L3","gs"]],"a5":[["oct","L1","L2"]],"bes5":[["oct","L1","bis"]],"b5":[["oct","L1"]],"c6":[["oct","L2"]],"cis6":[["oct"]],"d6":[["oct","pD"]],"es6":[["oct","pD","pEb"]],"e6":[["oct","pD","pEb","sE"],["oct","fF","L2","L3"]],"f6":[["oct","pD","pEb","pF","sE"],["oct","fF","L2"]]};
export const KEY_NAMES = {"oct":"octaafklep (duim links)","fF":"voorste F-klep","L1":"1","L2":"2","L3":"3","R4":"4","R5":"5","R6":"6","bis":"bis-knopje","gs":"G♯-klep (pink links)","cs":"C♯-klep (pink links)","lb":"lage B-klep (pink links)","lbb":"lage B♭-klep (pink links)","low":"lage klep (pink links)","eb":"E♭-klep (pink rechts)","lc":"lage C-klep (pink rechts)","pD":"handpalmklep D","pEb":"handpalmklep E♭","pF":"handpalmklep F","sE":"zijklep E (rechts)","sC":"zijklep C (rechts)","sBb":"zijklep B♭ (rechts)"};
// "optional" alleen als de huidige greep ze gebruikt. "Toon alle kleppen" laat alles zien.
export const AUTO = new Set(["bis", "gs", "cs", "lb", "lbb", "eb", "lc"]);
export const OPTIONAL = new Set(["fF", "pD", "pEb", "pF", "sE", "sC", "sBb"]);
// Voorbeeldleerlingen; in de app komen notenstatus en leeftijdsgroep uit het profiel van de ingelogde leerling.
export const LEARNERS = {
  sanne: { name: "Sanne", age: "6-8", statuses: { g4: "kent", a4: "kent", b4: "kent", c5: "les", d5: "les", f4: "moet", e4: "moet" } },
  daan: { name: "Daan", age: "13-17", statuses: { c4: "kent", d4: "kent", e4: "kent", f4: "kent", g4: "kent", a4: "kent", b4: "kent", c5: "kent",
    d5: "kent", e5: "kent", f5: "les", fis4: "les", g5: "moet", bes4: "moet" } },
};
// Octaafcijfers (G₄, C₅) zijn voor jonge kinderen te veel: standaard uit bij 6–8 jaar.
// Per leerling aan of uit te zetten; in de app een veld op de leerling, net als de notennamen (nl/en).
export const octaveDefault = (age) => age !== "6-8";
export const SHORT = { oct: "Oct", fF: "F", L1: "1", L2: "2", L3: "3", R4: "4", R5: "5", R6: "6", bis: "Bis",
  gs: "G♯", cs: "C♯", lb: "B", lbb: "B♭", eb: "E♭", lc: "C", pD: "D", pEb: "E♭", pF: "F", sE: "E", sC: "C", sBb: "B♭" };
export const NOTE_NL = { c: "C", cis: "Cis", d: "D", es: "Es", e: "E", f: "F", fis: "Fis", g: "G", gis: "Gis", a: "A", bes: "Bes", b: "B" };
export const parse = (id) => { const m = id.match(/^([a-z]+)(\d)$/); return { name: NOTE_NL[m[1]], octave: +m[2] }; };
export const octaveWord = (o) => (o <= 3 ? "laag" : o >= 6 ? "hoog" : "");
export const label = (n) => { const p = parse(n); return [p.name, octaveWord(p.octave)].filter(Boolean).join(" "); };
export const ALL = Object.keys(FINGERINGS);
export const AGE_TEXT = { "6-8": "6 – 8 jaar", "9-12": "9 – 12 jaar", "13-17": "13 – 17 jaar", "18+": "18+" };

// ---------- Notenbalk (zelfde tekening als StaffRow / StaffNote in de app) ----------
const LETTERS = "cdefgab";
export const staffPos = (id) => { const o = +id.at(-1); return o * 7 + LETTERS.indexOf(id[0]) - (4 * 7 + 2); }; // 0 = onderste lijn (E4)
const accidental = (id) => (/^(cis|fis|gis)/.test(id) ? "♯" : /^(es|bes)/.test(id) ? "♭" : "");
const ledgers = (pos) => { const r = []; for (let s = -2; s >= pos; s -= 2) r.push(s); for (let s = 10; s <= pos; s += 2) r.push(s); return r; };
export const STATUS_COLOR = { kent: "var(--kent)", les: "var(--accent)", moet: "var(--moet)" };
export function noteGlyph(id, cx, y, col, scale = 1) {
  const pos = staffPos(id), cy = y(pos), acc = accidental(id), rx = 7 * scale, ry = 5 * scale, st = 34 * scale;
  return ledgers(pos).map((s) => `<line x1="${cx - 13 * scale}" x2="${cx + 13 * scale}" y1="${y(s)}" y2="${y(s)}" stroke="currentColor" stroke-width="1.2"/>`).join("")
    + (acc ? `<text x="${cx - 19 * scale}" y="${cy + 6 * scale}" font-size="${18 * scale}" fill="${col}" text-anchor="middle" font-family="serif">${acc}</text>` : "")
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}" transform="rotate(-20 ${cx} ${cy})"/>`
    + (pos < 4 ? `<line x1="${cx + rx * 0.9}" x2="${cx + rx * 0.9}" y1="${cy - 1}" y2="${cy - st}" stroke="${col}" stroke-width="1.6"/>`
               : `<line x1="${cx - rx * 0.9}" x2="${cx - rx * 0.9}" y1="${cy + 1}" y2="${cy + st}" stroke="${col}" stroke-width="1.6"/>`);
}
/** Rij noten op één balk, klikbaar via data-note. showNames: letters onder de noten (zoals StaffRow in de app). */
export function staffRow(notes, { current, statuses = {}, showOctave = false, showNames = true } = {}) {
  // Hoogte past zich aan de hoogste en laagste noot aan, zodat een paar noten geen lege ruimte geven.
  const ps = notes.map(staffPos), hi = Math.max(8, ...ps), lo = Math.min(0, ...ps);
  const sp = 12, x0 = 62, dx = 50, base = 44 + hi * (sp / 2), h = base - lo * (sp / 2) + (showNames ? 78 : 44), w = x0 + Math.max(notes.length, 1) * dx + 6, y = (s) => base - s * (sp / 2);
  let out = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
  out += [0, 1, 2, 3, 4].map((i) => `<line x1="8" x2="${w - 8}" y1="${base - i * sp}" y2="${base - i * sp}" stroke="currentColor" stroke-width="1.2"/>`).join("");
  out += `<text x="12" y="${base + 3}" font-size="60" fill="currentColor" font-family="serif">𝄞</text>`;
  notes.forEach((n, i) => {
    const cx = x0 + i * dx, col = STATUS_COLOR[statuses[n]] ?? "currentColor", sel = n === current, p = parse(n);
    const top = Math.min(y(staffPos(n)), base - 4 * sp) - 46;
    out += `<g role="button" tabindex="0" data-note="${n}" aria-pressed="${sel}" aria-label="${label(n)}">`
      + `<rect x="${cx - 23}" y="${top}" width="46" height="${h - top - 2}" rx="10" fill="${sel ? "var(--bg)" : "transparent"}" stroke="${sel ? "currentColor" : "none"}" stroke-width="2"/>`
      + noteGlyph(n, cx, y, col)
      + (showNames ? `<text x="${cx}" y="${h - 26}" font-size="16" font-weight="800" fill="${col}" text-anchor="middle" font-family="Lexend, sans-serif">${p.name}</text>`
      + `<text x="${cx}" y="${h - 10}" font-size="10" fill="var(--muted)" text-anchor="middle">${showOctave ? p.octave : octaveWord(p.octave)}</text>` : "") + "</g>";
  });
  return out + "</svg>";
}
export function bigStaff(n, statuses = {}, size = { w: 200, h: 150, base: 105, cx: 140 }) {
  const sp = 12, { w, h, base, cx } = size, y = (s) => base - s * (sp / 2);
  return `<svg viewBox="0 0 ${w} ${h}" aria-label="${label(n)} op de notenbalk">`
    + [0, 1, 2, 3, 4].map((i) => `<line x1="6" x2="${w - 6}" y1="${base - i * sp}" y2="${base - i * sp}" stroke="currentColor" stroke-width="1.2"/>`).join("")
    + `<text x="10" y="${base + 3}" font-size="60" fill="currentColor" font-family="serif">𝄞</text>`
    + noteGlyph(n, cx, y, STATUS_COLOR[statuses[n]] ?? "var(--kent)", 1.2) + "</svg>";
}
