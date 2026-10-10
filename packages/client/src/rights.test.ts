import { describe, expect, it } from "vitest";
import { rightsFor } from "./rights.js";

describe("rightsFor", () => {
  it("zonder rol moet eerst een rol gekozen worden", () => {
    expect(rightsFor(null)).toMatchObject({ mustChooseRole: true, canCreateStudents: false, canLinkByCode: false });
  });

  it("ouder maakt kinderen aan en maakt codes, maar koppelt niet als leraar", () => {
    expect(rightsFor("ouder")).toMatchObject({ mustChooseRole: false, canCreateStudents: true, canInvite: true, canLinkByCode: false });
  });

  it("leerling speelt alleen", () => {
    expect(rightsFor("leerling")).toMatchObject({ canCreateStudents: false, canInvite: true, canLinkByCode: false });
  });

  it("leraar maakt leerlingen aan en koppelt met een code", () => {
    expect(rightsFor("leraar")).toMatchObject({ canCreateStudents: true, canLinkByCode: true });
  });

  it("alleen een kind (nog zonder rol of leerling) koppelt zich met een code van de ouder", () => {
    expect([null, "leerling", "ouder", "leraar", "admin"].map((r) => rightsFor(r as never).canClaimByCode)).toEqual([true, true, false, false, false]);
  });

  it("ouder en leraar krijgen een beheerscherm met de juiste naam", () => {
    expect([rightsFor("ouder").studentsTitle, rightsFor("leraar").studentsTitle, rightsFor("leerling").studentsTitle]).toEqual(["Mijn kinderen", "Mijn leerlingen", null]);
  });

  it("admin leest alles maar beheert niets in de app", () => {
    expect(rightsFor("admin")).toMatchObject({ canCreateStudents: false, canInvite: false, canLinkByCode: false });
  });
});
