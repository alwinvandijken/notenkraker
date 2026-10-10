import { createLocalNotenkraker, createSupabaseNotenkraker, type NotenkrakerClient } from "@notenkraker/client";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Eén client voor de hele app. Zonder Supabase-sleutels: lokale opslag (geen login). */
export const client: NotenkrakerClient = url && key ? createSupabaseNotenkraker({ url, anonKey: key }) : createLocalNotenkraker();
export const hasBackend = Boolean(url && key);
