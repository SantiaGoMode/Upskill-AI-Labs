import { expect, test } from "@playwright/test";

test("BYOJ intake shows the client-side privacy boundary before anything is sent", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Map the work before adapting the course" })).toBeVisible();

  await expect(page.getByText("Raw text stays in this browser.")).toBeVisible();
  await page.getByLabel("Paste a representative artifact").fill("# Weekly status\nOwner: person@example.com\nBudget: $50\n- Risk");

  await expect(page.getByText("Safe shape preview")).toBeVisible();
  await expect(page.getByText(/1 email/)).toBeVisible();
  await expect(page.getByText("This is the entire payload. Nothing else is transmitted.")).toBeVisible();
});

test("facilitator surfaces are routed and reachable from the main nav", async ({ page }) => {
  await page.goto("/");

  for (const [label, heading] of [
    ["Studio", "Curriculum as code"],
    ["Cohorts", "Cohort operations"],
    ["Review", "Calibration and appeals"],
    ["Governance", "Policy, data classes, and audit"],
  ] as const) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("calibration dashboard reports judge-versus-human agreement", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Calibration and appeals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agreement by dimension" })).toBeVisible();
  await expect(page.getByText("Appeal rate")).toBeVisible();
});

test("facilitator can open and drive a Live Room", async ({ page }) => {
  const identity = { email: "trainer@example.com", displayName: "Trainer", role: "facilitator", source: "local" };
  const session = {
    id: "session-ui",
    title: "Evidence workshop",
    scheduledAt: "2026-08-12T16:00:00.000Z",
    durationMinutes: 60,
    agenda: "Test prompts together.",
    status: "scheduled",
    cohortName: "Pilot cohort",
  };
  const room = {
    id: "room-ui",
    status: "open",
    currentLabId: "lab-01",
    currentSection: "Intake and structure",
    sharedPrompt: "",
    updatedAt: new Date().toISOString(),
  };

  await page.route("**/api/live-room**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { identity, facilitator: true, session, room: null, participants: [], cards: [] } });
    }
    const body = route.request().postDataJSON();
    if (body.action === "share-prompt") room.sharedPrompt = body.prompt;
    return route.fulfill({
      status: body.action === "open-room" ? 201 : 200,
      json: {
        identity,
        facilitator: true,
        session,
        room,
        participants: [{ id: "p1", displayName: "Trainer", role: "facilitator", status: "present" }],
        cards: [],
      },
    });
  });

  await page.goto("/room/session-ui");
  await expect(page.getByRole("heading", { name: "Evidence workshop" })).toBeVisible();

  await page.getByRole("button", { name: "Open Live Room" }).click();
  await expect(page.getByText("Now covering")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Whiteboard tools" })).toBeVisible();

  await page.getByPlaceholder("Share a prompt for everyone to test…").fill("Compare the claims against the evidence.");
  await page.getByRole("button", { name: "Share with room" }).click();
  await expect(page.getByText("Compare the claims against the evidence.")).toBeVisible();
});

test("the whiteboard places objects on a canvas and offers an accessible list view", async ({ page }) => {
  const identity = { email: "trainer@example.com", displayName: "Trainer", role: "facilitator", source: "local" };
  const session = { id: "session-wb", title: "Canvas workshop", scheduledAt: "2026-08-12T16:00:00.000Z", durationMinutes: 60, agenda: "", status: "live", cohortName: "Pilot cohort" };
  const room = { id: "room-wb", status: "open", currentLabId: "lab-02", currentSection: "Prompt design", sharedPrompt: "", updatedAt: new Date().toISOString() };
  const cards: Array<Record<string, unknown>> = [];

  await page.route("**/api/live-room**", async (route) => {
    const method = route.request().method();
    const base = { identity, facilitator: true, session, room, participants: [{ id: "p1", displayName: "Trainer", role: "facilitator", status: "present" }] };
    if (method === "GET") return route.fulfill({ json: { ...base, cards } });
    const body = route.request().postDataJSON();
    if (body.action === "add-card") {
      cards.push({
        id: `card-${cards.length + 1}`,
        kind: body.kind ?? "note",
        body: body.body ?? "",
        color: body.color ?? "blue",
        x: body.x ?? 0,
        y: body.y ?? 0,
        width: body.width ?? 220,
        height: body.height ?? 140,
        payload: body.payload ?? {},
        authorEmail: "you",
        mine: true,
      });
    }
    if (body.action === "delete-card") {
      const index = cards.findIndex((card) => card.id === body.cardId);
      if (index >= 0) cards.splice(index, 1);
    }
    return route.fulfill({ json: { ...base, cards } });
  });

  await page.goto("/room/session-wb");
  await expect(page.getByRole("toolbar", { name: "Whiteboard tools" })).toBeVisible();

  // Placing a note puts a positioned object on the canvas.
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.locator("div.touch-none").click({ position: { x: 320, y: 240 } });
  await expect(page.getByText("New note")).toBeVisible();

  // The list view is a peer of the canvas, not a fallback.
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "New note" })).toBeVisible();
  await expect(page.getByText(/x\d+ y\d+/).first()).toBeVisible();
});

test("prompt cards accept inputs and run against the class model", async ({ page }) => {
  const identity = { email: "trainer@example.com", displayName: "Trainer", role: "facilitator", source: "local" };
  const session = { id: "session-run", title: "Executable canvas", scheduledAt: "2026-08-12T16:00:00.000Z", durationMinutes: 60, agenda: "", status: "live", cohortName: "Pilot" };
  const room = { id: "room-run", status: "open", currentLabId: "lab-02", currentSection: "Prompt design", sharedPrompt: "", updatedAt: new Date().toISOString() };
  const cards: Array<Record<string, unknown>> = [
    { id: "art-1", kind: "artifact", body: "NW-METRICS-05 · Test dashboard", color: "blue", x: 60, y: 400, width: 240, height: 100, payload: { sourceId: "NW-METRICS-05" }, authorEmail: "you", mine: true },
    { id: "prm-1", kind: "prompt", body: "Summarise the dashboard.", color: "blue", x: 400, y: 120, width: 320, height: 180, payload: {}, authorEmail: "you", mine: true },
  ];

  await page.route("**/api/live-room**", async (route) => {
    const base = { identity, facilitator: true, session, room, participants: [] };
    if (route.request().method() === "GET") return route.fulfill({ json: { ...base, cards } });
    const body = route.request().postDataJSON();
    if (body.action === "connect") {
      const target = cards.find((card) => card.id === body.targetId)!;
      target.payload = { inputs: [body.sourceCardId] };
    }
    if (body.action === "run-card") {
      cards.push({
        id: "out-1",
        kind: "output",
        body: "Critical workflow pass rate: 82% (target 95%)",
        color: "blue",
        x: 400,
        y: 330,
        width: 320,
        height: 220,
        payload: { inputs: [body.cardId], model: "gemini-3.5-flash-lite", usage: { totalTokens: 207 }, cost: { estimatedUsd: 0.00024 }, sourceIds: ["NW-METRICS-05"] },
        authorEmail: "you",
        mine: true,
      });
    }
    return route.fulfill({ json: { ...base, cards } });
  });

  await page.goto("/room/session-run");
  await expect(page.getByText("Summarise the dashboard.")).toBeVisible();

  // Connect the artifact into the prompt, then confirm the prompt reports an input.
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByText("NW-METRICS-05 · Test dashboard").click();
  await page.getByText("Summarise the dashboard.").click();
  await expect(page.getByText("1 input")).toBeVisible();

  // Running attaches an output card carrying model, tokens and cost.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByText("Summarise the dashboard.").click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText("Model output")).toBeVisible();
  await expect(page.getByText("207 tokens")).toBeVisible();
  await expect(page.getByText("gemini-3.5-flash-lite")).toBeVisible();
});
