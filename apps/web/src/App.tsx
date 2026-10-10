import { getInstrument } from "@notenkraker/instruments";
import { Grepentabel } from "@/screens/Grepentabel";

/**
 * Proefconcept (AC-107): alleen de grepentabel. Geen login, geen leerling en
 * geen spel; de notenstatus staat alleen in deze browser. De volledige
 * app met login (AppMetLogin) staat op /app en komt terug op / na het
 * proefconcept.
 */
export function App() {
  return (
    <div className="max-w-[1366px] mx-auto">
      <Grepentabel instrument={getInstrument("altsax")} />
    </div>
  );
}
