/**
 * Startet den Next.js-Server (Produktionsmodus) im Hintergrund – in der
 * Mac-App als eigener Prozess (Electron utilityProcess), zum Testen auch mit
 * `node electron/server.cjs`. Lauscht nur auf 127.0.0.1.
 *
 * Bevorzugt einen festen Port (damit Browser-Speicher wie das Farbschema
 * erhalten bleibt), weicht bei Belegung auf einen freien Port aus.
 */
const http = require("node:http");
const path = require("node:path");

const PREFERRED_PORT = Number(process.env.DEPOT_PORT || 47321);

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function startServer(dir) {
  const next = require(require.resolve("next", { paths: [dir] }));
  const createNext = next.default || next;
  const app = createNext({ dev: false, dir, hostname: "127.0.0.1", quiet: true });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = http.createServer((req, res) => handle(req, res));
  let port;
  try {
    port = await listen(server, PREFERRED_PORT);
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    port = await listen(server, 0);
  }
  return { url: `http://127.0.0.1:${port}`, server };
}

if (require.main === module || process.parentPort) {
  const dir = process.env.DEPOT_APP_DIR || path.join(__dirname, "..");
  process.chdir(dir);
  startServer(dir)
    .then(({ url }) => {
      if (process.parentPort) process.parentPort.postMessage({ type: "ready", url });
      else console.log(`Depot läuft auf ${url}`);
    })
    .catch((error) => {
      const message = error && error.stack ? error.stack : String(error);
      if (process.parentPort) process.parentPort.postMessage({ type: "error", message });
      else console.error(message);
      process.exit(1);
    });
}

module.exports = { startServer };
