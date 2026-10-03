/**
 * Schmale, abgesicherte Brücke zwischen App-Oberfläche und Mac-App
 * (contextIsolation + sandbox): nur „Datenordner im Finder öffnen“.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("depotDesktop", {
  showDataFolder: () => ipcRenderer.invoke("depot:show-data-folder"),
});
