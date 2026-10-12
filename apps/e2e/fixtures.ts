import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseEnv } from "./supabase-env";

export { expect };
export type Rol = "leerling" | "ouder" | "leraar";
export interface Gebruiker { id: string; email: string; password: string; naam: string; rol: Rol }
export const WACHTWOORD = "e2e-wachtwoord";

/** uniek per test, zodat parallelle tests elkaar niet raken */
export const nieuwEmail = (rol: string) => `e2e-${rol}-${randomUUID().slice(0, 8)}@example.com`;

export const test = base.extend<{
  admin: SupabaseClient;
  maakGebruiker(rol: Rol, naam?: string): Promise<Gebruiker>;
  maakKind(ouder: Gebruiker, naam: string): Promise<string>;
}>({
  // eslint-disable-next-line no-empty-pattern
  admin: async ({}, use) => {
    const { url, serviceRoleKey } = loadSupabaseEnv();
    await use(createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }));
  },
  maakGebruiker: async ({ admin }, use) => {
    await use(async (rol, naam = rol === "ouder" ? "Ouder" : rol === "leraar" ? "Leraar" : "Leerling") => {
      const email = nieuwEmail(rol);
      // leerling en ouder: zoals bij zelf registreren (trigger handle_new_user); leraar alleen via de service role
      const meta = rol === "leraar" ? { display_name: naam } : { role: rol, display_name: naam };
      const { data, error } = await admin.auth.admin.createUser({ email, password: WACHTWOORD, email_confirm: true, user_metadata: meta });
      if (error || !data.user) throw error ?? new Error("gebruiker niet aangemaakt");
      if (rol === "leraar") {
        const { error: e } = await admin.from("profiles").update({ role: "leraar" }).eq("id", data.user.id);
        if (e) throw e;
      }
      return { id: data.user.id, email, password: WACHTWOORD, naam, rol };
    });
  },
  maakKind: async ({ admin }, use) => {
    await use(async (ouder, naam) => {
      const { data, error } = await admin.from("students").insert({ owner_id: ouder.id, name: naam, instrument_id: "altsax" }).select("id").single();
      if (error) throw error;
      return data.id as string;
    });
  },
});

/** inloggen via het formulier op /app, zoals een gebruiker het doet */
export async function inloggen(page: Page, g: { email: string; password: string }) {
  await page.goto("/app");
  await page.getByPlaceholder("E-mail").fill(g.email);
  await page.getByPlaceholder("Wachtwoord").fill(g.password);
  await page.locator("form").getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
}

/** avatarmenu rechtsboven openen en een keuze maken */
export async function kiesInMenu(page: Page, label: string | RegExp) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Hoofdmenu" }).getByRole("button", { name: label }).click();
}

/** een tab in de tabbalk onderin (AC-120) */
export async function kiesTab(page: Page, label: string) {
  await page.getByRole("navigation", { name: "Tabbalk" }).getByRole("button", { name: label, exact: true }).click();
}

/**
 * Eén ronde notenspel met de knoppen: steeds de eerste naamknop tikken tot "▶ Spelen" terugkomt
 * (ronde vol of levens op). Goed of fout maakt niet uit; de noten zijn willekeurig.
 */
export async function speelRonde(page: Page) {
  const spelen = page.getByRole("button", { name: "▶ Spelen" });
  await page.getByRole("button", { name: "Knoppen" }).click();
  await spelen.click();
  const naam = page.getByRole("button", { name: /^[A-G][a-z]{0,2}$/ }).first();
  for (let i = 0; i < 40; i++) {
    await expect(spelen.or(naam)).toBeVisible();
    if (await spelen.isVisible()) return;
    await naam.click();
  }
  throw new Error("ronde notenspel eindigde niet na 40 antwoorden");
}
