import { getInstrument } from "@notenkraker/instruments";
import { Grepentabel } from "@/screens/Grepentabel";

/**
 * Proefconcept (AC-107): alleen de grepentabel. Geen login, geen leerling en
 * geen spel; de notenstatus staat alleen in deze browser. De volledige
 * app (store, Learn, Game, Auth) blijft in de code staan en komt terug na het
 * proefconcept.
 */
export function App() {
  return (
    <div className="max-w-[1366px] mx-auto">
      <Grepentabel instrument={getInstrument("altsax")} />
    </div>
  );
}
