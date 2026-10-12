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
  supabase-env.ts         lokale Supabase controleren (alleen localhost), URL en sleutels uitlezen
  global-setup.ts         URL en service-sleutel klaarzetten voor de fixtures
  fixtures.ts             maakGebruiker, inloggen, admin-client
  tests/
    zonder-account.spec.ts
    account-kennismaking.spec.ts
    ouder-kind.spec.ts
    leraar-koppelt.spec.ts
```

- Root-`package.json` krijgt het script `"e2e": "pnpm --filter @notenkraker/e2e e2e"`. E2E valt buiten `pnpm test`, zodat unittests snel blijven.
- `apps/e2e` heeft geen `test`-script en wordt daardoor niet door `pnpm -r test` opgepakt. Wel `typecheck` (`tsc --noEmit`).
- `@supabase/supabase-js` en `@playwright/test` zijn devDependencies van `apps/e2e`. De regel "`apps/*` importeert nooit `@supabase/supabase-js`" geldt voor de app zelf; `apps/e2e` is testcode en mag het voor het klaarzetten van data. Dit wordt als uitzondering in `docs/ARCHITECTURE.md` vermeld.

## Configuratie en sleutels

- `supabase-env.ts` draait `supabase status -o env` (vanuit de repo-root) en leest `API_URL`, `ANON_KEY` en `SERVICE_ROLE_KEY`. Draait Supabase niet, dan stopt de run met de melding "Start eerst de lokale Supabase: supabase start".
- **Beveiliging:** is de host van `API_URL` niet `localhost` of `127.0.0.1`, dan stopt de run. E2E kan zo nooit tegen de clouddatabase draaien, ook niet met een verkeerde `.env`.
- Sleutels staan nergens in de repo; het zijn de standaard demo-sleutels van de lokale Supabase en ze worden bij elke run uitgelezen.
- Playwright `webServer`: bouwt `@notenkraker/web` met `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` uit de lokale Supabase en start `vite preview --port 4173 --strictPort`. `baseURL` is `http://localhost:4173`. Lokaal wordt een draaiende server hergebruikt (`reuseExistingServer: !process.env.CI`).
- De `webServer`-omgeving moet al bij het laden van de config bekend zijn. Daarom leest `playwright.config.ts` de sleutels zelf uit (synchroon, via een gedeelde helper `supabase-env.ts`), en doet die helper ook de controle op host en bereikbaarheid. `global-setup.ts` zet alleen `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` klaar voor de fixtures.
- `serviceWorkers: 'block'`, zodat een gecachte oude build geen vals rood geeft.
- Lokaal geen retries; in CI één retry. Trace en screenshot bij falen (`trace: 'retain-on-failure'`).

## Fixtures

- `admin`: Supabase-client met de service-role-sleutel.
- `maakGebruiker(rol: 'leerling' | 'ouder' | 'leraar', opties?)`: maakt een gebruiker met uniek e-mailadres (`<rol>-<random>@test.local`), vast testwachtwoord en bevestigd e-mailadres (`auth.admin.createUser` met `email_confirm: true`). De rol en weergavenaam komen in de database zoals de app ze verwacht (dezelfde velden die `signUpWithPassword` zet); `leraar` wordt alleen zo toegekend. Waar een scenario de kennismaking wil overslaan, kan de fixture die als ingevuld markeren.
- `inloggen(page, gebruiker)`: logt in via het inlogformulier op `/app`, net als een echte gebruiker.
- Testgebruikers worden niet opgeruimd; de lokale database is wegwerp. `supabase db reset` maakt hem leeg wanneer je wilt.

## Scenario's

1. **Zonder account** (`zonder-account.spec.ts`): `/` → kies "zonder account" → grepentabel, kies een noot → notenspel, speel een ronde uit (willekeurige antwoorden) → herlaad: de notenstatus van die browser staat er nog.
2. **Account + kennismaking** (`account-kennismaking.spec.ts`): `/app?nieuw` → account maken via het formulier (e-mail, wachtwoord, rol leerling) → kennismaking invullen (leeftijd, notenkennis) → startscherm. Uitloggen en opnieuw inloggen: geen kennismaking meer.
3. **Ouder en kind** (`ouder-kind.spec.ts`): ouder via fixture → "Mijn kinderen": kind aanmaken → als dat kind een ronde notenspel spelen → overzicht van de ouder toont activiteit voor het kind → kindpagina toont de ronde.
4. **Leraar koppelt leerling** (`leraar-koppelt.spec.ts`): leraar via fixture maakt een uitnodigingscode → leerling (fixture, tweede browsercontext) vult de code in (Edge Function `link-student`) → de leerling verschijnt in het overzicht van de leraar.

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
