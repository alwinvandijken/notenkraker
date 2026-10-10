import { useCallback, useState } from "react";
import type { NoteId, NoteStatus, StatusMap } from "@notenkraker/core";

/**
 * Opslag voor het proefconcept (AC-107): geen leerling, geen backend.
 * De notenstatus staat alleen in deze browser.
 */

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) as T; } catch { /* geen opslag */ }
  return fallback;
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* geen opslag */ }
}

function usePersisted<T>(key: string, fallback: () => T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback()));
  const set = useCallback((next: T) => { setValue(next); write(key, next); }, [key]);
  return [value, set];
}

export function useStatuses(instrumentId: string, starter: NoteId[]) {
  const [statuses, setAll] = usePersisted<StatusMap>(`nk.poc.${instrumentId}.status`, () => Object.fromEntries(starter.map((n) => [n, "kent" as NoteStatus])));
  const setStatus = (note: NoteId, status: NoteStatus | null) => {
    const next = { ...statuses };
    if (status) next[note] = status; else delete next[note];
    setAll(next);
  };
  return { statuses, setStatus };
}

export function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  return usePersisted<T>(`nk.poc.${key}`, () => fallback);
}
