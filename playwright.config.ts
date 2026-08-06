import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["api/**/*.spec.ts", "e2e/**/*.spec.ts"],
  fullyParallel: false,
  // Every spec drives the same dev server and the same local D1 file. Concurrent
  // writers there produce SQLITE_BUSY rather than useful parallelism.
  workers: 1,
  // No retries anywhere. An earlier intermittent failure here looked like emulator
  // flakiness and was in fact a real bound-parameter bug that only surfaced once the
  // local database had grown past ~100 cohorts; a retry would have kept hiding it.
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
