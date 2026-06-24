# Klimamodell – Vite-Projekt

Website „Langzeitprognose des Klimawandels" von Jannes von Bargen, als
Vite-Projekt (Multi-Page, Vanilla JS – keine Framework-Abhängigkeit).

## Entwicklung

```bash
npm install      # einmalig: Abhängigkeiten installieren
npm run dev      # Dev-Server mit Hot-Reload  ->  http://localhost:5173
```

## Produktion

```bash
npm run build    # baut nach dist/
npm run preview  # baut + lokale Vorschau des Builds
```

Den Inhalt von `dist/` auf einen beliebigen Webspace / Netlify / GitHub Pages
hochladen.

## Struktur

```
klimamodell-vite/
├── index.html            # Startseite (3 Bausteine, Overlays)
├── modell.html           # Unterseite: interaktives Klimamodell
├── src/
│   ├── style.css         # gesamtes Design (MPI-M-Farbschema)
│   ├── main.js           # Startseite: Navigation + Overlays
│   ├── modell.js         # Unterseite: startet das Klimamodell
│   ├── climate-model.js  # Modell-Logik (Keeling-Daten + Prognose + Diagramm)
│   └── ui.js             # geteilte Bausteine (Menü, Overlays)
├── public/
│   └── dateien/          # DPG-Aufsatz.pdf, dpg-plakat.png, jugend-forscht-logo.svg
├── vite.config.js        # Multi-Page-Konfiguration
└── package.json
```

## Hinweis zum Hosting im Unterordner
`base` steht in `vite.config.js` auf `'./'`, daher läuft der Build sowohl
direkt unter einer Domain als auch in einem Unterordner. Für GitHub-Pages-
Projektseiten ggf. auf den Repo-Pfad anpassen.
