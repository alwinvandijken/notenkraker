// Koppelt een indeling (mock-up) aan de 3D-sax. De pagina zet data-attributen op haar eigen
// elementen; alles wat er niet is, wordt overgeslagen. Zo delen alle indelingen dezelfde logica.
import { createSax } from "./engine.js";
import { FINGERINGS, KEY_NAMES, LEARNERS, ALL, parse, octaveWord, staffRow, bigStaff, octaveDefault } from "./data.js";

const SEMI = { c: 0, cis: 1, d: 2, es: 3, e: 4, f: 5, fis: 6, g: 7, gis: 8, a: 9, bes: 10, b: 11 };
const midi = (id) => { const m = id.match(/^([a-z]+)(\d)$/); return 12 * (+m[2] + 1) + SEMI[m[1]]; };
const STARTER = ["g4", "a4", "b4", "c5", "d5"];
const STATUS_TEXT = { kent: "Kent je al", les: "In de les", moet: "Komt nog" };

/** Namen zonder dubbele, zoals distinctLabels in de app: onder de startnoten "laag", erboven "hoog". */
function distinct(notes) {
  const lo = Math.min(...STARTER.map(midi)), hi = Math.max(...STARTER.map(midi)), count = {};
  for (const n of notes) count[parse(n).name] = (count[parse(n).name] ?? 0) + 1;
  return Object.fromEntries(notes.map((n) => {
    const name = parse(n).name, m = midi(n);
    return [n, count[name] < 2 ? { name, word: "" } : m < lo ? { name, word: "laag" } : m > hi ? { name, word: "hoog" } : { name, word: "" }];
  }));
}

let audio;
function play(id) {
  audio ??= new AudioContext();
  const f = 440 * Math.pow(2, (midi(id) - 9 - 69) / 12), t = audio.currentTime; // altsax klinkt een grote sext lager
  const o = audio.createOscillator(), g = audio.createGain(), lp = audio.createBiquadFilter();
  o.type = "sawtooth"; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = f * 4;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
  o.connect(lp).connect(g).connect(audio.destination); o.start(t); o.stop(t + 1.35);
}

export function mountGrepen({ learner = "sanne", strip = "buttons", sax: saxOpts = {} } = {}) {
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const L = LEARNERS[learner], statuses = L.statuses, showOctave = octaveDefault(L.age);
  let filter = "mine", current = "g4", alt = 0, showAll = false;
  // Alleen indelingen met een schakelaar onthouden de keuze (per apparaat, zoals usePref in de app)
  if ($("[data-strip-mode]")) try { strip = localStorage.getItem("nk.sax3d.strip") || strip; } catch {}

  const info = $("[data-info]");
  const sax = createSax($("[data-stage]"), { ...saxOpts, onTap: showInfo });
  sax.setNeeded(ALL.filter((n) => statuses[n]).flatMap((n) => FINGERINGS[n][0]));

  function showInfo(id) {
    if (!info) return;
    if (!id) { info.hidden = true; return; }
    info.hidden = false;
    info.textContent = KEY_NAMES[id] ?? id;
    clearTimeout(info._t);
    info._t = setTimeout(() => (info.hidden = true), 2500);
  }

  // Bediening van de sax
  $$("[data-view]").forEach((b) => b.addEventListener("click", () => sax.view(b.dataset.view)));
  const CYCLE = ["front", "left", "back", "right"];
  let ci = 0;
  $$("[data-view-cycle]").forEach((b) => b.addEventListener("click", () => sax.view(CYCLE[(ci = (ci + 1) % CYCLE.length)])));
  $$("[data-zoom]").forEach((b) => b.addEventListener("click", () => sax.zoom(b.dataset.zoom === "in" ? 0.7 : 1.4)));
  $$("[data-spin]").forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-pressed", sax.toggleSpin())));
  $$("[data-explode]").forEach((b) => b.addEventListener("click", () => {
    const on = sax.toggleExplode();
    b.setAttribute("aria-pressed", on);
    const t = b.querySelector("[data-text]") ?? b;
    t.textContent = on ? "In elkaar" : "Uit elkaar";
  }));
  $$("[data-showall]").forEach((b) => b.addEventListener("click", () => {
    showAll = !showAll; sax.setShowAll(showAll);
    b.setAttribute("aria-pressed", showAll);
    b.textContent = showAll ? "Alleen mijn kleppen" : "Toon alle kleppen";
  }));
  $$("[data-filter]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.filter; render(); }));
  $$("[data-strip-mode]").forEach((b) => b.addEventListener("click", () => {
    strip = b.dataset.stripMode;
    try { localStorage.setItem("nk.sax3d.strip", strip); } catch {}
    render();
  }));
  $$("[data-play]").forEach((b) => b.addEventListener("click", () => play(current)));

  const notesEl = $("[data-notes]");
  notesEl?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-note]");
    if (t) select(t.dataset.note, 0);
  });

  const visibleNotes = () => ALL.filter((n) => (filter === "all" ? true : Boolean(statuses[n])));

  function render() {
    $$("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.filter === filter));
    $$("[data-strip-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.stripMode === strip));
    notesEl?.classList.toggle("staff", strip !== "buttons");
    notesEl?.classList.toggle("names", strip === "both");
    const vis = visibleNotes();
    if (!vis.includes(current)) current = vis[0] ?? current;
    select(current, alt);
  }

  function drawStrip(vis) {
    if (!notesEl) return;
    const names = distinct(vis), scroll = notesEl.scrollLeft;
    // "staff": alleen de balk, de leerling leest de noot; "both": balk met letters eronder (extra optie)
    if (strip === "staff" || strip === "both") {
      notesEl.innerHTML = staffRow(vis, { current, statuses, showOctave, showNames: strip === "both" });
    } else {
      notesEl.innerHTML = vis.map((n) => {
        const { name, word } = names[n], p = parse(n), mark = showOctave ? `<sub>${p.octave}</sub>` : word === "laag" ? "↓" : word === "hoog" ? "↑" : "";
        return `<button type="button" class="note-btn" data-note="${n}" aria-pressed="${n === current}" aria-label="${[name, word].filter(Boolean).join(" ")}">`
          + `<span>${name}${mark}</span><i class="dot ${statuses[n] ?? ""}"></i></button>`;
      }).join("");
    }
    notesEl.scrollLeft = scroll;
    const sel = notesEl.querySelector(`[data-note="${current}"]`);
    if (sel) {
      const r = sel.getBoundingClientRect(), c = notesEl.getBoundingClientRect();
      if (r.left < c.left || r.right > c.right) notesEl.scrollLeft += r.left - c.left - c.width / 2 + r.width / 2;
    }
  }

  function select(n, a) {
    current = n; alt = a;
    const alts = FINGERINGS[n], vis = visibleNotes(), names = distinct(vis), p = parse(n);
    drawStrip(vis);
    sax.setFingering(alts[a]);
    const word = names[n]?.word ?? octaveWord(p.octave);
    $$("[data-note-name]").forEach((el) => (el.textContent = p.name));
    $$("[data-note-sub]").forEach((el) => (el.textContent = [word, showOctave && `octaaf ${p.octave}`].filter(Boolean).join(" · ")));
    $$("[data-note-staff]").forEach((el) => (el.innerHTML = bigStaff(n, statuses, el.dataset.noteStaff === "small" ? { w: 150, h: 120, base: 84, cx: 104 } : undefined)));
    $$("[data-status]").forEach((el) => {
      const st = statuses[n];
      el.hidden = !st; el.className = `badge ${st ?? ""}`; el.textContent = STATUS_TEXT[st] ?? "";
    });
    const keyNames = alts[a].map((k) => KEY_NAMES[k] ?? k);
    $$("[data-druk]").forEach((el) => (el.innerHTML = keyNames.length ? `Druk in: ${keyNames.map((k) => `<b>${k}</b>`).join(", ")}` : "Niets indrukken, alles <b>open</b>"));
    $$("[data-alts]").forEach((el) => {
      el.innerHTML = alts.length > 1 ? alts.map((_, i) => `<button type="button" data-alt="${i}" aria-pressed="${i === a}">${i === 0 ? "Gewone greep" : `Alternatief ${i}`}</button>`).join("") : "";
      el.querySelectorAll("[data-alt]").forEach((b) => b.addEventListener("click", () => select(n, +b.dataset.alt)));
    });
  }

  render();
  return sax;
}
