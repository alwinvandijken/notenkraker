# Lesgroepen beheren (AC-124 stap 2)

Datum: 13-10-2026. Bouwt voort op stap 1 (`docs/superpowers/specs/2026-10-12-opdrachten-over-lessen-design.md`, migratie 0014). Mock-up: `docs/mockups/Lesgroepen-beheren.html`.

## Doel

Een leraar maakt groepen met meer leerlingen, stelt het rooster in en beheert de lessen: gegeven, gepland, afgezegd, verzet en vakantie. Groepshuiswerk geeft hij één keer; per leerling volgt hij wie klaar is. Een leerling kan in een privéles én een groepsles zitten.

## Besluiten (Alwin, 13-10-2026)

1. **Groepen staan bij Leerlingen**, met een schakelaar Leerlingen | Groepen (alleen voor een leraar). Geen extra tab.
2. **Groepshuiswerk geef je één keer.** Iedereen in de groep ziet dezelfde opdrachten. Vinkjes, opnames, status en cijfer blijven per leerling.
3. **Een leerling kan in meer groepen zitten.** Vandaag toont het huiswerk van alle lopende lessen, met de groepsnaam erboven als het er meer dan één is.
4. **Lessenoverzicht:** gegeven, gepland, afgezegd; een les afzeggen of verzetten; vakanties overslaan; een begintijd in het rooster.
5. **Vakanties gelden voor al je groepen** (per leraar). Een losse les afzeggen kan altijd.
6. **Afzeggen van een les met klaargezet huiswerk:** dat huiswerk schuift mee naar de eerstvolgende les die doorgaat.
7. **Een leerling uit de groep halen:** vanaf vandaag geen nieuw groepshuiswerk. Eerdere vinkjes en opnames blijven; de leraar kan ze terugluisteren.
8. **Dagdoel bij meer groepen:** de minuten per dag van alle lopende lessen opgeteld, tot AC-122 het per opdracht regelt.
9. **Groepshuiswerk en privéles blijven gescheiden.** Iets extra's voor één leerling geef je in zijn privéles.
10. **Ouders** krijgen geen groepenbeheer; hun thuis-groep blijft zoals hij is.

## Model (migratie 0015)

| Wijziging | Waarom |
|---|---|
| `lesson_groups.ended_on date` | groep opheffen: geen nieuwe lessen meer, geschiedenis blijft |
| privégroep = groep met `name = ''` | `ensure_group` zoekt alleen naamloze groepen; een groep "Samenspel" die krimpt tot één leerling wordt geen privéles |
| `lessons.status`: nieuw `gestopt` naast `gepland`, `gegeven`, `afgezegd` | "Huiswerk stoppen" (`end_lesson`) en "les afzeggen" zijn verschillend: na stoppen loopt het vorige huiswerk niet weer door (stap 1, klein punt 1); na afzeggen wel. Bestaande `afgezegd`-lessen worden `gestopt` (afzeggen bestond nog niet). |
| `lessons.reason text` | reden van afzeggen ("leraar ziek") |
| `lessons.original_date date` | verzette les: de roosterdag waar hij vandaan kwam, zodat die dag niet opnieuw als les verschijnt |
| nieuwe tabel `holidays` (`id`, `teacher_id`, `name`, `start_date`, `end_date`) | vakanties per leraar; lezen alleen de leraar zelf |
| `schedule_rules.start_time` wordt gebruikt | begintijd in het rooster; nieuwe lessen nemen hem over |

**Afgeleide regels (vervangen die van stap 1 waar ze verschillen):**

- **Volgende lesdag** `next_lesson_day(groep, na datum)`: de eerstvolgende roosterdag die niet in een vakantie van de leraar valt, waarop geen les is afgezegd of gestopt, en waar geen les vandaan verzet is. Geen rooster: geen dag (null).
- **Einde van de huiswerkperiode** `lesson_end`: de dag vóór de vroegste van (a) de volgende les van de groep die niet afgezegd is (gepland, gegeven of gestopt) en (b) de volgende lesdag. Anders `date + 6`.
- **De les heeft een berekende kolom `end_date`** (PostgREST, `end_date(lessons)`), zodat de client het einde uit de database haalt; ook een leerling die de volgende les nog niet ziet krijgt de juiste datum (stap 1, klein punt 3).
- **Wie een les ziet:** de leraar van de groep altijd; een lid als zijn lidmaatschap de huiswerkperiode raakt (`joined_on <= end_date` en `left_on` leeg of na de lesdatum), en de les begonnen is (stap 1, klein punt 5).
- **Vinkje en opname** alleen voor een lid van die les (dezelfde periode-regel); een opname alleen bij een huidig lid.
- **"Volgende les"** = de eerstvolgende bestaande les die niet afgezegd of gestopt is, anders een nieuwe op de volgende lesdag (of vandaag + 7 zonder rooster).

## Functies (database)

Alle schrijven via functies; elke functie controleert dat de aanroeper de leraar van de groep is (`is_group_teacher`). Hulpfuncties krijgen `revoke execute … from public, anon` (stap 1, klein punt 4).

| Functie | Wat |
|---|---|
| `create_group(p_name, p_students uuid[], p_weekday, p_start_time)` | alleen een leraar; naam verplicht; elke leerling moet bij hem horen; geeft het id |
| `rename_group(p_group, p_name)` | |
| `add_member(p_group, p_student)` | lid vanaf vandaag; was hij eerder lid, dan opnieuw vanaf vandaag |
| `remove_member(p_group, p_student)` | `left_on = vandaag`; vinkjes en opnames blijven |
| `end_group(p_group)` | `ended_on = vandaag`; daarna geeft `lesson_for` een fout |
| `set_schedule(p_group, p_weekday, p_start_time)` | vervangt de versie van stap 1 (nu met tijd) |
| `cancel_lesson(p_group, p_date, p_reason)` | een les op of na vandaag afzeggen (ook een roosterdag waar nog geen les voor bestaat). Klaargezet huiswerk schuift naar de eerstvolgende les die doorgaat, met noten, minuten en opmerking als die les nog leeg is |
| `move_lesson(p_group, p_date, p_new_date, p_start_time)` | een les (of roosterdag) naar een andere dag op of na vandaag; fout als daar al een les is |
| `add_holiday(p_name, p_from, p_to)`, `remove_holiday(p_id)` | vakanties van de leraar |
| `end_lesson(p_lesson)` | blijft "Huiswerk stoppen", zet nu `gestopt` |
| `give_homework`, `update_lesson` | controleren nu ook de noten (hooguit 40, alleen tekst) en de datum (niet leeg, geen andere les op die dag) (stap 1, klein punt 4) |
| `set_progress` | alleen voor een leerling die lid is (of was) van de groep (stap 1, klein punt 4) |

## Client (`@notenkraker/client`)

- **`Homework`** krijgt `groupName` (leeg voor privé en thuis) en `dueDate` uit `end_date`.
- **Nieuwe `GroupsApi`** (alleen voor leraren):
  - `mine()`: mijn groepen (ook privélessen, met de naam van de leerling), met leden, rooster, de laatste en de volgende les;
  - `get(groupId)`: één groep met leden (ook vertrokken), lessen, en per les het huiswerk met per leerling vinkje, opnames en voortgang;
  - `create`, `rename`, `addMember`, `removeMember`, `end`, `setSchedule(groupId, weekday, time)`;
  - `cancelLesson(groupId, date, reason)`, `moveLesson(groupId, date, newDate, time)`;
  - `holidays()`, `addHoliday`, `removeHoliday`.
- **`homework.giveToGroup(groupId, which, input, tasks, carry)`** naast `give` (dat blijft per leerling, voor privéles en thuis).
- **Helper met unit-tests:** `lessonOverview(lessons, schedule, holidays, from, weeks)` maakt de lijst van het lessenoverzicht: echte lessen plus de roosterdagen in de vakantie (als "vakantie") en de komende roosterdagen (als "gepland"). Status "gegeven" voor een geplande les waarvan de datum voorbij is.
- **Lokale client** (zonder account): geen groepen; `groupName` leeg.

## Schermen

Zie de mock-up. Alles als pagina, geen modals; leesbaar op een staande iPhone.

1. **Leerlingen | Groepen** (alleen leraar). Groepen toont groepen en privélessen, gesorteerd op de volgende les, met status van de laatste les en de volgende datum. Knoppen "+ Nieuwe groep" en "Vakanties". Opgeheven groepen staan er niet in.
2. **Nieuwe groep:** naam, leerlingen (van deze leraar), rooster (dag en begintijd, mag leeg).
3. **Groepspagina** met tabs **Deze les**, **Volgende les**, **Lessen**, **Groep**:
   - Deze les en Volgende les: de opdrachten met per leerling een stip (klaar of niet; tik = de taakpagina van die leerling bij die opdracht), en de oefenminuten deze week per leerling. Knop "Huiswerk geven" (zoals bij één leerling, met "Loopt nog", maar voor de groep).
   - Lessen: het lessenoverzicht. Tik op een geplande les of roosterdag: pagina "Les" met **Verzetten** (datum, tijd) en **Afzeggen** (reden).
   - Groep: leden (met "sinds"), toevoegen en eruit halen, naam, rooster wijzigen, groep opheffen.
4. **Vakanties:** lijst, toevoegen (naam, van, tot en met), verwijderen.
5. **Vandaag** (leerling): bij meer dan één lopende les een kopje per groep ("Privéles · tot di 20 okt", "Samenspel zaterdag · tot za 31 okt"). Het dagdoel is de som van de lopende lessen.
6. **Kindpagina** (leraar): blijft de privéles. Zit het kind ook in een groep van deze leraar, dan staat er "Ook in: Samenspel zaterdag →" met een link naar de groepspagina.
7. **"Herhalen"** in de leerlingentabel meldt eerlijk of er al een volgende les was ("opdrachten erbij gezet") (stap 1, klein punt 2).

## Uitrol

- Migratie 0015 eerst naar de cloud (Alwin), dan mergen, dan meteen release naar main. Productie (0.2.0) ziet gestopte lessen anders zolang die release niet gedaan is.
- Versie: release wordt 0.3.0, develop daarna 0.3.1.

## Tests

- **pgTAP** `supabase/tests/lesgroepen-beheren.test.sql`: groep maken (en geweigerd met een leerling van een ander), lid erbij en eruit (vertrokken lid ziet nieuw huiswerk niet, oud wel; nieuw lid ziet de lopende les), opheffen, rooster met tijd, afzeggen schuift huiswerk door, verzetten, vakantie wordt overgeslagen door `next_lesson_day` en `lesson_end`, stoppen houdt het vorige huiswerk gestopt, privégroep blijft privé als een groep krimpt, validatie van noten en datum, `set_progress` voor een niet-lid geweigerd, anon kan hulpfuncties niet aanroepen.
- **Unit:** `lessonOverview`, groeperen per groep en dagdoel op Vandaag.
- **e2e** `groepen.spec.ts`: leraar maakt een groep met twee leerlingen, geeft groepshuiswerk, beide leerlingen zien het; één vinkt af en de leraar ziet de stip; les afzeggen en het huiswerk loopt door; vakantie toevoegen en de volgende les springt eroverheen.

## Bewust niet

- Meer roosterregels per groep (twee keer per week).
- Een leerling binnen de groep extra opdrachten geven (gaat via de privéles).
- De lijst van alle lessen inperken in de client (stap 1, klein punt 6): later, als het traag wordt.
