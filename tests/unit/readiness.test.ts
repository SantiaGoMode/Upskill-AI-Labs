import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => {
  const get = vi.fn();
  const doc = vi.fn(() => ({ get }));
  const collection = vi.fn(() => ({ doc }));
  return { get, doc, collection };
});
vi.mock("../../db/firebase-admin", () => ({ getAdminFirestore: () => firestore }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("ENVIRONMENT", "staging");
  vi.stubEnv("K_SERVICE", "");
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
  vi.stubEnv("SESSION_SECRET", "test-secret");
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  firestore.get.mockResolvedValue({ exists: false });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("database readiness", () => {
  it("reads a single document even when the database is empty", async () => {
    const { GET } = await import("../../app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).checks.database).toBe("ok");
    expect(firestore.collection).toHaveBeenCalledWith("_health");
    expect(firestore.doc).toHaveBeenCalledWith("readiness");
    expect(firestore.get).toHaveBeenCalledTimes(1);
  });

  it("reports database failure and detects recovery without restarting", async () => {
    const { GET } = await import("../../app/api/health/route");
    firestore.get.mockRejectedValueOnce(new Error("unavailable"));
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect((await failed.json()).checks.database).toBe("unavailable");
    expect((await GET()).status).toBe(200);
  });

  it("bounds response time and shares an outstanding read until it settles", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    firestore.get.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { GET } = await import("../../app/api/health/route");
    const first = GET();
    const second = GET();
    await vi.advanceTimersByTimeAsync(3000);
    expect((await first).status).toBe(503);
    expect((await second).status).toBe(503);
    expect(firestore.get).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect((await GET()).status).toBe(200);
    expect(firestore.get).toHaveBeenCalledTimes(2);
  });

  it("does not contact Firebase for local readiness", async () => {
    vi.stubEnv("ENVIRONMENT", "test");
    const { GET } = await import("../../app/api/health/route");
    expect((await GET()).status).toBe(200);
    expect(firestore.get).not.toHaveBeenCalled();
  });

  it("keeps liveness available when database access fails", async () => {
    firestore.get.mockRejectedValue(new Error("unavailable"));
    const { GET } = await import("../../app/api/health/live/route");
    expect(GET().status).toBe(200);
    expect(firestore.get).not.toHaveBeenCalled();
  });

  it("retries initialization after failure without scanning attempts", async () => {
    const { ensureLabSchema } = await import("../../db/runtime");
    firestore.get.mockRejectedValueOnce(new Error("unavailable"));
    await expect(ensureLabSchema()).rejects.toThrow("unavailable");
    await expect(ensureLabSchema()).resolves.toBeUndefined();
    await ensureLabSchema();
    expect(firestore.get).toHaveBeenCalledTimes(2);
    expect(firestore.collection).toHaveBeenCalledWith("_health");
  });
});
