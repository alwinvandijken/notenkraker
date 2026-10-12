import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { AppMetLogin } from "./AppMetLogin";
import { AnoniemApp } from "./AnoniemApp";
import { WelkomPagina } from "./screens/WelkomPagina";
import { takeInviteFromUrl } from "./lib/koppel";
import { appFor, redirectFor } from "./lib/route";
import { appUpdate } from "./lib/update";
import { UpdateBalk } from "./components/UpdateBalk";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => appUpdate.needRefresh(updateSW),
  // de app staat vaak lang open (iPad, telefoon): elk half uur kijken of er iets nieuws is
  onRegisteredSW: (_url, reg) => { if (reg) setInterval(() => void reg.update(), 30 * 60 * 1000); },
});
// /app?koppel=CODE: code onthouden en uit de adresbalk halen (zie lib/koppel.ts)
const zonderCode = takeInviteFromUrl(new URL(location.href), localStorage);
if (zonderCode) history.replaceState(null, "", zonderCode);
// / is de welkomstpagina; met "niet meer tonen" direct door naar /oefenen of /app (AC-114)
let doorsturen: string | null = null;
try { doorsturen = redirectFor(location.pathname, location.search, localStorage); } catch { /* geen opslag */ }
if (doorsturen) location.replace(doorsturen);
else {
  const kind = appFor(location.pathname);
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>{kind === "account" ? <AppMetLogin /> : kind === "anoniem" ? <AnoniemApp /> : <WelkomPagina />}<UpdateBalk /></React.StrictMode>,
  );
}
