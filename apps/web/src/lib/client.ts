import { createLocalNotenkraker, createSupabaseNotenkraker, type NotenkrakerClient } from "@notenkraker/client";
import { ANONIEM_KEY, appFor } from "./route";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** /oefenen: zonder account, alles in deze browser (AC-114) */
export const isAnonymous = appFor(window.location.pathname) === "anoniem";

/** Eén client voor de hele app. Zonder account of zonder Supabase-sleutels: lokale opslag (geen login). */
export const client: NotenkrakerClient = isAnonymous
  ? createLocalNotenkraker(ANONIEM_KEY, { role: "leerling", displayName: "Jij" })
  : url && key ? createSupabaseNotenkraker({ url, anonKey: key }) : createLocalNotenkraker();
export const hasBackend = !isAnonymous && Boolean(url && key);
