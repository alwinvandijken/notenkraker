# Notenkraker — architectuur

Beslissingen van 10 oktober 2026. Wijzig dit document als een keuze verandert; de Linear-issues verwijzen hiernaar.

## Doel

Noten leren lezen en spelen voor beginnende muziekleerlingen (vanaf ±8 jaar): grepentabel per instrument, een notenspel, en meeluisteren via de microfoon. Begonnen voor altsax; instrument-onafhankelijk opgezet.

## Keuzes

| Onderwerp | Keuze | Waarom |
|---|---|---|
| App-type | **PWA** (web, op beginscherm); Capacitor later als App Store nodig is | Microfoon, audio, offline en fullscreen werken in Safari/Chrome; geen App Store-proces voor een gezins-/lesapp |
| Headless | Frontend praat alleen via `@notenkraker/client` met een **API-contract** (`packages/api/openapi.yaml`); backend is inwisselbaar | Andere frontends (native, docent-dashboard, tv) later zonder de kern te herschrijven |
| Frontend | **Vite + React 19 + TypeScript**, Tailwind 4, shadcn/ui-stijl componenten, Zustand | Snel, statisch, bekend; muziekonderdelen (notenbalk, grepen) zijn eigen SVG-componenten |
| Backend | **Supabase**: Postgres + RLS, Auth, PostgREST, Realtime, Edge Functions | Geen eigen server; auth met e-mail/wachtwoord en Google (later meer SSO) |
| Rollen | `leerling` en `leraar` (een ouder is leraar) | Leraar beheert leerlingen en ziet voortgang; leerling speelt. Koppeling via uitnodigingscode |
| Instrumenten | Versiebeheerde **JSON in de repo** (`packages/instruments`), gevalideerd met Zod | Content, geen gebruikersdata; toevoegen = één bestand + evt. renderer |
| Domeinlogica | `@notenkraker/core`: puur TypeScript zonder DOM/netwerk | Dezelfde regels in app, Edge Function en tests |
| Audio | Algoritme in `core/audio` (autocorrelatie + stabiliteitsvolger); browserkant in `apps/web/src/audio` | Platform levert samples, core beslist |
| Hosting | **Netlify** (`netlify.toml`), CI via GitHub Actions | Gratis, HTTPS (nodig voor microfoon), preview per branch |
| Offline | Service worker (vite-plugin-pwa); datacache komt later (Dexie) | Oefenen zonder internet, sync daarna |

## Lagen

```
apps/web (React PWA)            ← later: apps/ios, docent-dashboard …
        │  gebruikt
packages/client                 typed SDK + (later) offline-wachtrij; implementaties: supabase, local
        │  contract
packages/api/openapi.yaml       de afspraak; Edge Functions implementeren de commando's
        │
Supabase                        Postgres + RLS · Auth · PostgREST · Realtime · Edge Functions
        ▲
packages/core                   muziek · instrumentmodel · spelregels · toonherkenning  (overal gedeeld)
packages/instruments            altsax.json, … (+ schema-test)
```

Regels:
- `apps/*` importeert nooit `@supabase/supabase-js` rechtstreeks.
- `core` heeft geen afhankelijkheden behalve `zod`.
- De scoreregels in `supabase/functions/rounds` zijn een kopie van `core/game.scoreRound`; houd ze gelijk (Deno kan het workspace-pakket niet importeren).

## Datamodel (Postgres, zie `supabase/migrations`)

```
profiles         id (= auth.users.id), role, display_name
students         id, owner_id, user_id?, name, instrument_id, naming
teacher_students teacher_id, student_id
invite_codes     code, student_id, expires_at
student_notes    student_id, note_id, status ('kent'|'les'|'moet')      ← junction leerling ↔ noot
rounds           id, student_id, mode, played_at, ms, answers, completed, mistakes, stars, xp, wrong_notes
songs            id, student_id, title, instrument_id, source, notes
attempts         id, student_id, song_id, played_at, ms, correct_idx, wrong_idx
```

Toegang: `can_access_student(id)` = eigenaar, de leerling zelf, of een gekoppelde leraar. Rondes worden alleen via de Edge Function geschreven (server berekent sterren/XP).

## Noten en toonhoogte

- `NoteId` = Nederlandse naam + octaaf van de **geschreven** toon: `g4`, `fis4`, `bes3`, `c6`.
- Klinkende toon = geschreven + `instrument.transposition` (altsax −9, klarinet −2, dwarsfluit 0).
- Notennamen per leerling: `nl` (fis, bes) of `en` (F♯, B♭).
- Toonherkenning: samples → `detectPitch` → `{hz, midi, cents}` → `NoteMatcher` (goed na 250 ms stabiel, fout na 1200 ms).

## Instrumentmodel

Zie `InstrumentSchema` in `packages/core/src/instruments`. Per instrument: `clef`, `transposition`, `range` (geschreven), `starterNotes`, `layout` (`keys` | `valves` | `slide` | `keyboard` | `frets`), `fingerings` per noot (alternatieven als lijst), `keyNames`. De test in `packages/instruments` eist een greep voor elke noot in het bereik.

## Gamification

Gebeurtenissen opslaan (rondes met antwoorden), regels berekenen in `core/game`: sterren (3/2/1/0), XP (10 per goede noot, 20 voor les/moet, +50 foutloos), promotievoorstel na 3 foutloze rondes. Streaks en badges worden uit `rounds` afgeleid (zie `client.rounds.progress`).

## Lokaal ontwikkelen

```
pnpm install
pnpm dev                 # apps/web op http://localhost:5173, zonder .env draait het lokaal (localStorage)
pnpm test && pnpm typecheck && pnpm build
```

Met Supabase: `supabase start`, migraties toepassen, `.env` met `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`, functions deployen met `supabase functions deploy`.

## Roadmap

Zie Linear-project Notenkraker (P-AC-56): microfoon in het spel (AC-64), liedje-modus (AC-65), bladmuziek via OMR (AC-66), ritme (AC-67), meer instrumenten (AC-104).
