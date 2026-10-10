import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { App } from "./App";
import { AppMetLogin } from "./AppMetLogin";
import { takeInviteFromUrl } from "./lib/koppel";

registerSW({ immediate: true });
// /app?koppel=CODE: code onthouden en uit de adresbalk halen (zie lib/koppel.ts)
const zonderCode = takeInviteFromUrl(new URL(location.href), localStorage);
if (zonderCode) history.replaceState(null, "", zonderCode);
createRoot(document.getElementById("root")!).render(<React.StrictMode>{location.pathname.startsWith("/app") ? <AppMetLogin /> : <App />}</React.StrictMode>);
