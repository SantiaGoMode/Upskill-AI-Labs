import fs from "node:fs";
import path from "node:path";

// Wrangler is imported dynamically inside `startRuntime`, not here. Importing it
// at module scope pulls in esbuild, which resolves its native binary path as it
// loads — before `preferUnpackedEsbuild()` could set the variable that redirects it.
// ESM imports are hoisted, so ordering this correctly requires a dynamic import.

/**
 * Hosts the application's own Cloudflare Worker on the user's machine.
 *
 * The app is a Worker, not a Node server: it imports `cloudflare:workers` and
 * depends on D1, a Durable Object, and the asset fetcher. Plain Node cannot load
 * it at all — `vinext start` fails on the `cloudflare:` module scheme — so the
 * desktop build embeds workerd instead of reimplementing the backend. The packaged
 * app therefore runs exactly the code a deployment runs, rather than a second
 * implementation that can drift from it.
 *
 * Wrangler's programmatic worker is the host rather than Miniflare directly: the
 * build's server-rendering chunks use dynamic `import()` with computed
 * specifiers, which Miniflare's own module collector refuses to walk.
 *
 * State lives in the caller-supplied data directory, so a learner's attempts and
 * whiteboards survive upgrades and can be backed up or deleted as ordinary files.
 */

/**
 * Variables handed to the Worker.
 *
 * `ENVIRONMENT` stays `development` deliberately. A desktop install is a single
 * user's own machine: there is no authenticating proxy in front of it, and the
 * schema is created on demand rather than by a deploy-time migration step. Naming
 * a managed environment here would make the app refuse every request for want of
 * a proxy secret it can never be given.
 */
function workerVars(settings) {
  const vars = {
    ENVIRONMENT: "development",
    LOCAL_DEV_USER_EMAIL: settings.userEmail ?? "local-learner@upskill.invalid",
    LOCAL_DEV_ROLE: settings.role === "learner" ? "learner" : "facilitator",
  };

  // Provider credentials belong to the user and come from their settings file or
  // environment. Nothing is bundled with the application.
  const passthrough = [
    "GEMINI_API_KEY", "GEMINI_MODEL",
    "OPENAI_API_KEY", "OPENAI_MODEL",
    "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL",
    "OLLAMA_BASE_URL", "OLLAMA_MODEL",
    "MODEL_DAILY_USD_CAP", "MODEL_RATE_LIMIT_PER_MINUTE",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
  ];
  for (const name of passthrough) {
    const value = settings[name] ?? process.env[name];
    if (typeof value === "string" && value.trim()) vars[name] = value.trim();
  }
  return vars;
}

/**
 * Wrangler shells out to esbuild while resolving the Worker config, and esbuild
 * locates its own native binary relative to the module. In a packaged app that
 * path lands inside `app.asar`, which cannot be spawned — the binary ships
 * unpacked beside the archive, so point esbuild at that copy explicitly rather
 * than relying on the archive path being rewritten for us.
 */
function preferUnpackedEsbuild() {
  if (process.env.ESBUILD_BINARY_PATH || !process.resourcesPath) return;

  // Derived from the unpacked directory rather than `require.resolve`: esbuild's
  // platform packages do not expose their manifest, so resolution throws. Only the
  // platform package holds the real executable — `esbuild/bin/esbuild` is a JS
  // wrapper and would fail the same way.
  const binary = path.join(
    process.resourcesPath,
    "app.asar.unpacked", "node_modules",
    `@esbuild/${process.platform}-${process.arch}`, "bin", "esbuild",
  );
  if (fs.existsSync(binary)) {
    process.env.ESBUILD_BINARY_PATH = binary;
    console.log(`[upskill] esbuild binary: ${binary}`);
  } else {
    console.warn(`[upskill] expected unpacked esbuild at ${binary} (resourcesPath=${process.resourcesPath})`);
  }
}

/** Asks the OS for a free loopback port so the worker can be addressed directly. */
async function freePort() {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Waits until the app itself answers.
 *
 * Readiness is measured against `/api/health` rather than a framework promise:
 * the worker's own `url` promise does not settle in a packaged app, and health is
 * the signal that actually matters — the database answered and the app can serve.
 */
async function waitUntilServing(origin, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(4_000) });
      if (response.ok) return;
      lastError = `health returned ${response.status}`;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`The local runtime did not become ready within ${timeoutMs / 1000}s (${lastError}).`);
}

/** Wrangler expects tagged binding objects, keyed on `value` rather than `text`. */
const asPlainText = (vars) =>
  Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, { type: "plain_text", value }]));

/**
 * Starts the Worker and resolves once it is answering requests.
 * Returns the local origin plus a `stop` function for shutdown.
 */
export async function startRuntime({ appDir, dataDir, settings = {}, port }) {
  const config = path.join(appDir, "dist", "server", "wrangler.json");
  if (!fs.existsSync(config)) {
    throw new Error(`Missing ${config}. Run \`npm run build\` before starting the desktop app.`);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  preferUnpackedEsbuild();

  const listenPort = port ?? await freePort();
  const origin = `http://127.0.0.1:${listenPort}`;

  const { unstable_startWorker } = await import("wrangler");
  const worker = await unstable_startWorker({
    config,
    bindings: asPlainText(workerVars(settings)),
    // No telemetry from a learner's machine, and no file watching or inspector in
    // a packaged app — this is a runtime host, not a development session.
    sendMetrics: false,
    dev: {
      server: { hostname: "127.0.0.1", port: listenPort },
      persist: path.join(dataDir, "state"),
      inspector: false,
      watch: false,
      liveReload: false,
      logLevel: "warn",
    },
  });

  try {
    await waitUntilServing(origin);
  } catch (cause) {
    // Leave nothing running behind a failed start, or the port stays occupied.
    await worker.dispose().catch(() => {});
    throw cause;
  }

  return { origin, stop: () => worker.dispose() };
}
