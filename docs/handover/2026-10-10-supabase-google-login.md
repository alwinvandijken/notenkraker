# Handover: Supabase en inloggen met Google (AC-63)

Opgesteld 10 oktober 2026. Bedoeld voor een nieuwe Claude Code-sessie die dit zelfstandig oppakt.

## 0. Eerst: worktree opzetten

Werk niet in de hoofdmap op `main`. Maak een eigen worktree met een branch voor AC-63:

```bash
cd ~/Projects/github.com/alwinvandijken/notenkraker
git fetch origin
git worktree add ../notenkraker-ac-63 -b feature/ac-63-supabase-google-login main
cd ../notenkraker-ac-63
pnpm install
```

(In Claude Code kan dit ook met de ingebouwde worktree-functie; de branchnaam moet `ac-63` bevatten zodat Linear hem koppelt.)

Lees daarna `docs/ARCHITECTURE.md` en het Linear-issue AC-63 (project Notenkraker, team Apex Chef).

## 1. Wat er al staat

Je hoeft dit niet opnieuw te bouwen. Controleer het alleen.

| Onderdeel | Waar |
|---|---|
| Databaseschema met RLS, rollen `leerling`/`leraar`, trigger `handle_new_user` | `supabase/migrations/0001_init.sql` |
| Supabase-config, Google-provider aan via env-variabelen | `supabase/config.toml` |
| Edge Functions `rounds`, `invite-code`, `link-student` | `supabase/functions/` |
| Client met `signInWithPassword`, `signUpWithPassword`, `signInWithGoogle` | `packages/client/src/supabase.ts` |
| Inlogscherm met e-mail/wachtwoord en "Doorgaan met Google" | `apps/web/src/screens/Auth.tsx` |
| Netlify-build en SPA-redirect | `netlify.toml` |
| Env-voorbeeld (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | `apps/web/.env.example` |

Zonder `.env` draait de app lokaal op localStorage. Met de twee variabelen schakelt hij over naar Supabase.

## 2. Wat er nog moet gebeuren

De stappen met **(Alwin)** vragen een handeling in een webdashboard of een geheim dat alleen Alwin heeft. Vraag daar om en wacht. Voer nooit zelf een betaalde of onomkeerbare actie uit zonder bevestiging.

1. **Supabase-project (Alwin).** Bestaat er al een project voor Notenkraker? Zo niet: aanmaken in regio EU (Frankfurt). Noteer project-ref, URL en anon key. De service-role key blijft buiten de repo.
2. **Supabase CLI koppelen.** `supabase --version` controleren, dan `supabase login` (Alwin doet dit zelf met `! supabase login`) en `supabase link --project-ref <ref>`.
3. **Migratie toepassen.** `supabase db push`. Controleer daarna in het dashboard dat alle tabellen RLS aan hebben.
4. **Edge Functions deployen.** `supabase functions deploy rounds invite-code link-student`.
5. **Google OAuth-client (Alwin).** In Google Cloud Console: OAuth-toestemmingsscherm (extern, app-naam Notenkraker) en een OAuth-client van type "Web application".
   - Authorized JavaScript origins: de Netlify-URL en `http://localhost:5173`.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
6. **Google aanzetten in Supabase (Alwin).** Authentication › Providers › Google: client-id en secret invullen. Het secret komt nooit in de repo.
7. **Redirect-URL's in Supabase.** Authentication › URL Configuration: Site URL = productie-URL op Netlify. Extra redirect-URL's: `http://localhost:5173` en het patroon voor Netlify deploy previews (`https://deploy-preview-*--<site>.netlify.app`). Werk `supabase/config.toml` bij als de echte Netlify-URL afwijkt van `notenkraker.netlify.app`.
8. **Netlify env-variabelen (Alwin of via `netlify env:set`).** `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` voor productie en deploy previews; daarna opnieuw deployen.
9. **Lokale `.env`.** `apps/web/.env` met dezelfde twee waarden (staat in `.gitignore`).

## 3. Bekend open punt: rol bij Google-login

`handle_new_user` leest de rol uit `raw_user_meta_data.role`. Bij registratie met e-mail stuurt `Auth.tsx` die mee, maar bij Google-login niet, dus elke Google-gebruiker wordt `leerling` en krijgt automatisch een leerlingprofiel. Een ouder of leraar die met Google inlogt, komt dus verkeerd binnen.

Voorstel om uit te werken (met Alwin afstemmen voor je bouwt):
- Na de eerste Google-login een kort scherm "Ben je leerling of leraar/ouder?" als het profiel nog geen bewuste rolkeuze heeft (bijvoorbeeld een kolom `role_confirmed boolean default false` in `profiles`).
- Kiest iemand leraar: rol aanpassen via een Edge Function of RPC en het automatisch aangemaakte leerlingprofiel weer weghalen.
- Schrijf dit als nieuwe migratie (`0002_…`), pas `0001` niet aan.

## 4. Klaar als

- [ ] Registreren en inloggen met e-mail werkt op de Netlify-URL.
- [ ] "Doorgaan met Google" werkt op de Netlify-URL en lokaal, en komt terug in de app.
- [ ] Een Google-gebruiker kan kiezen of hij leerling of leraar/ouder is.
- [ ] Een gespeelde ronde komt via de Edge Function `rounds` in de tabel `rounds`.
- [ ] Een leraar kan met een uitnodigingscode een leerling koppelen.
- [ ] `pnpm test && pnpm typecheck && pnpm build` slaagt; CI is groen.
- [ ] Geen geheimen in de repo (`git grep -i "secret\|service_role"` levert niets op behalve deze tekst en env-namen).
- [ ] `docs/ARCHITECTURE.md` bijgewerkt waar iets afwijkt; AC-63 in Linear bijgewerkt met wat er gedaan is.

## 5. Afspraken

- Commitberichten in het Nederlands, kort. Geen "Generated with Claude Code"-footer.
- Werk op de branch in de worktree; maak aan het eind een PR naar `main`.
- Vraag eerst voordat je iets in een dashboard verwijdert of een betaald plan kiest.
- Vervolg na deze handover: technische implementatie van de mock-ups in basislook A, architectuur en datamodel verder uitwerken (skins als themalaag, niveaus, dagdoel). Mock-ups: https://claude.ai/artifact/HMfEAxCdmRDtSYoDkQJo2f · Features: https://claude.ai/artifact/SzYMiEVnHYz6CSACD7WFcn
