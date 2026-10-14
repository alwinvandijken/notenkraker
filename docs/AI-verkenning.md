# AI en luisteren: verkenning

Verkenning van 12 oktober 2026: wat kunnen AI en audioherkenning betekenen voor Notenkraker?
Werk staat in Linear onder **AC-126**, met subissues AC-127 t/m AC-130.
Werkend prototype: [`mockups/Sax-Luisteren.html`](mockups/Sax-Luisteren.html).

## Wat de app al heeft

Bij de verkenning bleek dat de app al een deel van dit fundament heeft:

- **Toonherkenning** in `packages/core/src/audio`: `detectPitch` (autocorrelatie met parabolische
  verfijning) en `NoteMatcher` (een noot telt als hij stabiel is). De microfoon zit in
  `apps/web/src/audio/mic.ts`.
- **Notenspel met de microfoon:** de modus "🎤 Met je altsax" in `apps/web/src/screens/Game.tsx`.
  Speel na bestaat dus al; het prototype voegt hints, een zuiverheidsmeter en een testtoon toe (AC-128).
- **Vrij oefenen** gebruikt de microfoon om echte oefentijd te meten (AC-112).
- **Transpositie per instrument:** `soundingMidi(written, transposition)` in `packages/core/src/music`.
- **Geluidsopnames als huiswerk** worden geüpload (AC-118, AC-121). Valt onder privacy (AC-130).

## Rol van AI: hulp, oefenmaatje, geen vervanger

| Rol | Oordeel |
|---|---|
| **Hulp voor de leraar** | Sterkst. Minder administratie, meer tijd voor de les zelf. |
| **Oefenmaatje tussen de lessen** | Grote meerwaarde: een leerling oefent nu zes dagen zonder feedback. |
| **Vervanger van de leraar** | Liever niet. AI hoort het geluid, maar ziet houding, ademhaling, embouchure en handpositie niet, en motiveert een kind niet zoals een leraar. De relatie met de leraar is voor jonge leerlingen juist wat de app sterk maakt. |

## Kan AI muziekbestanden lezen en beoordelen?

| Soort bestand | Leesbaar? | Hoe |
|---|---|---|
| **Symbolisch**: MusicXML, MIDI | Goed en exact | Tekst of data; een taalmodel leest MusicXML direct, vergelijken is gewone code. |
| **Bladmuziek als foto of PDF** | Redelijk | Optical Music Recognition (Audiveris, oemer) zet het om naar MusicXML; foutgevoelig. |
| **Audio**: opname van een leerling | Mogelijk, met eigen software | Zie hieronder. |

**Audio beoordelen gaat in stappen; het taalmodel komt pas aan het eind:**

1. **Toonhoogte en inzetten herkennen** met signaalverwerking (YIN/pYIN, of modellen als CREPE en basic-pitch).
2. **Uitlijnen met het origineel** met Dynamic Time Warping, zodat sneller of langzamer spelen niet uitmaakt.
3. **Vergelijken**: verkeerde of overgeslagen noten, ritme, tempo, intonatie in cent, grof de dynamiek.
4. **Een taalmodel maakt er feedback van**, op de leeftijd van de leerling.

Uitgangspunt: **meten met signaalverwerking, uitleggen met een taalmodel.** Modellen die zelf audio
aannemen zijn niet betrouwbaar genoeg om per noot te beoordelen.

## Heb je een origineel nodig?

- **Voor "speelde je de juiste noten?" wel.** Het beste origineel is MusicXML of MIDI, geen opname.
  In de app maken we oefeningen al zelf, dus dat origineel hebben we.
- **Zonder origineel** kun je nog iets zeggen over intonatie, een stabiel tempo en (lastig) de toon.
  Genoeg voor een stemapparaat of lange-tonen-oefening.

## MusicXML in het kort

MusicXML is gewone XML: de standaard om bladmuziek uit te wisselen (MuseScore, Sibelius, Dorico).
Het beschrijft wat er op het blad staat, geen geluid. `.mxl` is dezelfde inhoud als zip.

```xml
<note>
  <pitch><step>F</step><alter>1</alter><octave>5</octave></pitch>  <!-- Fis5; alter -1 = mol -->
  <type>eighth</type>
</note>
```

Verschil met MIDI: MIDI zegt wat er gespeeld wordt (toets 67, van tijdstip X tot Y), MusicXML hoe
het genoteerd staat (fis of ges, welke maat). Voor een leer-app is MusicXML het betere origineel.
Tonen in de browser kan met OpenSheetMusicDisplay, Verovio of VexFlow.

## Altsax: transponerend instrument in Es

Wat de leerling leest klinkt een grote sext (9 halve tonen) lager. Geschreven C klinkt als Es.

- De microfoon hoort de **klinkende** toon; **geschreven = klinkend + 9 halve tonen**.
- Bereik: geschreven Bes3 tot F6 (klinkend Des3 tot As5).
- De altsax speelt één noot tegelijk met een duidelijke toon: toonherkenning werkt goed, live in de browser.
- In MusicXML: `<transpose><chromatic>-9</chromatic></transpose>`.
- Bij meerdere instrumenten (AC-104) hoort de transpositie bij het instrument.

## Prototype "Sax luisteren"

[`mockups/Sax-Luisteren.html`](mockups/Sax-Luisteren.html), losse pagina zonder bibliotheken.

- **Wat speel ik?** Geschreven noot op de notenbalk en als naam, zuiverheidsmeter in cent,
  klinkende toon, frequentie en zekerheid. Stemtoon instelbaar (440/442 Hz).
- **Speel na:** korte oefeningen; de oranje noot even vasthouden maakt hem groen. Bij een verkeerde
  noot: "Je speelt G, zoek de A (iets hoger)", of "een octaaf te hoog".
- **Testtoon:** nagemaakte saxtoon met boventonen, instelbaar per noot en tot 50 cent vals.

Techniek: YIN-toonhoogteherkenning in JavaScript (de app gebruikt autocorrelatie; vergelijken in AC-127), microfoon zonder echo-onderdrukking, ruisonderdrukking
en automatische versterking. Een noot telt als 4 van de laatste 6 metingen (≈30 per seconde) dezelfde
noot zijn. Er wordt niets opgenomen of verstuurd.

**Openen:** `python3 -m http.server 8765 --directory docs/mockups`, dan
http://localhost:8765/Sax-Luisteren.html. Als los bestand mag de browser de microfoon vaak niet
gebruiken; op een iPad werkt de microfoon alleen via https.

**Getest (12 okt):** herkenning in Node op alle 32 noten van het bereik, zuiver en −30/+25 cent:
96 van 96 goed, binnen 3 cent. In de browser met de testtoon werken herkenning en speel-na.
**Nog niet getest met een echte sax** (AC-127).

## Wat kan er nog meer met AI?

**Voor de leraar**
- Lesverslag inspreken → samenvatting voor leerling en ouder (AC-129).
- Huiswerkvoorstel: "focus op bes en achtsten" → oefeningen die de leraar goedkeurt.
- Voortgangsoverzicht: wie loopt vast op ritme, wie heeft niet geoefend.
- Bladmuziek scannen naar MusicXML (let op auteursrecht).

**Voor de leerling**
- Notenspel met de microfoon uitbreiden: hints, octaafhint, zuiverheid, stemtoon (AC-128).
- Uitleg-chat op kindniveau ("waarom heeft deze noot een kruis?").
- Oefenstukjes op maat met alleen bekende noten en ritmes.
- Meespelen met begeleiding die het tempo volgt.

**Geen taalmodel nodig** (gewone algoritmes zijn beter en goedkoper): herhaling op het juiste moment
in de notenkiezer, stemapparaat, metronoom, transponeren.

## Aandachtspunten

- **Privacy (AC-130):** opnames van kinderen vallen onder de AVG. Audio op het apparaat verwerken,
  alleen uitkomsten opslaan, toestemming van ouders.
- **Kosten** per aanroep van een taalmodel-API.
- **Toon:** kritiek van een computer kan een kind ontmoedigen; eerst laten zien wat goed ging.
- **De leraar keurt goed** voordat AI-tekst bij leerling of ouder komt.

## Linear

| Issue | Onderwerp | Status bij aanmaken |
|---|---|---|
| AC-126 | AI en luisteren: verkenning en eerste stappen (hoofdissue) | Backlog |
| AC-127 | Prototype testen met een echte altsax | Todo |
| AC-128 | Notenspel met de microfoon uitbreiden (wacht op AC-127) | Backlog |
| AC-129 | Lesverslag inspreken met AI | Backlog |
| AC-130 | Privacy: microfoon, opnames en AI bij kinderen | Backlog |
