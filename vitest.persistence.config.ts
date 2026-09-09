import { defineConfig } from "vitest/config";

const mode = process.env.PERSISTENCE_CONTRACT_MODE ?? "memory";
if (mode !== "memory" && mode !== "firestore") throw new Error("Unknown persistence contract mode.");
const firestore = mode === "firestore";
if (firestore && process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8181") {
  throw new Error("Firestore contracts require the dedicated emulator at 127.0.0.1:8181.");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/persistence/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    env: {
      ENVIRONMENT: "test",
      K_SERVICE: "",
      FIRESTORE_EMULATOR_HOST: firestore ? "127.0.0.1:8181" : "",
      GCLOUD_PROJECT: "demo-upskill-contract",
      GOOGLE_CLOUD_PROJECT: "demo-upskill-contract",
      GOOGLE_APPLICATION_CREDENTIALS: "",
      METADATA_SERVER_DETECTION: "none",
    },
  },
});
