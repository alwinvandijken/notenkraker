# E2E-tests — ontwerp

12 oktober 2026. Eerste opzet van end-to-end-tests voor Notenkraker.

## Doel

Automatisch bewijzen dat de belangrijkste flows in de echte app werken, met echte auth, RLS, rollen en Edge Functions, op de browsermotor die leerlingen gebruiken (Safari op iPad en iPhone). De tests draaien lokaal en in CI en raken nooit de gedeelde Supabase-clouddatabase (develop en productie delen die).

## Uitgangspunten

| Onderwerp | Keuze |
|---|---|
| Framework | Playwright |
| Browser | Alleen WebKit |
| Schermen | iPad (staand, iPad Pro 11) en iPhone (iPhone 14) |
| Backend | Lokale Supabase (`supabase start`), ook in CI |
| Testdata | Per test verse gebruikers via de Supabase admin-API (aanpak A); geen gedeelde seed, geen `db reset` tussen runs |
| App onder test | Productiebuild via `vite preview`, gebouwd met de lokale Supabase-sleutels |

Afgewezen: een vaste seed met reset per run (gedeelde staat, tests moeten serieel) en Supabase nabootsen met `page.route` (test geen RLS, rollen of Edge Functions).

## Structuur

```
apps/e2e/
  package.json            @notenkraker/e2e; script "e2e": "playwright test"
  playwright.config.ts    projecten webkit-ipad en webkit-iphone; webServer; serviceWorkers: 'block'
  supabase-env.ts         lokale Supabase uitlezen en controleren (alleen localhost); met unittest
  check-build.mjs         stopt als de gebouwde app naar een andere Supabase dan de lokale wijst
  fixtures.ts             admin-client, maakGebruiker, maakKind, inloggen, kiesInMenu, speelRonde
  tests/
    zonder-account.spec.ts
    account-kennismaking.spec.ts
    ouder-kind.spec.ts
    leraar-koppelt.spec.ts
```

- Root-`package.json` krijgt het script `"e2e": "pnpm --filter @notenkraker/e2e e2e"`. E2E valt buiten `pnpm test`, zodat unittests snel blijven.
- `apps/e2e` heeft een `test`-script dat alleen de vitest-unittests van de hulpcode draait (`*.test.ts`, geen Supabase nodig), zodat `pnpm test` die meeneemt. De Playwright-specs (`tests/*.spec.ts`) draaien alleen via `pnpm e2e`. Verder `typecheck` (`tsc --noEmit`).
- `@supabase/supabase-js` en `@playwright/test` zijn devDependencies van `apps/e2e`. De regel "`apps/*` importeert nooit `@supabase/supabase-js`" geldt voor de app zelf; `apps/e2e` is testcode en mag het voor het klaarzetten van data. Dit wordt als uitzondering in `docs/ARCHITECTURE.md` vermeld.

## Configuratie en sleutels

- `supabase-env.ts` draait `supabase status -o env` (vanuit de repo-root) en leest `API_URL`, `ANON_KEY` en `SERVICE_ROLE_KEY`. Draait Supabase niet, dan stopt de run met de melding "Start eerst de lokale Supabase: supabase start".
- **Beveiliging:** is de host van `API_URL` niet `localhost` of `127.0.0.1`, dan stopt de run. E2E kan zo nooit tegen de clouddatabase draaien, ook niet met een verkeerde `.env`.
- Sleutels staan nergens in de repo; het zijn de standaard demo-sleutels van de lokale Supabase en ze worden bij elke run uitgelezen.
- Playwright `webServer`: bouwt `@notenkraker/web` met `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` uit de lokale Supabase en start `vite preview --port 4173 --strictPort`. `baseURL` is `http://localhost:4173`. Een draaiende server wordt nooit hergebruikt (`reuseExistingServer: false`), zodat er nooit een build tegen de clouddatabase wordt getest.
- De `webServer`-omgeving moet al bij het laden van de config bekend zijn. Daarom leest `playwright.config.ts` de sleutels zelf uit (synchroon, via `supabase-env.ts`), en die helper doet ook de controle op de host. De fixtures gebruiken dezelfde helper; een aparte global setup is niet nodig.
- `apps/web/.env` kan lokaal de cloud-URL bevatten. Vite geeft variabelen uit de omgeving voorrang boven `.env`, en `check-build.mjs` controleert na de build dat de bundel de lokale URL bevat en geen `supabase.co`. Pas daarna start `vite preview`.
- `serviceWorkers: 'block'`, zodat een gecachte oude build geen vals rood geeft.
- Lokaal geen retries; in CI één retry. Trace en screenshot bij falen (`trace: 'retain-on-failure'`).

## Fixtures

- `admin`: Supabase-client met de service-role-sleutel.
- `maakGebruiker(rol: 'leerling' | 'ouder' | 'leraar', opties?)`: maakt een gebruiker met uniek e-mailadres (`<rol>-<random>@test.local`), vast testwachtwoord en bevestigd e-mailadres (`auth.admin.createUser` met `email_confirm: true`). De rol en weergavenaam komen in de database zoals de app ze verwacht (dezelfde velden die `signUpWithPassword` zet); `leraar` wordt alleen zo toegekend. - `maakKind(ouder, naam)`: zet direct in de database een kind (altsax) onder een ouder, voor scenario's die niet over het aanmaken gaan.
- `inloggen(page, gebruiker)`: logt in via het inlogformulier op `/app`, net als een echte gebruiker.
- `kiesInMenu(page, label)` en `speelRonde(page)`: hamburgermenu openen en een keuze maken; een ronde notenspel uitspelen door steeds de eerste naamknop te tikken tot "▶ Spelen" terugkomt.
- Testgebruikers worden niet opgeruimd; de lokale database is wegwerp. `supabase db reset` maakt hem leeg wanneer je wilt.

## Scenario's

1. **Zonder account** (`zonder-account.spec.ts`): `/` → "Start zonder account" → kennismaking overslaan → Grepen: de getoonde noot op "Kent al" → Notenspel: een ronde uitspelen → Start toont "… die je kent" → herladen: geen kennismaking, dezelfde tekst.
2. **Account + kennismaking** (`account-kennismaking.spec.ts`): `/app?nieuw` → account maken via het formulier (naam, e-mail, wachtwoord, rol leerling) → kennismaking: "9 – 12 jaar", "Net begonnen" → het notenspel ("▶ Spelen"). Uitloggen en opnieuw inloggen: geen kennismaking meer.
3. **Ouder en kind** (`ouder-kind.spec.ts`): ouder via fixture → "Mijn kinderen": kind aanmaken, leeftijd en ervaring als ouder invullen → "Oefenen" bij het kind, notentoets overslaan, een ronde uitspelen → Overzicht: kaart van het kind → kindpagina: de ronde staat onder Notenspel ("… van … goed").
4. **Leraar koppelt leerling** (`leraar-koppelt.spec.ts`): ouder met kind (fixtures) → "Mijn kinderen" → "Code voor leraar" (Edge Function `invite-code`) → leraar (fixture, tweede browsercontext) vult de code in bij "Mijn leerlingen" (Edge Function `link-student`) → het kind staat in de lijst en in het overzicht van de leraar. Zo werkt koppelen in de app: de code komt van de ouder.

Bij het notenspel wordt niet gecontroleerd of antwoorden goed zijn (de noten zijn willekeurig); wel dat een ronde wordt opgeslagen en zichtbaar is. Vrij oefenen (microfoon) valt buiten deze set: een nep-microfoon is in WebKit niet beschikbaar.

### Selectors

Op rol en zichtbare Nederlandse tekst (`getByRole('button', { name: 'Spelen' })`, `getByLabel(...)`). Alleen waar dat niet eenduidig kan, komt een `data-testid` in de app. Geen CSS-klassen of DOM-structuur.

## CI

Nieuwe job `e2e` in `.github/workflows/ci.yml`, naast `check` en `database`:

1. checkout, pnpm, Node 22, `pnpm install --frozen-lockfile`
2. `supabase/setup-cli@v1` (zelfde versie als de databasejob), `supabase start` (inclusief Edge Functions; diensten die e2e niet nodig heeft, zoals Studio, worden met `-x` overgeslagen)
3. `pnpm --filter @notenkraker/e2e exec playwright install --with-deps webkit`
4. `pnpm e2e`
5. Bij falen: `apps/e2e/playwright-report` en `apps/e2e/test-results` uploaden als artefact.

`supabase start` leest `env(GOOGLE_CLIENT_ID)` en `env(GOOGLE_CLIENT_SECRET)` uit `config.toml`; zonder die variabelen moet start nog steeds slagen (zoals nu in de databasejob met `db start`). Lukt dat niet, dan krijgt de job lege dummywaarden.

## Lokaal

```sh
supabase start
pnpm e2e                      # beide projecten
pnpm e2e --project webkit-ipad
pnpm e2e --ui                 # interactief
```

Eenmalig: `pnpm --filter @notenkraker/e2e exec playwright install webkit`. De README krijgt een korte sectie "E2E-tests".

## Bekende risico's

- Er lopen feature-branches (leraar-desktop AC-117, opdrachten en opnames AC-118, update-balk) die schermen uit scenario 3 en 4 wijzigen. Na hun merge kunnen e2e-tests rood worden; die branches werken de tests dan bij. Dat is de bedoeling.
- WebKit op Linux (CI) is niet exact Safari op iPadOS, wel dezelfde motor.
- `supabase start` in CI kost ongeveer een tot twee minuten (Docker-images).

## Buiten scope

- Chromium en Firefox, desktopindeling.
- Vrij oefenen met microfoon, Google-login.
- Visuele regressietests (screenshots vergelijken).
- E2E tegen de Netlify-previews of de clouddatabase.
