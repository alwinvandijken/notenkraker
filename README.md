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

## Structuur

```
apps/web               React PWA (Vite, Tailwind, Zustand)
packages/core          muziektheorie, instrumentmodel, spelregels, toonherkenning — puur TS, met tests
packages/instruments   instrumentdefinities (altsax.json, …) + schematest
packages/client        SDK over het API-contract; implementaties: Supabase en lokaal
packages/api           openapi.yaml — het contract tussen frontend en backend
supabase/              migraties (schema + RLS), Edge Functions (rounds, invite-code, link-student)
docs/ARCHITECTURE.md   keuzes en lagen
legacy/                de oorspronkelijke één-bestands versie (Claude-artifact)
```

Zie [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) voor de keuzes en het datamodel; het werk staat in het Linear-project *Notenkraker*.
