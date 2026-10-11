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

// ---------- Eenvoudige greeptekening (zelfde als components/Fingering.tsx in de app) ----------
export const LAYOUT = {"kind": "keys", "viewBox": [0, 0, 200, 318], "axis": {"x": 100, "y1": 44, "y2": 298}, "keys": [{"id": "oct", "shape": "pill", "x": 48, "y": 54, "w": 36, "h": 16, "label": "Oct", "group": "thumb"}, {"id": "fF", "shape": "circle", "x": 100, "y": 30, "r": 7, "label": "", "group": "left", "optional": true}, {"id": "L1", "shape": "circle", "x": 100, "y": 62, "r": 15, "label": "1", "group": "left"}, {"id": "bis", "shape": "circle", "x": 120, "y": 82, "r": 5, "label": "", "group": "left", "auto": true}, {"id": "L2", "shape": "circle", "x": 100, "y": 102, "r": 15, "label": "2", "group": "left"}, {"id": "L3", "shape": "circle", "x": 100, "y": 142, "r": 15, "label": "3", "group": "left"}, {"id": "pD", "shape": "pill", "x": 44, "y": 96, "w": 28, "h": 12, "label": "D", "group": "palm", "optional": true}, {"id": "pEb", "shape": "pill", "x": 44, "y": 114, "w": 28, "h": 12, "label": "E♭", "group": "palm", "optional": true}, {"id": "pF", "shape": "pill", "x": 44, "y": 132, "w": 28, "h": 12, "label": "F", "group": "palm", "optional": true}, {"id": "gs", "shape": "oval", "x": 52, "y": 176, "w": 44, "h": 20, "label": "G♯", "group": "pinkyL", "auto": true}, {"id": "low", "shape": "oval", "x": 56, "y": 204, "w": 44, "h": 20, "label": "laag", "group": "pinkyL", "auto": true}, {"id": "R4", "shape": "circle", "x": 100, "y": 200, "r": 15, "label": "4", "group": "right"}, {"id": "R5", "shape": "circle", "x": 100, "y": 240, "r": 15, "label": "5", "group": "right"}, {"id": "R6", "shape": "circle", "x": 100, "y": 280, "r": 15, "label": "6", "group": "right"}, {"id": "sE", "shape": "pill", "x": 150, "y": 196, "w": 28, "h": 12, "label": "E", "group": "side", "optional": true}, {"id": "sC", "shape": "pill", "x": 150, "y": 214, "w": 28, "h": 12, "label": "C", "group": "side", "optional": true}, {"id": "sBb", "shape": "pill", "x": 150, "y": 232, "w": 28, "h": 12, "label": "B♭", "group": "side", "optional": true}, {"id": "eb", "shape": "oval", "x": 150, "y": 264, "w": 44, "h": 20, "label": "E♭", "group": "pinkyR", "auto": true}, {"id": "lc", "shape": "oval", "x": 150, "y": 290, "w": 44, "h": 20, "label": "C", "group": "pinkyR", "auto": true}], "captions": [{"text": "linkerhand", "x": 100, "y": 36}, {"text": "rechterhand", "x": 100, "y": 176}, {"text": "duim", "x": 48, "y": 40}, {"text": "pink links", "x": 52, "y": 160, "group": "pinkyL"}, {"text": "pink rechts", "x": 150, "y": 248, "group": "pinkyR"}, {"text": "handpalm", "x": 44, "y": 86, "group": "palm"}, {"text": "zijkant", "x": 150, "y": 186, "group": "side"}], "merge": {"cs": "low", "lb": "low", "lbb": "low"}};

/** Platte greeptekening als SVG. Regels zoals de app: optionele kleppen alleen als ze ingedrukt zijn,
 *  "auto"-kleppen als een eigen noot ze nodig heeft of bij "toon alle kleppen". */
export function fingeringSvg(pressed, needed = new Set(), showAll = false) {
  const m = (k) => LAYOUT.merge[k] ?? k;
  const on = new Set([...pressed].map(m)), need = new Set([...needed].map(m));
  const visible = (k) => on.has(k.id) || (!k.optional && (!k.auto || showAll || need.has(k.id)));
  const keys = LAYOUT.keys.filter(visible), groups = new Set(keys.map((k) => k.group));
  const [vx, vy, vw, vh] = LAYOUT.viewBox, ax = LAYOUT.axis;
  let out = `<svg viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="Greep">`;
  out += `<line x1="${ax.x}" x2="${ax.x}" y1="${ax.y1}" y2="${ax.y2}" stroke="var(--line)" stroke-width="2"/>`;
  for (const c of LAYOUT.captions) if (!c.group || groups.has(c.group))
    out += `<text x="${c.x}" y="${c.y}" font-size="9" fill="var(--muted)" text-anchor="middle">${c.text}</text>`;
  for (const k of keys) {
    const isOn = on.has(k.id), fill = isOn ? "var(--kent)" : "var(--surface)", ink = isOn ? "#fff" : "currentColor";
    out += `<g data-key="${k.id}" style="cursor:pointer">`;
    if (k.shape === "circle") {
      const r = k.r ?? 10;
      out += `<circle cx="${k.x}" cy="${k.y}" r="${r}" fill="${fill}" stroke="currentColor" stroke-width="2"/>`;
      if (k.label) out += `<text x="${k.x}" y="${k.y + (r > 10 ? 5 : 3)}" font-size="${r > 10 ? 14 : 8}" font-weight="700" text-anchor="middle" fill="${ink}" font-family="Lexend, sans-serif">${k.label}</text>`;
    } else {
      const w = k.w ?? 30, h = k.h ?? 14;
      out += k.shape === "oval"
        ? `<ellipse cx="${k.x}" cy="${k.y}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="currentColor" stroke-width="2" transform="rotate(-8 ${k.x} ${k.y})"/>`
        : `<rect x="${k.x - w / 2}" y="${k.y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="currentColor" stroke-width="2"/>`;
      out += `<text x="${k.x}" y="${k.y + 3.5}" font-size="${k.shape === "oval" ? 10 : 9}" font-weight="700" text-anchor="middle" fill="${ink}">${k.label}</text>`;
    }
    out += "</g>";
  }
  return out + "</svg>";
}
