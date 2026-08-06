import { startRuntime } from "./runtime.mjs";

/**
 * Runs the Worker in its own process.
 *
 * The runtime is deliberately not hosted inside Electron's main process: wrangler
 * and workerd behave differently there once the app is packaged, and a crash in
 * the runtime would take the window down with it. Here it is an ordinary Node
 * process (Electron's own binary re-executed with ELECTRON_RUN_AS_NODE), which is
 * the same environment the runtime is developed and tested against.
 *
 * Protocol: the parent reads a single `UPSKILL_ORIGIN=<url>` line from stdout, and
 * terminates the process to shut the Worker down.
 */

const input = JSON.parse(process.env.UPSKILL_RUNTIME_INPUT ?? "{}");

let runtime;
try {
  runtime = await startRuntime(input);
} catch (cause) {
  console.error(`UPSKILL_ERROR=${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
}

console.log(`UPSKILL_ORIGIN=${runtime.origin}`);

const shutdown = async () => {
  try {
    await runtime.stop();
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
// Exit if the parent goes away, so no orphaned Worker keeps the port and database.
process.on("disconnect", shutdown);
