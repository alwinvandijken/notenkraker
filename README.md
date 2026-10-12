# Notenkraker

Noten leren lezen én spelen, voor beginnende muziekleerlingen (vanaf ±8 jaar). Grepentabel per instrument, een notenspel en meeluisteren via de microfoon. Begonnen als altsax-app voor één leerling; opgezet als headless PWA zodat andere instrumenten en frontends erbij kunnen.

- **Grepen** — tik op een noot, zie de notenbalk, de naam (fis, bes…) en welke kleppen je indrukt, getekend zoals ze op het instrument zitten.
- **Leerlingen** — per leerling een status per noot: kent al / in de les / moet nog leren. Rollen: leerling en leraar (ouder).
- **Spel** — acht noten op een rij, naam tikken of op je instrument spelen; levens, timer, sterren, XP.

## Snel starten

```bash
pnpm install
pnpm dev          # http://localhost:5173 — zonder .env draait de app lokaal (geen login, data in de browser)
pnpm test
pnpm build
```

Met de echte backend: kopieer `apps/web/.env.example` naar `apps/web/.env` en vul de Supabase-URL en anon key in. Schema en Edge Functions staan in `supabase/`.

## E2E-tests

Playwright (WebKit, iPad en iPhone) tegen de productiebuild en een lokale Supabase. Raakt nooit de clouddatabase: de tests stoppen als Supabase niet op localhost draait, en de build wordt gecontroleerd op de lokale URL.

```bash
pnpm --filter @notenkraker/e2e exec playwright install webkit   # eenmalig
supabase start                    # Supabase CLI 2.120 of nieuwer (brew upgrade supabase)
pnpm e2e                          # alle scenario's, beide schermen
pnpm e2e --project webkit-ipad    # alleen iPad
pnpm e2e --ui                     # interactief
```

Elke test maakt eigen gebruikers aan; `supabase db reset` ruimt ze op. De Edge Functions komen uit de map waar `supabase start` draaide: start opnieuw (`supabase stop && supabase start`) vanuit je eigen worktree als je functions wijzigt. Met CLI 2.72 starten de functions wel, maar weigeren ze elke ingelogde aanroep.

## Structuur

```
apps/web               React PWA (Vite, Tailwind, Zustand)
packages/core          muziektheorie, instrumentmodel, spelregels, toonherkenning — puur TS, met tests
packages/instruments   instrumentdefinities (altsax.json, …) + schematest
packages/client        SDK over het API-contract; implementaties: Supabase en lokaal
packages/api           openapi.yaml — het contract tussen frontend en backend
apps/e2e               Playwright-e2e-tests (zie hierboven)
supabase/              migraties (schema + RLS), Edge Functions (rounds, invite-code, link-student)
docs/ARCHITECTURE.md   keuzes en lagen
legacy/                de oorspronkelijke één-bestands versie (Claude-artifact)
```

Zie [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) voor de keuzes en het datamodel; het werk staat in het Linear-project *Notenkraker*.
