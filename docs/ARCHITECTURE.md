# Notenkraker — architectuur

Beslissingen van 10 oktober 2026, aangevuld na de mock-ups (basislook A). Wijzig dit document als een keuze verandert; de Linear-issues verwijzen hiernaar.

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
| Offline | Service worker (vite-plugin-pwa); datacache en wachtrij met Dexie | Oefenen zonder internet, sync daarna |
| Schermen | **iPad liggend eerst**, dan telefoon, dan computer. Indeling kiest op beschikbare ruimte, niet op apparaattype | Zie "Frontend" hieronder en `docs/mockups/` |
| Routing | **React Router 7** (declaratief), routes per scherm | Diepe links (`/leraar/:id`), terugknop werkt, schermen los te laden |
| Uiterlijk | Basislook **A "Notenbalk"** als CSS-variabelen; **skins** als JSON in `packages/themes` die alleen tokens en plaatjes overschrijven | Rustige standaard, later varianten per leeftijd en niveau zonder de indeling te raken |

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
packages/instruments            altsax.json, … + niveaus per instrument (+ schema-test)
packages/themes                 notenbalk.json (basislook), skins … (+ contrast-test)   ← nieuw
```

Regels:
- `apps/*` importeert nooit `@supabase/supabase-js` rechtstreeks.
- `core` heeft geen afhankelijkheden behalve `zod`.
- De scoreregels in `supabase/functions/rounds` zijn een kopie van `core/game.scoreRound`; houd ze gelijk (Deno kan het workspace-pakket niet importeren).

## Frontend

### Routes

| Route | Scherm | Wie |
|---|---|---|
| `/` | Start: dagdoel, spel, grepentabel, jouw noten | leerling |
| `/grepen/:noteId?` | Grepentabel | leerling, leraar |
| `/spel` | Notenspel (tutorial voor nieuwe noten ervoor) | leerling |
| `/pad` | Niveaupad (AC-59) | leerling |
| `/liedjes`, `/liedjes/:id` | Liedje-modus (AC-65) | leerling |
| `/leraar`, `/leraar/:studentId` | Overzicht, notenstatus, les klaarzetten, rondes | leraar |
| `/kies-leerling` | Wie speelt er? (gedeelde gezins-iPad) | leraar-account op een gedeeld toestel |
| `/instellingen` | Skin kiezen, account | iedereen |
| `/welkom` | Rolkeuze na eerste Google-login | nieuwe gebruiker |

Spel en tutorial zijn schermvullend, zonder navigatiebalk.

### Indeling per schermgrootte

Eén codebase, drie indelingen. De keuze gaat op beschikbare breedte via een `useLayout()`-hook (matchMedia), en componenten gebruiken container queries waar ze op meerdere plekken staan.

| Indeling | Breedte | Typisch | Navigatie | Voorbeeld grepentabel |
|---|---|---|---|---|
| `compact` | < 700 px | iPhone, iPad in Split View | tabbalk onder | balk boven, sax midden, notenkiezer onder |
| `regular` | 700–1099 px | iPad staand | tabbalk onder | als compact, sax groter |
| `wide` | ≥ 1100 px | iPad liggend, computer | kop met profielknop; leraar: zijbalk | sax links, balk rechts, kiezer onder |

Vaste regels: tikvlakken minstens 44 pt (antwoordknoppen in het spel 72 pt of meer), antwoordknoppen altijd onderaan in de duimzone, geen hover-afhankelijke bediening. Op de computer krijgt de leraarsweergave de meeste ruimte; leerlingschermen krijgen een maximale breedte en blijven gecentreerd.

### Uiterlijk en skins

- Basislook A staat als tokens in `packages/themes/notenbalk.json` en wordt bij het starten als CSS-variabelen op `:root` gezet. Tailwind 4 (`@theme`) verwijst naar die variabelen. De huidige tokens in `apps/web/src/index.css` (crème, Baloo) worden vervangen.
- Een skin is een JSON-bestand met tokens, eventueel een lettertype, achtergrond en geluidjes. Kiezen zet `data-skin` op `<html>` en laadt de tokens. Wat een skin niet mag veranderen (tikvlakken, notenbalk, vorm-codering van statussen) staat in het schema.
- Skins zijn per leerling (`students.skin_id`), zodat broer en zus op dezelfde iPad elk hun eigen look hebben. Voorstel: thema's (ruimte, sport, dieren, podium) waar het kind zelf uit kiest, gefilterd op leeftijdsgroep; sommige vrij te spelen met niveaus.
- Lichte en donkere modus: de basislook heeft beide; een skin mag één modus vastzetten.

### Offline en synchronisatie

- `packages/client` krijgt een Dexie-laag: leest eerst lokaal, ververst op de achtergrond.
- Schrijfacties (ronde, notenstatus) gaan in een wachtrij met een door de client gemaakte id, zodat opnieuw versturen veilig is.
- Notenstatus: laatste wijziging wint (`updated_at`); leraar en leerling bewerken zelden tegelijk.

## Datamodel

Volledig in [`docs/DATAMODEL.md`](DATAMODEL.md), met de nieuwe tabellen en het migratieplan. Kort:

```
profiles         id (= auth.users.id), role, display_name, role_confirmed*
students         id, owner_id, user_id?, name, instrument_id, naming, age_band*, skin_id*, daily_goal*, time_zone*
teacher_students teacher_id, student_id
invite_codes     code, student_id, expires_at
student_notes    student_id, note_id, status ('kent'|'les'|'moet'), introduced_at*
rounds           id (client), student_id, mode (+'keys'), level_id*, played_at, ms, answers, completed, mistakes, stars, xp, wrong_notes
songs            id, student_id, title, instrument_id, source, notes
attempts         id, student_id, song_id, played_at, ms, correct_idx, wrong_idx
lessons*         id, student_id, teacher_id, held_on, remark, daily_goal      + lesson_notes*
student_levels*  student_id, level_id, reached_at, best_stars
student_unlocks* student_id, kind, item_id, unlocked_at
                                                        * = nieuw, nog geen migratie
```

Toegang: `can_access_student(id)` = eigenaar, de leerling zelf, of een gekoppelde leraar. Rondes, niveaus en vrijgespeelde items worden alleen via Edge Functions geschreven (server berekent sterren, XP en beloningen).

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

## Open vragen

1. **Gedeelde gezins-iPad.** Speelt een kind onder het account van de ouder (kies-leerling-scherm), of heeft elk kind een eigen login? Voorstel: beide mogelijk, met het ouderaccount als standaard en een simpele pincode voor het leraarsdeel. Die pincode is een drempel tegen per ongeluk tikken, geen beveiliging.
2. **Liedjes delen.** Per leerling (zoals nu) of per leraar met koppeling aan leerlingen? Beslissen vóór AC-65.
3. **Meerdere instrumenten per kind.** Nu één instrument per leerlingprofiel; een tweede instrument is een tweede profiel. Goed genoeg?
4. **Wie mag de notenstatus wijzigen?** In de mock-ups doet alleen de leraar dat. Zonder leraar (kind met eigen account) moet de leerling het zelf kunnen.

## Roadmap

Zie Linear-project Notenkraker (P-AC-56): microfoon in het spel (AC-64), liedje-modus (AC-65), bladmuziek via OMR (AC-66), ritme (AC-67), meer instrumenten (AC-104).
