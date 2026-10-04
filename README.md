# Altsax Grepentabel

Interactieve grepentabel en notenspel voor de altsaxofoon, gemaakt voor beginnende leerlingen (vanaf ±8 jaar).

- **Grepen**: tik op een noot, zie de noot op de notenbalk, de Nederlandse naam (fis, gis, bes…) en welke kleppen je indrukt — getekend zoals ze op de sax zitten (duim/octaafklep, 1‑2‑3, 4‑5‑6, pinkkleppen links en rechts, bis‑knopje).
- **Leerlingen**: per leerling een status per noot — *kent al*, *in de les*, *moet nog leren* — zodat elk kind alleen zijn eigen noten ziet. Pinkkleppen verschijnen pas als een noot ze nodig heeft.
- **Spel**: acht noten op een rij, tik zo snel mogelijk de juiste naam. Drie levens, timer, sterren; noten die in de les zijn komen vaker voorbij. Rondes worden per leerling bewaard.

## Draaien

Open `index.html` in een browser. Er is geen build‑stap en geen afhankelijkheid behalve Google Fonts.

Zonder database draait de pagina in geheugen: leerlingen en statussen gaan verloren bij herladen (de pagina meldt dit).

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | Standalone versie (compleet HTML‑document) |
| `artifact.html` | Dezelfde pagina zonder `<html>/<head>/<body>`‑skelet, zoals gepubliceerd als Claude‑artifact (het artifact voegt het skelet zelf toe) |

Beide bestanden horen inhoudelijk gelijk te blijven; `index.html` is `artifact.html` met een skelet eromheen.

## Data

De pagina gebruikt, als die beschikbaar is, de artifact‑database (`window.claude.use("db")`):

```
leerlingen/{id}                  { naam, instrument, aangemaakt }
leerlingen/{id}/noten/{nootId}   { status: "kent" | "les" | "moet", bijgewerkt }
leerlingen/{id}/rondes/{auto}    { datum, ms, fouten, sterren, af, fout_noten[] }
```

Noot‑ids zijn de Nederlandse naam plus octaafnummer van de **geschreven** toon: `g4`, `fis4`, `bes5`, `c6`.

## Muzikale aannames

- Bereik: geschreven lage bes (B♭3) t/m hoge f (F6).
- Grepen zijn de standaard altsaxgrepen; de linkerpink is getekend met twee kleppen (G♯ en "laag") zoals op het instrument van de maker.
- Geluid in het spel klinkt op altsax‑toonhoogte (geschreven toon min een grote sext).
