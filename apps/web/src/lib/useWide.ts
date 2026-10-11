import { useEffect, useState } from "react";

/** breed scherm (desktop of liggende iPad): de leraar krijgt dan de leerlingentabel (AC-117) */
export function useWide(query = "(min-width: 1100px)"): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return wide;
}
