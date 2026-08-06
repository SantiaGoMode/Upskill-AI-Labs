import fs from "node:fs";
import path from "node:path";

/**
 * Desktop settings, stored as plain JSON in the user's data directory.
 *
 * Provider credentials live here rather than in the application bundle: the
 * bundle is shared and signed, the data directory belongs to the person using it.
 * The file is created with owner-only permissions and is never written back with
 * values the app didn't already have, so hand edits survive upgrades.
 */

const TEMPLATE = {
  userEmail: "local-learner@upskill.invalid",
  role: "facilitator",
  GEMINI_API_KEY: "",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  OLLAMA_BASE_URL: "http://127.0.0.1:11434",
  MODEL_DAILY_USD_CAP: "5",
  MODEL_RATE_LIMIT_PER_MINUTE: "30",
};

export const settingsPath = (dataDir) => path.join(dataDir, "settings.json");

/** Reads settings, seeding the file on first run. A malformed file is reported, not overwritten. */
export function readSettings(dataDir) {
  const file = settingsPath(dataDir);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(TEMPLATE, null, 2)}\n`, { mode: 0o600 });
    return { settings: { ...TEMPLATE }, error: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("Settings must be a JSON object");
    return { settings: parsed, error: null };
  } catch (cause) {
    // Fall back to defaults so the app still opens, and say which file to fix.
    return {
      settings: { ...TEMPLATE },
      error: `${file} could not be read (${cause instanceof Error ? cause.message : String(cause)}). Using defaults.`,
    };
  }
}
