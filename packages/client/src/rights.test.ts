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

  it("admin leest alles maar beheert niets in de app", () => {
    expect(rightsFor("admin")).toMatchObject({ canCreateStudents: false, canInvite: false, canLinkByCode: false });
  });
});
