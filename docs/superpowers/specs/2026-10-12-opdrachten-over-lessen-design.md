# Opdrachten over meer lessen (AC-124)

Datum: 12-10-2026. Mock-up: `docs/mockups/Opdrachten-over-lessen.html`.

## Doel

Een opdracht kan over meer lessen lopen. Is hij te moeilijk voor één week, dan gaat hij mee naar de volgende les. Hij houdt daarbij zijn opnames, reacties en geschiedenis. Dit is ook het fundament voor:

- **AC-122:** minuten per opdracht;
- **het jaarprogramma:** opdrachten voorbereiden en aan één of meer lessen toewijzen.

## Besluiten (Alwin, 12-10-2026)

1. **Meegaan kies je bij de volgende les.** Bij huiswerk geven voor de volgende les staan de opdrachten van deze les onder "Loopt nog", elk met een vinkje "gaat mee".
2. **Het blijft één opdracht, met zijn geschiedenis.**
   - Hij krijgt het label "2e week", "3e week", enzovoort.
   - De opnames en reacties van alle weken staan erbij, per week gegroepeerd.
   - Het vinkje begint elke les opnieuw.
3. **De beste oplossing, niet de kleinste.**
   - Het is nog een proefconcept, dus de data is verwaarloosbaar.
   - De opdracht wordt los van de les, met een koppeling les ↔ opdracht (optie A).
   - De app op productie breekt tot develop naar main gaat. Dat doen we direct na de merge.

## Model

Huidige tabellen: `homework` (huiswerk per gever per les, sinds 0013 met `start_date`) en `homework_tasks` (opdracht binnen één huiswerk). Nieuw in **0014**:

| Tabel | Wat | Kolommen |
|---|---|---|
| `homework` | blijft: het huiswerk van één gever voor één les | weg: `piece`, `piece_note` (zijn al opdrachten) |
| `assignments` (nieuw) | een opdracht voor één leerling, los van de les | `id`, `student_id`, `given_by`, `kind` (`stuk`, `opdracht`), `title`, `book_title`, `book_author`, `page`, `chapter`, `number`, `track`, `bank_id`, `sheet_path`, `sheet_name`, `example_path`, `recording`, `created_at` |
| `homework_items` (nieuw) | koppeling huiswerk ↔ opdracht | `homework_id`, `assignment_id`, `position`, `done_at`; primaire sleutel (`homework_id`, `assignment_id`) |
| `task_recordings` | blijft, maar hoort bij de opdracht | `task_id` wordt `assignment_id` (FK naar `assignments`) |
| `homework_tasks` | vervalt | de bestaande rijen worden een opdracht met hetzelfde id, plus één koppeling |

Later, in AC-122: `homework_items.minutes_per_day`, en een soort `notenspel` voor opdrachten.

Opmerkingen bij het model:

- **Week van een opdracht:** de plek van dit huiswerk tussen alle huiswerken van de opdracht, gesorteerd op `start_date` (1e, 2e, …).
- **Opnames per week:** een opname hoort bij de week waarin `submitted_at` valt, binnen start en eind van een gekoppeld huiswerk.
- **Bewaartermijn:** 4 weken na de laatste einddatum van alle huiswerken van de opdracht. Zo blijft een meegenomen opname bewaard.
- **Leesrechten (RLS):**
  - `assignments`: wie bij de leerling mag (`can_access_student`).
  - `homework_items`: zichtbaar als het huiswerk zichtbaar is. Huiswerk dat nog niet begonnen is, ziet alleen wie het gaf (zoals in 0013).
  - Een opdracht die alleen in een nog niet begonnen les zit, ziet de leerling nog niet.
- **Storage:** de regel "bladmuziek lezen" en het pad van opnames verwijzen naar `assignments`. Het pad wordt `<student_id>/<assignment_id>/…`, en blijft dus geldig voor bestaande bestanden.
- **Schrijven** gaat alleen via functies, zoals nu.

## Functies (database)

| Functie | Wat |
|---|---|
| `give_for_lesson(p_students, p_which, p_notes, p_minutes, p_days, p_remark, p_tasks, p_carry uuid[])` | Zoals in 0013. Nieuw: `p_carry` zijn opdrachten die meegaan; die krijgen een koppeling met het huiswerk van die les. De functie controleert dat het opdrachten van de leerling zijn die de gever zelf gaf. Nieuwe opdrachten worden een opdracht plus een koppeling. |
| `update_homework(…, p_tasks)` | Zoals in 0013. Een opdracht met `id` wordt bijgewerkt; een weggehaalde opdracht verliest alleen zijn koppeling met dit huiswerk. De opdracht zelf gaat weg als hij nergens meer aan hangt en geen opnames heeft. |
| `set_item_done(p_homework, p_assignment, p_done)` | Vervangt `set_task_done`; het vinkje hoort bij de les. |
| `submit_recording`, `delete_recording`, `react_to_recording` | Zelfde gedrag, met `assignment_id`. |
| `expired_recordings`, `mark_recordings_deleted` | Op basis van de laatste einddatum van de opdracht. |
| `assign_tasks` | Opdrachten uit de bibliotheek bij het lopende huiswerk: opdracht plus koppeling. |
| `give_homework_with_tasks`, `give_homework_many`, `react_to_task`, `sync_latest_recording` | Vervallen; de oude kolommen voor de app op productie zijn niet meer nodig. |

## Client (`@notenkraker/client`)

- `HomeworkTask` blijft de vorm voor de schermen, zodat de UI weinig hoeft te veranderen. Erbij komen:
  - `week: number`, met 1 voor de eerste les;
  - `weeks: Array<{ homeworkId, start, due }>`: alle lessen van de opdracht, voor de groepering per week.

  `id` is het id van de opdracht. `doneAt` en `position` komen uit de koppeling.
- **Supabase-query:** `homework` met `homework_items(position, done_at, assignments(*, task_recordings(*), homework_items(homework(id, start_date, due_date))))`.
- **Wijzigingen in de API:**
  - `setTaskDone(homeworkId, taskId, done)`;
  - `giveForLesson(…, carry: string[])`.
- **Weg:** `giveWithTasks` en `giveMany`. De knop "Herhalen" in de leerlingentabel wordt `giveForLesson('volgende', carry = alle opdrachten van mijn lopende huiswerk)`.
- **Nieuwe helper:** `recordingsPerWeek(task)` groepeert de opnames per les (week), nieuwste week eerst.
- **De lokale client** (zonder account) volgt hetzelfde model.

## Schermen

1. **Huiswerk geven, Volgende les:**
   - Een blok **"Loopt nog"** met de opdrachten van mijn lopende huiswerk. Per opdracht staat erbij wat het kind deed (opnames, mijn laatste reactie, afgevinkt).
   - Elke opdracht heeft een vinkje "gaat mee", standaard uit. Bovenaan staat "alles mee".
   - In de kolom van de les staat een aangevinkte opdracht met "2e week".
   - Bij "Deze les" en bij aanpassen is er geen "Loopt nog".
2. **Vandaag en de huiswerkkaart:** het label "2e week" bij een opdracht vanaf week 2.
3. **Taakpagina:**
   - Het label "2e week".
   - "Jouw opnames" per week: "Deze week", "Vorige week · di 13 – ma 19 okt", enzovoort, met de reacties.
4. **Kindpagina** (leraar en ouder): de huiswerkkaart toont de opnames per week, met reacties per opname, zoals nu.

## Uitrol

1. De PR naar develop met migratie 0014. De data gaat mee: elke `homework_tasks`-rij wordt een opdracht plus een koppeling, met hetzelfde id.
2. Alwin pusht 0014 naar de cloud; daarna de merge naar develop.
3. **Direct daarna develop → main.** Vanaf de push werkt de app op productie niet meer met huiswerk, tot main bijgewerkt is.

## Tests

- **pgTAP:**
  - nieuwe `opdrachten-over-lessen.test.sql`: meegaan met behoud van opnames, het vinkje per les, de week, de bewaartermijn over lessen, de leesrechten voor een nog niet begonnen les, en weghalen zonder opnames te verliezen;
  - `opnames`, `meerdere-opnames`, `huiswerk-per-les` en `opdrachten` aangepast aan het nieuwe model.
- **Unit:** `recordingsPerWeek` en de berekening van de week.
- **E2E:**
  - nieuw `opdracht-meenemen.spec.ts`: de leraar geeft deze les met een stuk; er komt een opname (via admin); de volgende les met "gaat mee"; het kind ziet op de startdatum "2e week" en de opname van vorige week (startdatum via admin naar vandaag);
  - de bestaande specs blijven groen.

## Buiten deze stap

- AC-122, minuten per opdracht. Komt op `homework_items`.
- Het jaarprogramma: opdrachten vooraf plannen per les en toewijzen.
- Een opdracht uit een al afgelopen les terughalen. Dat komt via het jaarprogramma en de bibliotheek.
