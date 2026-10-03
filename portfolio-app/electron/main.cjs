/**
 * Mac-App „Depot“: startet den lokalen Server unsichtbar im Hintergrund und
 * zeigt die Oberfläche in einem eigenen Fenster – ohne Browser.
 *
 * Daten liegen in ~/Library/Application Support/Depot:
 *   portfolio.db        Datenbank (Sicherungen unter backups/)
 *   Konfiguration.env   Kursanbieter und API-Keys (wie .env.local)
 *   config/, content/   Kriterien und Texte der „Soliden Wachstumswerte“
 *   .electron/          Caches des eingebauten Browsers (ausgeblendet)
 *
 * Entwicklung: `npm run dev` starten und dann `npm run app:dev` – das Fenster
 * lädt dann den laufenden Dev-Server (DEPOT_URL) mit den Daten aus data/.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const APP_DIR = path.join(__dirname, "..");
const DEV_URL = process.env.DEPOT_URL || null;

app.setName("Depot");
// Fester Datenordner – auch für `npm run app:dev` (dort heißt das Paket anders).
// Caches und Fensterzustand des eingebauten Browsers liegen getrennt im
// ausgeblendeten Unterordner .electron, damit der Datenordner übersichtlich bleibt.
const DATA_DIR = path.join(app.getPath("appData"), "Depot");
app.setPath("userData", path.join(DATA_DIR, ".electron"));
// Nur ein Fenster/Server: ein zweiter Start holt das laufende Fenster nach vorn
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();

let mainWindow = null;
let serverProcess = null;
let serverUrl = null;

/** Datenordner anlegen, editierbare Dateien beim ersten Start hineinkopieren, Umgebung setzen. */
function prepareEnvironment() {
  const dir = DATA_DIR;
  fs.mkdirSync(dir, { recursive: true });
  // Kriterien und Texte: fehlende Dateien ergänzen, eigene Änderungen nie überschreiben
  for (const sub of ["config", "content"]) {
    const source = path.join(APP_DIR, sub);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(dir, sub), { recursive: true, force: false, errorOnExist: false });
  }
  const envFile = path.join(dir, "Konfiguration.env");
  if (!fs.existsSync(envFile)) {
    const template = path.join(APP_DIR, ".env.example");
    if (fs.existsSync(template)) {
      const text = fs
        .readFileSync(template, "utf8")
        .replace(
          "# Vorlage für .env.local – kopieren mit: cp .env.example .env.local\n# .env.local wird nie eingecheckt.",
          "# Einstellungen der Mac-App „Depot“. Nach Änderungen die App neu starten.",
        );
      fs.writeFileSync(envFile, text);
    }
  }
  const env = { ...process.env };
  try {
    // Werte aus Konfiguration.env übernehmen (ohne bereits gesetzte zu überschreiben)
    const parsed = require("node:util").parseEnv(fs.readFileSync(envFile, "utf8"));
    for (const [key, value] of Object.entries(parsed)) if (env[key] === undefined) env[key] = value;
  } catch {
    // keine oder fehlerhafte Datei – Standardwerte
  }
  return {
    ...env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_PATH: path.join(dir, "portfolio.db"),
    RESEARCH_ROOT: dir,
    DEPOT_DESKTOP: "1",
    DEPOT_DATA_DIR: dir,
    DEPOT_APP_DIR: APP_DIR,
  };
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    serverProcess = utilityProcess.fork(path.join(__dirname, "server.cjs"), [], {
      env,
      cwd: APP_DIR,
      serviceName: "Depot-Server",
      stdio: "inherit",
    });
    const timeout = setTimeout(() => reject(new Error("Der Server hat nicht innerhalb von 2 Minuten geantwortet.")), 120_000);
    serverProcess.on("message", (message) => {
      if (message?.type === "ready") {
        clearTimeout(timeout);
        resolve(message.url);
      } else if (message?.type === "error") {
        clearTimeout(timeout);
        reject(new Error(message.message));
      }
    });
    serverProcess.on("exit", (code) => {
      clearTimeout(timeout);
      if (!serverUrl) reject(new Error(`Der Server wurde beendet (Code ${code}).`));
      else if (!app.isQuitting) {
        dialog.showErrorBox("Depot", "Der Hintergrundserver wurde unerwartet beendet. Die App wird geschlossen.");
        app.quit();
      }
    });
  });
}

/** Wartet, bis die Datenbank eingerichtet ist (beim allerersten Start inkl. Beispieldaten). */
async function waitUntilReady(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // Server startet noch
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Die Datenbank konnte nicht eingerichtet werden.");
}

const SPLASH = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Depot</title>
<style>html,body{margin:0;height:100%;background:#0a0a0b;color:#a3a29d;font:14px -apple-system,BlinkMacSystemFont,sans-serif;-webkit-user-select:none}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.dot{width:8px;height:8px;border-radius:50%;background:#3dd68c;animation:p 1.2s ease-in-out infinite}
@keyframes p{50%{opacity:.25}}@media (prefers-reduced-motion:reduce){.dot{animation:none}}</style></head>
<body><svg width="56" height="56" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#f4f4f2"/><path d="M6 15.5l3.5-4 3 2.5L18 7.5" fill="none" stroke="#0a0a0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
<div style="display:flex;align-items:center;gap:8px"><span class="dot"></span>Depot wird gestartet …</div></body></html>`)}`;

function isInternal(url) {
  return Boolean(serverUrl) && (url === serverUrl || url.startsWith(`${serverUrl}/`));
}

function openExternal(url) {
  if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
}

/** Fenstergröße und -position vom letzten Mal – nur wenn sie noch auf einen Bildschirm passen. */
const windowStateFile = () => path.join(app.getPath("userData"), "fenster.json");

function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStateFile(), "utf8"));
    const { x, y, width, height } = state;
    if (![x, y, width, height].every(Number.isInteger)) return null;
    const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
    const visible = x < area.x + area.width - 100 && x + width > area.x + 100 && y >= area.y - 20 && y < area.y + area.height - 100;
    return visible ? state : null;
  } catch {
    return null;
  }
}

function saveWindowState(win) {
  try {
    fs.writeFileSync(windowStateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    // nicht kritisch
  }
}

function createWindow() {
  const saved = loadWindowState();
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1360,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 960,
    minHeight: 640,
    title: "Depot",
    backgroundColor: "#0a0a0b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  if (saved?.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", () => saveWindowState(mainWindow));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // Quellen-Links usw. im Standardbrowser öffnen, interne Links im Fenster
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) void mainWindow?.loadURL(url);
    else openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternal(url) && !url.startsWith("data:")) {
      event.preventDefault();
      openExternal(url);
    }
  });
  if (serverUrl) void mainWindow.loadURL(serverUrl);
  else void mainWindow.loadURL(SPLASH);
}

function go(pathname) {
  if (!serverUrl) return;
  if (!mainWindow) createWindow();
  void mainWindow.loadURL(`${serverUrl}${pathname}`);
  mainWindow.show();
}

function buildMenu() {
  const pages = [
    ["Übersicht", "/", "1"],
    ["Transaktionen", "/transaktionen", "2"],
    ["Sparpläne", "/sparplaene", "3"],
    ["Erträge", "/ertraege", "4"],
    ["Import", "/import", "5"],
    ["Wachstumswerte", "/wachstumswerte", "6"],
    ["Watchlist", "/watchlist", "7"],
  ];
  const template = [
    {
      label: "Depot",
      submenu: [
        { role: "about", label: "Über Depot" },
        { type: "separator" },
        { label: "Einstellungen …", accelerator: "CmdOrCtrl+,", click: () => go("/einstellungen") },
        { label: "Datenordner im Finder zeigen", click: () => void shell.openPath(DATA_DIR) },
        { type: "separator" },
        { role: "hide", label: "Depot ausblenden" },
        { role: "hideOthers", label: "Andere ausblenden" },
        { role: "unhide", label: "Alle einblenden" },
        { type: "separator" },
        { role: "quit", label: "Depot beenden" },
      ],
    },
    {
      label: "Bearbeiten",
      submenu: [
        { role: "undo", label: "Widerrufen" },
        { role: "redo", label: "Wiederholen" },
        { type: "separator" },
        { role: "cut", label: "Ausschneiden" },
        { role: "copy", label: "Kopieren" },
        { role: "paste", label: "Einsetzen" },
        { role: "selectAll", label: "Alles auswählen" },
      ],
    },
    {
      label: "Gehe zu",
      submenu: [
        ...pages.map(([label, pathname, key]) => ({ label, accelerator: `CmdOrCtrl+${key}`, click: () => go(pathname) })),
        { type: "separator" },
        { label: "Zurück", accelerator: "CmdOrCtrl+[", click: () => mainWindow?.webContents.navigationHistory.goBack() },
        { label: "Vorwärts", accelerator: "CmdOrCtrl+]", click: () => mainWindow?.webContents.navigationHistory.goForward() },
      ],
    },
    {
      label: "Darstellung",
      submenu: [
        { role: "reload", label: "Neu laden" },
        { type: "separator" },
        { role: "resetZoom", label: "Originalgröße" },
        { role: "zoomIn", label: "Vergrößern" },
        { role: "zoomOut", label: "Verkleinern" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Vollbild" },
        { role: "toggleDevTools", label: "Entwicklerwerkzeuge" },
      ],
    },
    {
      label: "Fenster",
      submenu: [
        { role: "minimize", label: "Im Dock ablegen" },
        { role: "zoom", label: "Zoomen" },
        { role: "close", label: "Fenster schließen" },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

app.on("second-instance", () => {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  Menu.setApplicationMenu(buildMenu());
  ipcMain.handle("depot:show-data-folder", () => shell.openPath(DATA_DIR));
  app.setAboutPanelOptions({
    applicationName: "Depot",
    applicationVersion: app.getVersion(),
    credits: "Lokale Portfolio-App – alle Daten bleiben auf diesem Mac.\nKeine Anlageberatung.",
  });
  createWindow();
  try {
    const url = DEV_URL || (await startServer(prepareEnvironment()));
    await waitUntilReady(url);
    serverUrl = url;
    if (mainWindow) await mainWindow.loadURL(serverUrl);
  } catch (error) {
    dialog.showErrorBox("Depot konnte nicht starten", error && error.message ? error.message : String(error));
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (serverProcess) serverProcess.kill();
});
