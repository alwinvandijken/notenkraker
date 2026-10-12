# Lesgroepen, lessen en opdrachten (AC-124)

Datum: 12-10-2026. Bron: het datamodel van Alwin (ER-diagram met SCHOOL, DOCENT, VAK, LEERLING, LESGROEP, GROEPSLID, ROOSTERREGEL, LES, OPDRACHT, VOORTGANG, HUISWERK). Mock-up van het meenemen: `docs/mockups/Opdrachten-over-lessen.html`.

## Doel

- Een opdracht kan over meer lessen lopen. Is hij te moeilijk voor één week, dan komt hij terug als huiswerk in de volgende les, met behoud van opnames, reacties en voortgang.
- Dit is het fundament voor:
  - AC-122: minuten per opdracht;
  - het jaarprogramma: opdrachten voorbereiden en aan één of meer lessen toewijzen;
  - groepslessen.

## Besluiten (Alwin, 12-10-2026)

1. **Het model van Alwin is de basis.** Een opdracht hoort bij een lesgroep. Hij komt terug als huiswerk in een of meer lessen, en heeft voortgang per leerling.
2. **Lesgroepen vanaf het begin.** Een lesgroep met één leerling is een privéles.
3. **Een ouder is een eigen lesgroep:** een "thuis"-groep met het kind. Die werkt zoals een docent: opdrachten en huiswerk per week.
4. **Meegaan kies je bij de volgende les:** "Loopt nog", met per opdracht "gaat mee" (standaard uit) en "alles mee".
5. **Het blijft één opdracht, met zijn geschiedenis.**
   - Hij krijgt het label "2e week".
   - De opnames en reacties staan per week.
   - Het vinkje begint elke les opnieuw.
6. **De beste oplossing, niet de kleinste.**
   - Het is een proefconcept en de data is verwaarloosbaar.
   - De app op productie breekt tot develop naar main gaat. Dat doen we direct na de merge.

## Model

Tabelnamen in het Engels, zoals de rest van de database. Tussen haakjes de naam in Alwins model.

| Tabel | Wat | Kolommen |
|---|---|---|
| `lesson_groups` (LESGROEP) | een docent of ouder met een of meer leerlingen | `id`, `teacher_id` (de gever: leraar of ouder), `teacher_name` (een leerling mag andermans profiel niet lezen), `kind` (`les`, `thuis`), `name`, `created_at` |
| `group_members` (GROEPSLID) | wie in de groep zit, en wanneer | `group_id`, `student_id`, `joined_on` (date), `left_on` (date, null = nog lid) |
| `schedule_rules` (ROOSTERREGEL) | wanneer de groep les heeft | `id`, `group_id`, `weekday` (0 = zondag … 6 = zaterdag), `start_time` (null mag), `valid_from`, `valid_until` (null = open) |
| `lessons` (LES) | één les, of voor een thuis-groep één week | `id`, `group_id`, `schedule_rule_id` (null mag), `date`, `start_time`, `end_time`, `status` (`gepland`, `gegeven`, `afgezegd`), `notes` (noten van deze les, jsonb), `minutes_per_day` (het dagdoel, tot AC-122 het per opdracht verdeelt), `days_per_week`, `remark`, `created_at`; uniek (`group_id`, `date`) |
| `assignments` (OPDRACHT) | een opdracht van de groep | `id`, `group_id`, `created_by`, `kind` (`stuk`, `opdracht`), `title`, `book_title`, `book_author`, `page`, `chapter`, `number`, `track`, `bank_id`, `sheet_path`, `sheet_name`, `example_path`, `recording`, `start_date`, `deadline` (beide null mag), `created_at` |
| `homework` (HUISWERK) | een opdracht als huiswerk in een les | `id`, `lesson_id`, `assignment_id`, `position`, `description` (bijv. "week 2: tot maat 16"); uniek (`lesson_id`, `assignment_id`). AC-122 voegt hier `minutes_per_day` toe. |
| `homework_done` (vinkje per leerling) | afgevinkt in deze les, per leerling | `homework_id`, `student_id`, `done_at` |
| `progress` (VOORTGANG) | een opdracht per leerling | `assignment_id`, `student_id`, `status` (`bezig`, `klaar`), `grade` (decimaal, null mag), `updated_at` |
| `recordings` (was `task_recordings`) | opnames van een leerling bij een opdracht | `id`, `assignment_id`, `student_id`, `path`, `seconds`, `submitted_at`, `deleted_at`, `reaction_emoji`, `reaction`, `reacted_at` |

Bewust nog niet: SCHOOL, VAK, lokaal, lesuur en schooljaar. Ze passen er later bij zonder de rest te verbouwen. `lessons.start_time` en `end_time` mogen leeg blijven.

**Afgeleide regels:**

- **Huiswerkperiode van een les:** van `date` tot de dag vóór de volgende les van dezelfde groep. Is er nog geen volgende les, dan de volgende roosterdag, of anders `date + 6`.
- **De leerling ziet een les** vanaf de lesdatum, als hij op die datum lid is van de groep. Een les die nog moet komen, ziet alleen de docent of ouder van de groep. Zo ziet het kind het huiswerk voor de volgende les niet te vroeg.
- **Week van een opdracht in een les:** de plek van deze les tussen alle lessen waarin de opdracht als huiswerk staat, gesorteerd op `date`.
- **Opnames per week:** een opname hoort bij de les in wiens periode `submitted_at` valt.
- **Bewaartermijn van opnames:** 4 weken na het einde van de laatste les waarin de opdracht als huiswerk staat.
- **"Deze les" en "volgende les"** komen uit `lessons`. Bestaat de volgende les nog niet, dan maakt de functie hem aan met de datum uit `schedule_rules` (of vandaag + 7 als er geen rooster is).
- **Toegang** blijft zoals nu (`can_access_student`, `teacher_students`). Een docent maakt alleen een groep met leerlingen bij wie hij mag. De eerste keer dat een docent of ouder huiswerk geeft aan een leerling zonder groep, maakt de app vanzelf een privégroep (`les` of `thuis`).

## Overzetten van de bestaande data (migratie 0014)

Het gaat om weinig data, maar we zetten het toch over; dat kost weinig.

- Per (gever, leerling) uit `homework` ontstaat één groep:
  - `kind` is `les` voor een leraar en `thuis` voor een ouder;
  - de leerling wordt lid;
  - de lesdag `students.lesson_weekday` wordt een roosterregel van de lesgroep van een leraar (bij een ouder van de thuis-groep).
- Elk `homework` wordt een `lessons`-rij: `date` = `start_date`, `days_per_week`, `remark` en `notes` gaan mee, en `status` wordt `gegeven` als de les al begonnen is, anders `gepland`.
- Elke `homework_tasks`-rij wordt:
  - een `assignments`-rij, met hetzelfde id;
  - een `homework`-rij voor die les;
  - een `homework_done`-rij als hij afgevinkt was.
- `task_recordings` wordt `recordings`: `assignment_id` = het oude `task_id`, `student_id` = de leerling van het huiswerk. Opnamepaden (`<student>/<task>/…`) blijven geldig.
- Daarna vervallen de oude tabellen en functies: `homework`, `homework_tasks`, `task_recordings`, `students.lesson_weekday`, en de functies die erbij horen. De sjablonen (`homework_templates`) blijven; hun opdrachten-JSON past zonder wijziging.

## Functies (database)

Schrijven gaat alleen via functies, zoals nu. Elke functie controleert dat de aanroeper de docent of ouder van de groep is.

| Functie | Wat |
|---|---|
| `ensure_group(p_student)` | de privégroep van mij met deze leerling; maakt hem aan als hij nog niet bestaat |
| `set_schedule(p_group, p_weekday, p_start_time)` | de lesdag vanaf vandaag; sluit de vorige regel af |
| `lesson_for(p_group, p_which)` | deze of de volgende les; maakt de volgende les aan als die nog niet bestaat |
| `give_homework(p_group, p_which, p_notes, p_days, p_remark, p_tasks, p_carry uuid[])` | nieuwe opdrachten worden opdracht plus huiswerk; `p_carry` zijn bestaande opdrachten van de groep die meegaan (extra huiswerk) |
| `update_lesson(p_lesson, p_notes, p_days, p_remark, p_date, p_tasks)` | aanpassen zonder reset; een weggehaalde opdracht verliest alleen zijn huiswerk in deze les |
| `set_done(p_homework, p_done)` | het vinkje van de leerling (of van de ouder of docent namens hem) |
| `set_progress(p_assignment, p_student, p_status, p_grade)` | status en cijfer (de docent) |
| `submit_recording(p_assignment, p_path, p_seconds)`, `delete_recording(p_recording)`, `react_to_recording(p_recording, …)` | zoals nu, maar per opdracht en leerling; de opnametijd telt als oefensessie, zoals in 0012 |
| `expired_recordings()`, `mark_recordings_deleted(…)` | op basis van de laatste les van de opdracht; `purge-recordings` volgt dat |
| `assign_tasks(p_students, p_bank_ids)` | opdrachten uit de bibliotheek als huiswerk in de lopende les |
| `end_lesson(p_lesson)` | een les als afgezegd markeren ("Huiswerk stoppen"); die telt dan niet meer als lopende les |

## Client (`@notenkraker/client`)

- **Nieuwe types:** `LessonGroup`, `Lesson`, `Assignment`, `HomeworkItem`, `Progress`, `Recording`.
- **Voor de schermen** blijft er een gemaksvorm: `Homework` wordt "een les met zijn huiswerk voor deze leerling". Daarin staan `tasks: HomeworkTask[]`, en per taak `week`, `weeks`, `doneAt` (van deze leerling) en `recordings`. Zo hoeven Vandaag, de taakpagina en de huiswerkkaart weinig te veranderen.
- **De API:**
  - `groups.mine()`, `groups.ensure(studentId)`, `groups.setSchedule(…)`;
  - `lessons.forStudent(studentId)`, in de gemaksvorm;
  - `homework.give(groupId, which, input, tasks, carry)`, `homework.updateLesson(…)`, `homework.setDone(homeworkId, done)`.
- **Weg:** `giveWithTasks`, `giveMany` en `giveForLesson` (dat wordt `homework.give`).
- **Helpers met unit-tests:** de huiswerkperiode van een les, de week van een opdracht, en opnames per week.
- **De lokale client** (zonder account) volgt het model voor één thuis-groep.

## Schermen

Stap 1, in deze PR. De bestaande schermen werken op het nieuwe model, en het meenemen komt erbij:

1. **Huiswerk geven:** Deze les of Volgende les, zoals nu. De lesdag bewaren we als roosterregel. Bij Volgende les staat "Loopt nog" met "gaat mee" (zie de mock-up). Voor meer leerlingen tegelijk geldt het per leerling.
2. **Vandaag, de taakpagina en de huiswerkkaart:**
   - het label "2e week";
   - opnames per week, met de reacties;
   - op de taakpagina status en cijfer van de leerling, alleen voor de docent.
3. **Kindpagina:** Deze les en Volgende les, zoals nu, uit `lessons`.

Stap 2, een volgende PR: **lesgroepen beheren.** Een groep met meer leerlingen maken, een naam geven, het rooster instellen, en een lessenoverzicht met status (gegeven of afgezegd).

Daarna: AC-122 (minuten per opdracht, op `homework`) en het jaarprogramma (opdrachten van een groep vooraf aanmaken en als huiswerk op lessen zetten).

## Uitrol

1. De PR naar develop met migratie 0014, inclusief het overzetten van de data.
2. Alwin pusht 0014 naar de cloud. Daarna de merge naar develop.
3. **Direct daarna develop → main.** Tussen de push en de release werkt huiswerk niet in de app op productie.

## Tests

- **pgTAP:**
  - nieuw `lesgroepen.test.sql`:
    - groepen en leden, ook een groep met twee leerlingen;
    - rooster en lessen, met deze en de volgende les;
    - huiswerk en meegaan met behoud van opnames;
    - het vinkje per leerling per les;
    - voortgang;
    - leesrechten: een les die nog moet komen, en een leerling die pas later lid werd;
    - de bewaartermijn over meer lessen;
    - een thuis-groep van een ouder;
  - `opnames`, `meerdere-opnames`, `huiswerk-per-les` en `opdrachten` omgezet naar het nieuwe model;
  - het overzetten van de data.
- **Unit:** huiswerkperiode, week en opnames per week.
- **E2E:**
  - de bestaande specs blijven groen;
  - nieuw `opdracht-meenemen.spec.ts`: deze les met een stuk, een opname, de volgende les met "gaat mee"; het kind ziet op de lesdatum "2e week" en de opname van vorige week.
