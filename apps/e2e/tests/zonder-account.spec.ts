import { expect, kiesTab, speelRonde, test } from "../fixtures";

test("zonder account: grepen, notenspel en de status blijft na herladen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start zonder account" }).click();
  await expect(page).toHaveURL(/\/oefenen/);

  await expect(page.getByRole("heading", { name: "Hoe oud ben je?" })).toBeVisible();
  await page.getByRole("button", { name: "Overslaan" }).click();
  await expect(page.getByRole("heading", { name: "Hoi!" })).toBeVisible();

  await kiesTab(page, "Grepen");
  const kent = page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Kent al" });
  await kent.click();
  await expect(kent).toHaveAttribute("aria-pressed", "true");

  await kiesTab(page, "Spelen");
  await speelRonde(page);

  await kiesTab(page, "Vandaag");
  const noten = page.getByText(/die je kent$/);
  await expect(noten).not.toContainText(" 0 noten");
  const voor = await noten.textContent();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Hoi!" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hoe oud ben je?" })).toHaveCount(0);
  await expect(page.getByText(/die je kent$/)).toHaveText(voor!);
});
