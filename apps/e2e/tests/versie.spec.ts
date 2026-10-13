import { expect, test } from "../fixtures";

// Onderaan het avatarmenu staat welke versie is geladen
test("het menu toont de versie", async ({ page }) => {
  await page.goto("/oefenen");
  await page.getByRole("button", { name: "Overslaan" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("navigation", { name: "Hoofdmenu" }).getByText(/^Versie \d+\.\d+\.\d+ · \w+ · \d+ \w+ \d{4}/)).toBeVisible();
});
