/**
 * Nieuwe versie van de app. De service worker (vite-plugin-pwa, registerType "prompt") meldt het
 * als er een nieuwe versie klaarstaat; het balkje (components/UpdateBalk.tsx) vraagt of je wilt
 * bijwerken, zodat niemand midden in een opname of spel ineens herlaadt.
 */
type Update = (reload?: boolean) => Promise<void>;

export function createUpdateState() {
  let ready = false;
  let update: Update | null = null;
  const listeners = new Set<(ready: boolean) => void>();
  return {
    needRefresh(fn: Update) { ready = true; update = fn; listeners.forEach((l) => l(true)); },
    subscribe(l: (ready: boolean) => void) { listeners.add(l); l(ready); return () => { listeners.delete(l); }; },
    async apply() { if (ready && update) await update(true); },
  };
}

export const appUpdate = createUpdateState();
