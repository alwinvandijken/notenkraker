// AC-124: een opdracht gaat mee naar de volgende les, met zijn opnames ("2e week", opnames per week).
import { expect, inloggen, kiesInMenu, test } from "../fixtures";

test("een stuk gaat mee naar de volgende les, met de opname van vorige week", async ({ page, admin, maakGebruiker, maakKind }) => {
  const ouder = await maakGebruiker("ouder", "Papa");
  const kind = await maakKind(ouder, "Noor");
  await admin.from("students").update({ age_band: "9-12", onboarded_at: new Date().toISOString(), recording_consent: true }).eq("id", kind);
  await inloggen(page, ouder);
  await page.getByRole("button", { name: "Noor: details" }).click();
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Lang zal ze leven");
  await page.getByRole("checkbox", { name: /neemt het op/ }).check();
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Noor sturen/ }).click();
  await expect(page.getByRole("heading", { name: "Noor", exact: true })).toBeVisible();
  // een opname deze week
  const { data: lid } = await admin.from("group_members").select("group_id").eq("student_id", kind).single();
  const { data: a } = await admin.from("assignments").select("id, group_id").eq("group_id", lid!.group_id).eq("title", "Lang zal ze leven").single();
  await admin.storage.from("opnames").upload(`${kind}/${a!.id}/1.webm`, new Blob(["x"], { type: "audio/webm" }));
  await admin.from("recordings").insert({ assignment_id: a!.id, student_id: kind, path: `${kind}/${a!.id}/1.webm`, submitted_at: new Date().toISOString() });
  // volgende les: gaat mee
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("group", { name: "Les" }).getByRole("button", { name: /^Volgende les/ }).click();
  const looptNog = page.getByRole("region", { name: "Loopt nog" });
  await looptNog.getByRole("checkbox", { name: /Lang zal ze leven/ }).check();
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Noor sturen/ }).click();
  await expect(page.getByRole("heading", { name: "Noor", exact: true })).toBeVisible();
  await expect(page.getByText("Volgende les")).toBeVisible();
  // voortgang: de gever zet status en cijfer per opdracht (AC-124, VOORTGANG)
  const voortgang = page.getByRole("group", { name: "Voortgang van Lang zal ze leven" }).first();
  await voortgang.getByRole("button", { name: "klaar" }).click();
  await voortgang.getByRole("spinbutton", { name: "Cijfer" }).fill("8");
  await voortgang.getByRole("button", { name: "Opslaan" }).click();
  await expect.poll(async () => (await admin.from("progress").select("status, grade").eq("student_id", kind)).data).toEqual([{ status: "klaar", grade: 8 }]);
  // tijdreis: de volgende les begint vandaag, de vorige was een week geleden
  const dag = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  await admin.from("lessons").update({ date: dag(-7) }).eq("group_id", a!.group_id).lte("date", dag(0));
  await admin.from("lessons").update({ date: dag(0) }).eq("group_id", a!.group_id).gt("date", dag(0));
  await admin.from("recordings").update({ submitted_at: new Date(Date.now() - 6 * 864e5).toISOString() }).eq("assignment_id", a!.id);
  await kiesInMenu(page, "Zelf oefenen");
  await expect(page.getByText("2e week")).toBeVisible();
  await page.getByRole("button", { name: /Lang zal ze leven opnemen/ }).click();
  await expect(page.getByText(/Vorige week/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Opnames" }).getByRole("listitem")).toHaveCount(1);
});
