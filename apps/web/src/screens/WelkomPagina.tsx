import { useState } from "react";
import { chooseRoute, type Route } from "@/lib/route";

/**
 * Welkomstpagina op / (AC-114, mock-up docs/mockups/Welkom-Twee-Routes.html): wat Notenkraker is
 * en twee manieren om het te gebruiken, zonder account (/oefenen) of met een gratis account (/app).
 * Met "niet meer tonen" gaat / de volgende keer direct naar de gekozen route.
 */
const FEATURES = [
  { icon: "🎷", title: "Grepen", text: "Tik op een noot en zie welke kleppen je indrukt." },
  { icon: "🎮", title: "Notenspel", text: "Acht noten op een rij. Hoe snel herken jij ze?" },
  { icon: "🎙️", title: "Vrij oefenen", text: "De app hoort je sax en telt mee hoe lang je speelt." },
  { icon: "⭐", title: "Jouw noten", text: "Kent al, in de les of komt nog: jij kiest." },
];

export function WelkomPagina() {
  const [skip, setSkip] = useState(false);
  const go = (route: Route, path = `/${route}`) => {
    try { chooseRoute(localStorage, route, skip); } catch { /* geen opslag: dan komt de welkomstpagina gewoon terug */ }
    window.location.assign(path);
  };

  const choices = (
    <div className="flex flex-col gap-3">
      <section className="rounded-3xl bg-surface border-2 border-line p-5 flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Zonder account</span>
        <h2 className="font-display font-bold text-2xl m-0">Meteen beginnen</h2>
        <ul className="list-none m-0 p-0 flex flex-col gap-1 text-muted">
          <li>✓ Grepen, notenspel en vrij oefenen</li>
          <li>✓ Geen e-mail, geen wachtwoord</li>
          <li>· Alles blijft op dit apparaat</li>
        </ul>
        <button type="button" onClick={() => go("oefenen")}
          className="min-h-12 rounded-full bg-accent text-white font-display font-bold text-lg cursor-pointer">Start zonder account</button>
      </section>
      <section className="rounded-3xl bg-fg text-bg p-5 flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Gratis account</span>
        <h2 className="font-display font-bold text-2xl m-0">Voortgang bewaren</h2>
        <ul className="list-none m-0 p-0 flex flex-col gap-1 opacity-80">
          <li>✓ Op elk apparaat je eigen noten</li>
          <li>✓ Ouder en leraar kijken mee</li>
          <li>✓ Huiswerk van je leraar</li>
        </ul>
        <button type="button" onClick={() => go("app", "/app?nieuw")}
          className="min-h-12 rounded-full bg-bg text-fg font-display font-bold text-lg cursor-pointer">Gratis account maken</button>
      </section>
      <label className="flex items-center justify-center gap-2 text-sm text-muted cursor-pointer select-none">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="w-5 h-5 accent-[var(--color-accent)]" />
        Niet meer tonen, ga voortaan direct naar mijn keuze
      </label>
    </div>
  );

  return (
    <div className="max-w-[1100px] mx-auto px-4 pt-5 pb-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 font-display font-extrabold text-xl">
          <span className="w-9 h-9 rounded-xl bg-fg text-bg flex items-center justify-center" aria-hidden="true">♪</span>Notenkraker
        </div>
        <button type="button" onClick={() => go("app")} className="font-semibold text-kent bg-transparent cursor-pointer">Inloggen</button>
      </header>

      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div className="flex flex-col gap-4 min-w-0">
          <h1 className="font-display font-extrabold text-4xl md:text-5xl leading-[1.05] m-0">Noten lezen én spelen op je sax</h1>
          <p className="text-muted text-lg m-0 leading-relaxed">Zie bij elke noot welke kleppen je indrukt, speel het notenspel en laat de app meetellen als je oefent. Gratis, zonder reclame.</p>
          <div className="rounded-3xl bg-surface px-4 py-3 text-fg" aria-hidden="true">
            <svg viewBox="0 0 300 80" className="w-full h-auto max-h-32">
              <g stroke="currentColor" strokeWidth="1.2">{[20, 30, 40, 50, 60].map((y) => <line key={y} x1="6" x2="294" y1={y} y2={y} />)}</g>
              <text x="10" y="62" fontSize="54" fontFamily="serif" fill="currentColor">𝄞</text>
              {[55, 50, 45, 40, 35].map((y, i) => {
                const x = 80 + i * 42, col = i < 3 ? "var(--color-kent)" : "var(--color-accent)", up = i < 3;
                return (
                  <g key={i}>
                    <ellipse cx={x} cy={y} rx="6" ry="4.5" fill={col} transform={`rotate(-20 ${x} ${y})`} />
                    <line x1={up ? x + 5.5 : x - 5.5} x2={up ? x + 5.5 : x - 5.5} y1={up ? y - 1 : y + 1} y2={up ? y - 29 : y + 29} stroke={col} strokeWidth="1.5" />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
        {choices}
      </div>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl bg-surface p-4 text-sm text-muted leading-snug">
            <div className="text-2xl" aria-hidden="true">{f.icon}</div>
            <b className="block text-fg text-base mt-1 mb-0.5">{f.title}</b>{f.text}
          </div>
        ))}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-3xl bg-surface p-5 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Voor ouders en leraren</span>
          <p className="m-0"><b>Ouders</b> zien hoeveel en wat hun kind oefent, per dag en per week.</p>
          <p className="m-0"><b>Leraren</b> geven huiswerk en zien wie achterloopt.</p>
          <p className="m-0 text-sm text-muted">Het kind logt in met een link of QR-code van de ouder.</p>
          <button type="button" onClick={() => go("app", "/app?nieuw")} className="self-start mt-1 font-semibold text-kent bg-transparent cursor-pointer">Gratis account maken →</button>
        </section>
        <section className="rounded-3xl bg-surface p-5 text-muted leading-relaxed">
          🔒 Geen reclame. De microfoon neemt niets op: de app luistert alleen welke noot je speelt. Zonder account blijft alles op dit apparaat.
        </section>
      </div>
    </div>
  );
}
