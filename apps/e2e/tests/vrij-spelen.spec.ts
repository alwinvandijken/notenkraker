import { expect, kiesTab, test } from "../fixtures";

// AC-120 PR 5b: Vrij spelen klaarzetten, in focus spelen en het resultaat. De microfoon is een
// toon van 466 Hz (klinkend Bes, voor de altsax een geschreven G).
test("vrij spelen in focus telt mee voor vandaag", async ({ page }) => {
  await page.addInitScript(() => {
    const getUserMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 466.16;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(dest); osc.start();
      return dest.stream;
    };
    // headless WebKit heeft geen navigator.mediaDevices
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  });
  await page.goto("/oefenen");
  await page.getByRole("button", { name: "Overslaan" }).click();
  await kiesTab(page, "Vrij spelen");
  // de eerste keer met uitleg over de microfoon
  await expect(page.getByText(/Ik neem niets op/)).toBeVisible();
  await page.getByRole("button", { name: "Begin" }).click();

  const focus = page.getByRole("region", { name: "Vrij spelen" });
  await expect(focus.getByText(/Ik hoor je altsaxofoon/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabbalk" })).toBeHidden();
  await page.waitForTimeout(1500);
  await focus.getByRole("button", { name: "Klaar", exact: true }).click();

  await expect(focus.getByText(/voor vandaag/)).toBeVisible();
  await expect(focus.getByText("Noten: G")).toBeVisible();
  await focus.getByRole("button", { name: "Naar Vandaag" }).click();
  await expect(page.getByRole("heading", { name: "Hoi!" })).toBeVisible();

  // de tweede keer zonder de uitleg
  await kiesTab(page, "Vrij spelen");
  await expect(page.getByText("Pak je altsaxofoon en speel. Ik tel mee hoe lang ik je hoor.")).toBeVisible();
});
