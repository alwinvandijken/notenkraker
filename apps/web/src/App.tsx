import { getInstrument } from "@notenkraker/instruments";
import { Grepentabel } from "@/screens/Grepentabel";

/**
 * Proefconcept (AC-107): alleen de grepentabel. Geen login, geen leerling en
 * geen spel; alles staat lokaal in de browser. De volledige app (store, Learn,
 * Game, Auth) blijft in de code staan en komt terug na het proefconcept.
 */
export function App() {
  const instrument = getInstrument("altsax");

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 pt-5 pb-12 flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <rect width="40" height="40" rx="12" fill="var(--color-fg)" />
          <ellipse cx="17" cy="27" rx="7" ry="5" fill="var(--color-les)" transform="rotate(-20 17 27)" />
          <path d="M23 26V9l8 4" stroke="var(--color-les)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="font-display font-bold text-2xl m-0">Notenkraker</h1>
        <span className="text-sm font-semibold px-3 py-1 rounded-xl bg-surface text-muted">Proefversie grepentabel</span>
        <span className="ml-auto text-muted font-medium">{instrument.name}</span>
      </header>
      <Grepentabel instrument={instrument} />
      <p className="text-muted text-sm text-center">
        Statussen en controles worden alleen in deze browser bewaard. Gebruik "Kopieer verslag" om je bevindingen door te sturen.
      </p>
    </div>
  );
}
