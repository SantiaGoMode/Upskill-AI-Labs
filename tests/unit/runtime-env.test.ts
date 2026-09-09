import { afterEach, expect, it, vi } from "vitest";
import { isManagedEnvironment, usesFirestore } from "../../app/lib/runtime-env";
import { developerSignInAvailable } from "../../app/lib/request-identity";

afterEach(() => vi.unstubAllEnvs());

it.each([
  ["", "", "", false, false],
  ["development", "", "", false, false],
  ["local", "", "", false, false],
  ["test", "", "", false, false],
  ["production", "", "", true, true],
  [" STAGING ", "", "", true, true],
  ["preview", "", "", true, true],
  ["", "service", "", true, true],
  ["development", "service", "", true, true],
  ["test", "", "127.0.0.1:8080", false, true],
  ["test", "  ", "  ", false, false],
])("resolves environment %j, service %j, emulator %j consistently", (environment, service, emulator, managed, firestore) => {
  vi.stubEnv("ENVIRONMENT", environment);
  vi.stubEnv("K_SERVICE", service);
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", emulator);
  expect(isManagedEnvironment()).toBe(managed);
  expect(usesFirestore()).toBe(firestore);
  expect(developerSignInAvailable(new Request("http://localhost:3000"))).toBe(!managed);
});
