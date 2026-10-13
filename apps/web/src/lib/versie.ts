/**
 * Welke versie is geladen: versienummer (package.json), de commit die Netlify bouwde, de bouwdatum,
 * en op welke site (productie, testsite, preview van een PR of lokaal). Onderaan het avatarmenu.
 */
export interface Versie { semver: string; commit: string; built: string; branch: string }

export const VERSIE: Versie = {
  semver: import.meta.env.VITE_APP_SEMVER ?? "0.0.0",
  commit: import.meta.env.VITE_APP_VERSION ?? "dev",
  built: import.meta.env.VITE_APP_BUILT ?? new Date().toISOString(),
  branch: import.meta.env.VITE_APP_BRANCH ?? "",
};

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function versieLabel(v: Versie): string {
  const d = new Date(v.built);
  const site = v.branch === "main" ? "" : v.branch === "develop" ? "testsite" : v.commit === "dev" ? "lokaal" : "preview";
  return [`Versie ${v.semver}`, v.commit, `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`, site].filter(Boolean).join(" · ");
}
