import type { Role } from "./types.js";

/**
 * Wat een rol in de app mag. De database dwingt hetzelfde af (RLS en RPC's in
 * supabase/migrations/0002_rollen.sql); dit bepaalt alleen wat de UI laat zien.
 */
export interface Rights {
  /** nieuwe gebruiker (Google-login): eerst leerling of ouder kiezen */
  mustChooseRole: boolean;
  /** kinderen of leerlingen aanmaken onder het eigen account */
  canCreateStudents: boolean;
  /** codes maken voor een leraar of voor het kind zelf */
  canInvite: boolean;
  /** een leerling koppelen met een code (leraar) */
  canLinkByCode: boolean;
  /** zich als kind koppelen aan het profiel dat de ouder maakte (link of code) */
  canClaimByCode: boolean;
  /** titel van het beheerscherm in het menu, of null als die rol er geen heeft */
  studentsTitle: "Mijn kinderen" | "Mijn leerlingen" | null;
}

export function rightsFor(role: Role | null): Rights {
  return {
    mustChooseRole: role === null,
    canCreateStudents: role === "ouder" || role === "leraar",
    canInvite: role === "ouder" || role === "leerling" || role === "leraar",
    canLinkByCode: role === "leraar",
    canClaimByCode: role === null || role === "leerling",
    studentsTitle: role === "ouder" ? "Mijn kinderen" : role === "leraar" ? "Mijn leerlingen" : null,
  };
}
