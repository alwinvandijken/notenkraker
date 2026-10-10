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
| Backend | **Supabase**: Postgres + RLS, Auth, PostgREST, Realtime, Edge Functions. Project `notenkraker` (ref `mtkkxpycnzleqdkvkegy`), regio West EU (Paris) | Geen eigen server; auth met e-mail/wachtwoord en Google (later meer SSO) |
| Rollen | `leerling` en `ouder` kies je zelf; `leraar` en `admin` wijst Alwin toe in Supabase (AC-106) | Een ouder heeft één login en maakt daaronder kinderen aan; een kind kan met een code van de ouder een eigen login koppelen. Een leraar koppelt leerlingen met een uitnodigingscode. Een admin leest alles. Zie "Rollen en toegang" |
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
| `/` | Welkomstpagina (AC-114): wat Notenkraker is, met twee keuzes: zonder account (`/oefenen`) of gratis account (`/app`). Vinkje "niet meer tonen" stuurt `/` voortaan direct door naar de laatste keuze; `/?welkom` toont hem altijd (menu) | iedereen |
| `/oefenen` | Zonder account (`AnoniemApp.tsx`): Start, Grepen, Notenspel, Vrij oefenen. Alles in deze browser (lokale client, sleutel `nk-anoniem`); geen ouder, leraar of huiswerk. Neemt de notenstatus van het proefconcept (AC-107) één keer over | iedereen |
| `/app` | Met account (`AppMetLogin.tsx`); `/app?nieuw` begint bij account maken. Een nieuw account begint leeg; staan er noten van `/oefenen` op het apparaat, dan vraagt de app één keer of die mee moeten (`components/NotenOvernemen.tsx`) | leerling, ouder, leraar |
| `/start` (later) | Start: dagdoel, spel, grepentabel, jouw noten | leerling |
| `/grepen/:noteId?` | Grepentabel | leerling, ouder, leraar |
| `/spel` | Notenspel (tutorial voor nieuwe noten ervoor) | leerling |
| `/pad` | Niveaupad (AC-59) | leerling |
| `/liedjes`, `/liedjes/:id` | Liedje-modus (AC-65) | leerling |
| `/leraar`, `/leraar/:studentId` | Overzicht, notenstatus, les klaarzetten, rondes | leraar |
| `/kies-leerling` | Wie speelt er? (gedeelde gezins-iPad) | ouderaccount op een gedeeld toestel |
| `/instellingen` | Skin kiezen, account | iedereen |
| `/welkom` | Als kind een code van de ouder invoeren, of leerling of ouder kiezen (na eerste Google-login) | gebruiker zonder rol |
| `/overzicht` | Dashboard: per kind of leerling oefentijd deze week, reeks, notenstatus, lastige noten, laatste activiteit (mock-up `docs/mockups/iPadA-Ouder.html`). Startscherm voor ouder en leraar; een leraar ziet wie het langst niet oefende bovenaan | ouder, leraar |
| `/overzicht/kind/:id` | Pagina van één kind: oefentijd per dag (4 dagen in beeld, 4 weken terug te scrollen), sessies vrij oefenen, notenspel, noten. Tik op een dag of sessie voor de dagpagina | ouder, leraar |
| `/overzicht/kind/:id/dag/:datum` | Dagpagina: alle sessies vrij oefenen (cirkel, balkje per minuut, noten, label) en rondes van het notenspel van één dag, met ◀ ▶ naar een andere dag | ouder, leraar |
| `/kinderen` | "Mijn kinderen" (ouder) of "Mijn leerlingen" (leraar): aanmaken, kind laten inloggen (link, QR, code), code voor leraar | ouder, leraar |
| `/profiel` | Naam, e-mail, rol; als leerling alsnog koppelen met een code van de ouder | iedereen |

Nu nog zonder router: `AppMetLogin.tsx` op `/app` wisselt tussen Overzicht (met per kind een eigen pagina, `screens/KindPagina.tsx`), Oefenen, Mijn kinderen en Mijn profiel via het hamburgermenu rechtsboven (`components/Menu.tsx`). De cijfers van het overzicht komen uit `childSummary()` in `@notenkraker/client` (rondes en notenstatus, laatste 7 dagen); oefentijd is de speeltijd van de rondes plus de gespeelde tijd bij vrij oefenen, per dag apart getoond. Het overzicht toont per kind alleen een compacte kaart zonder noten, zodat het ook op een staande iPhone leesbaar blijft; de kindpagina houdt het ook kort en de details (noten, per minuut) staan op de dagpagina (`screens/DagPagina.tsx`). Details zijn pagina's, geen vensters erover. Elk scherm komt in de browsergeschiedenis (`history.pushState`), zodat terug en terugvegen op de iPhone binnen de app blijven en herladen op hetzelfde scherm uitkomt. Vrij oefenen (`screens/VrijOefenen.tsx`, derde onderdeel naast Grepen en Spel) is de oefentimer, zie hieronder. Grepen is de grepentabel van het proefconcept (`screens/Grepentabel.tsx`) met de status van de gekozen leerling.

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
profiles         id (= auth.users.id), role (null|leerling|ouder|leraar|admin), display_name
students         id, owner_id, user_id?, name, instrument_id, naming, age_band ('6-8'|'9-12'|'13-17'|'18+'), experience ('nieuw'|'lt1'|'1-3'|'gt3'), onboarded_at, skin_id*, daily_goal*, time_zone*
teacher_students teacher_id, student_id
invite_codes     code, student_id, purpose ('leraar'|'kind'), expires_at
student_notes    student_id, note_id, status ('kent'|'les'|'moet'), introduced_at*
rounds           id (client), student_id, mode (+'keys'), level_id*, played_at, ms, answers, completed, mistakes, stars, xp, wrong_notes
practice_sessions id, student_id, started_at, ended_at, done, played_seconds, minutes, notes, label ('sax'|'twijfel')
songs            id, student_id, title, instrument_id, source, notes
attempts         id, student_id, song_id, played_at, ms, correct_idx, wrong_idx
lessons*         id, student_id, teacher_id, held_on, remark, daily_goal      + lesson_notes*
student_levels*  student_id, level_id, reached_at, best_stars
student_unlocks* student_id, kind, item_id, unlocked_at
                                                        * = nieuw, nog geen migratie
```

Toegang: `can_access_student(id)` = eigenaar, de leerling zelf, of een gekoppelde leraar. Rondes, niveaus en vrijgespeelde items worden alleen via Edge Functions geschreven (server berekent sterren, XP en beloningen).

### Rollen en toegang

Vastgelegd in `supabase/migrations/0002_rollen.sql`, getest in `supabase/tests/rollen.test.sql`. De UI leest de rechten uit `rightsFor(role)` in `@notenkraker/client`.

| Rol | Hoe je hem krijgt | Mag |
|---|---|---|
| (geen) | eerste Google-login | alleen `/welkom`: `choose_role('leerling'|'ouder')` (eenmalig) of `claim_student(code)` |
| `leerling` | zelf gekozen, of via een kindcode | spelen met het eigen leerlingprofiel; code voor een leraar maken |
| `ouder` | zelf gekozen | kinderen aanmaken onder de eigen login; codes maken voor een leraar of voor het kind zelf |
| `leraar` | Alwin zet hem in Supabase (`update profiles set role = 'leraar' where id = …`) | leerlingen aanmaken; leerlingen koppelen met een code (`link-student`) |
| `admin` | Alwin zet hem in Supabase | alles lezen; schrijven via het dashboard |

- De gebruiker kan alleen `display_name` zelf wijzigen (column grant); de rol nooit. Een rol `leraar` of `admin` in de signup-metadata wordt genegeerd.
- Een kindcode (`purpose = 'kind'`) kan alleen de eigenaar maken, en alleen zolang het kind nog geen eigen login heeft. Een leraarcode werkt niet als kindcode, en omgekeerd.
- Kind laten inloggen: de ouder deelt de link `/app?koppel=CODE` of laat de QR-code scannen. De app onthoudt de code in localStorage (`lib/koppel.ts`), zodat hij het inloggen bij Google overleeft, en roept na het inloggen `claim_student` aan; het welkomscherm wordt dan overgeslagen. Had het kind al een eigen, ongebruikt leerlingprofiel, dan ruimt `claim_student` dat op. Een kind dat al leerling is, kan ook later koppelen via Mijn profiel. Mock-up: `docs/mockups/Koppelen-Kind.html`.

## Noten en toonhoogte

- `NoteId` = Nederlandse naam + octaaf van de **geschreven** toon: `g4`, `fis4`, `bes3`, `c6`.
- Klinkende toon = geschreven + `instrument.transposition` (altsax −9, klarinet −2, dwarsfluit 0).
- Notennamen per leerling: `nl` (fis, bes) of `en` (F♯, B♭).
- Toonherkenning: samples → `detectPitch` → `{hz, midi, cents}` → `NoteMatcher` (goed na 250 ms stabiel, fout na 1200 ms).

### Oefentimer (vrij oefenen, AC-112)

Mock-up: `docs/mockups/Oefentimer.html`. Start en einde van een sessie legt de server vast met zijn eigen klok (`practice_start`, `practice_update`); de app kan geen tijd invoeren. Daartussen luistert de app met de toonherkenning en telt `PracticeTracker` (`core/practice`) alleen de tijd waarin een duidelijke toon in het bereik van het instrument klinkt en minstens 150 ms op dezelfde hoogte blijft (spraak wiebelt). Stilte, praten en ruis tellen niet. Het resultaat is gespeeld van totaal, bijvoorbeeld 16 van 20 min (80%).

- Elke 30 s en bij het wegzetten van de app gaat per minuut de gespeelde tijd en de noten naar de server. Valt de app weg, dan eindigt de sessie bij de laatste update; de volgende start sluit hem af.
- De server weigert meer minuten dan er verstreken zijn en meer dan 60 s per minuut, en kapt af op 3 uur per sessie en per dag.
- Label `twijfel`: minstens 2 min gespeeld met maar één noot. De sessie telt wel mee; de ouder ziet het label.
- Er wordt geen geluid opgeslagen of verstuurd. Een opname via een speaker kan de timer misleiden; de minuten en het label maken dat zichtbaar, niet onmogelijk.
- Een iPad zet de microfoon uit als de app naar de achtergrond gaat; die tijd telt niet. Het scherm blijft aan met de Wake Lock API.

### Kennismaking (AC-115)

Mock-up: `docs/mockups/Kennismaking.html`. De eerste keer oefenen met een leerling zonder `onboarded_at` toont `screens/Kennismaking.tsx`: leeftijdsgroep, hoe lang al spelen en een korte notentoets, elk op een eigen pagina; al beantwoorde vragen worden overgeslagen. Een ouder die een kind toevoegt beantwoordt alleen leeftijd en ervaring; de toets doet het kind zelf. Overslaan of "net begonnen": geen toets, de startnoten op "Komt nog".

- `core/learner`: `ageProfile(band)` (rondelengte, levens, stopwatch, dagdoel: 6–8 jaar 5 noten/4 levens/geen stopwatch/10 min; 9–12 8/3/15 min; 13–17 en 18+ 8/3/20 min), `noteLadder` (startnoten, dan stamtonen naar afstand, dan kruizen en mollen), `PlacementTest` (8 noten, goed +2 treden, fout of "weet ik niet" −1; uitslag = alles tot en met de lastigste goede noot, behalve wat fout ging) en `nextNewNote`.
- Het notenspel gebruikt `ageProfile` en voegt de eerstvolgende nieuwe noot aan de pool toe. De Edge Function `rounds` leest `age_band` voor het aantal levens.
- Het dagdoel staat op het startscherm zonder account; Mijn profiel kan de kennismaking opnieuw starten.

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

```
supabase start && supabase test db          # pgTAP-tests in supabase/tests (Docker nodig)
supabase functions serve --no-verify-jwt     # lokaal; CLI 2.72 kan de ES256-tokens van lokale auth niet controleren
```

## Open vragen

1. **Gedeelde gezins-iPad.** Besloten (AC-106): beide. Standaard spelen kinderen onder het ouderaccount; een kind kan optioneel een eigen Google-login koppelen met een code van de ouder. Nog open: de pincode voor het ouderdeel.
2. **Liedjes delen.** Per leerling (zoals nu) of per leraar met koppeling aan leerlingen? Beslissen vóór AC-65.
3. **Meerdere instrumenten per kind.** Nu één instrument per leerlingprofiel; een tweede instrument is een tweede profiel. Goed genoeg?
4. **Wie mag de notenstatus wijzigen?** In de mock-ups doet alleen de leraar dat. Zonder leraar (kind met eigen account) moet de leerling het zelf kunnen.

## Roadmap

Zie Linear-project Notenkraker (P-AC-56): microfoon in het spel (AC-64), liedje-modus (AC-65), bladmuziek via OMR (AC-66), ritme (AC-67), meer instrumenten (AC-104).
