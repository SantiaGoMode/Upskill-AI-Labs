import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { readSettings, settingsPath } from "./settings.mjs";

/**
 * Desktop shell.
 *
 * The window is a view onto the application's own Worker, running on loopback in
 * this process's care (see runtime.mjs). The renderer gets no Node access and no
 * preload bridge: everything it needs is already served over HTTP by the Worker,
 * so there is nothing to expose and no privileged surface to defend.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = app.isPackaged ? process.resourcesPath : path.join(here, "..");
const dataDir = app.getPath("userData");

let runtime = null;

/**
 * Boots the Worker in a child process and resolves with its origin.
 *
 * Electron's own binary is re-executed as plain Node, so the runtime runs in the
 * environment it is tested in rather than inside the main process, where a
 * packaged wrangler behaves differently. Failure output is forwarded so a broken
 * install can be diagnosed from a terminal.
 */
function startRuntimeProcess({ appDir, dataDir, settings }) {
  const script = path.join(here, "serve.mjs");
  const child = spawn(process.execPath, [script], {
    // A packaged app inherits `/` as its working directory, which wrangler cannot
    // write scratch state into. The data directory is ours and always writable.
    cwd: dataDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      UPSKILL_RUNTIME_INPUT: JSON.stringify({ appDir, dataDir, settings }),
    },
  });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const settle = (error, origin) => {
      if (error) reject(error);
      else resolve({ origin, stop: () => new Promise((done) => { child.once("exit", done); child.kill("SIGTERM"); }) });
    };

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      process.stdout.write(String(chunk));
      const match = stdout.match(/UPSKILL_ORIGIN=(\S+)/);
      if (match) settle(null, match[1]);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      process.stderr.write(String(chunk));
    });
    child.on("error", (cause) => settle(cause));
    child.on("exit", (code) => {
      if (!stdout.includes("UPSKILL_ORIGIN=")) {
        const reported = stderr.match(/UPSKILL_ERROR=(.*)/)?.[1];
        settle(new Error(reported || `The local runtime exited with code ${code}.`));
      }
    });
  });
}

function createWindow(origin) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f7f5ef",
    title: "Upskill AI Labs",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Meet calls, and any other outward link, belong in the user's own browser —
  // Meet refuses to be framed, and an app window is a poor place for the open web.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // The window itself never leaves the local origin.
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  window.once("ready-to-show", () => window.show());
  void window.loadURL(origin);
  return window;
}

function buildMenu(origin) {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Settings File",
          // Credentials and limits are edited here; the app reads them at startup.
          click: () => void shell.openPath(settingsPath(dataDir)),
        },
        { label: "Open Data Folder", click: () => void shell.openPath(dataDir) },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      role: "help",
      submenu: [
        { label: "Course Overview", click: () => void shell.openExternal(`${origin}/course`) },
        { label: "Governance", click: () => void shell.openExternal(`${origin}/governance`) },
      ],
    },
  ]));
}

// A second copy would try to bind its own runtime against the same data directory.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  app.whenReady().then(async () => {
    const { settings, error } = readSettings(dataDir);

    try {
      runtime = await startRuntimeProcess({ appDir, dataDir, settings });
    } catch (cause) {
      // Logged as well as shown: a packaged app whose only failure report is a
      // modal dialog cannot be diagnosed from a terminal or a crash report.
      console.error("[upskill] runtime failed to start", cause);
      dialog.showErrorBox(
        "Upskill AI Labs could not start",
        `${cause instanceof Error ? cause.message : String(cause)}\n\nData folder: ${dataDir}`,
      );
      app.quit();
      return;
    }

    // Recorded so a support conversation can confirm what the app is serving.
    console.log(`[upskill] serving ${runtime.origin} (data: ${dataDir})`);

    buildMenu(runtime.origin);
    createWindow(runtime.origin);

    if (error) {
      dialog.showMessageBox({ type: "warning", message: "Settings could not be read", detail: error });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(runtime.origin);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // Stop the Worker before exit so its SQLite files are closed cleanly.
  app.on("before-quit", async (event) => {
    if (!runtime) return;
    event.preventDefault();
    const stopping = runtime;
    runtime = null;
    try {
      await stopping.stop();
    } finally {
      app.quit();
    }
  });
}
