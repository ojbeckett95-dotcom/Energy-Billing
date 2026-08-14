import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from "electron";
import { utilityProcess } from "electron";
import path from "path";
import http from "http";
import fs from "fs";
import crypto from "crypto";

const DEFAULT_PORT = 3001;
const isPackaged = app.isPackaged;

// Read the configured server port from the data file (before the Next.js server starts).
// Falls back to DEFAULT_PORT if the file is missing or the value is not set.
function readConfiguredPort(): number {
  try {
    const dataFile = path.join(app.getPath("userData"), "data", "app-data.json");
    if (fs.existsSync(dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      const p = parsed?.schedulerSettings?.serverPort;
      if (typeof p === "number" && p > 0 && p < 65536) return p;
    }
  } catch (err) {
    console.error(`Could not read configured port, falling back to ${DEFAULT_PORT}:`, err);
  }
  return DEFAULT_PORT;
}

const PORT = readConfiguredPort();

// Read (or generate) the HMAC session secret from the data file.
// This is passed to the Next.js process as SESSION_SECRET so the middleware
// can verify session tokens without a Node.js crypto import.
function readSessionSecret(): string {
  const dataFile = path.join(app.getPath("userData"), "data", "app-data.json");
  try {
    if (fs.existsSync(dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      const s = parsed?.authSettings?.sessionSecret;
      if (typeof s === "string" && s.length > 0) return s;
    }
  } catch (err) {
    console.error("Could not read the stored session secret; a new one will be generated:", err);
  }
  // Generate a new secret and persist it so it survives restarts
  const secret = crypto.randomBytes(32).toString("hex");
  try {
    const dataDir2 = path.dirname(dataFile);
    if (!fs.existsSync(dataDir2)) fs.mkdirSync(dataDir2, { recursive: true });
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(dataFile)) {
      // Rewriting a file we could not parse would wipe the user's data, so keep
      // the unreadable file and run with a secret that lives only in memory.
      existing = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
    }
    const authSettings = (existing.authSettings as Record<string, unknown>) ?? {};
    authSettings.sessionSecret = secret;
    existing.authSettings = authSettings;
    fs.writeFileSync(dataFile, JSON.stringify(existing, null, 2), "utf-8");
  } catch (err) {
    console.error("Could not persist the session secret; sessions will not survive a restart:", err);
  }
  return secret;
}

const SESSION_SECRET = readSessionSecret();

// Root of the packaged app resources, or project root in dev
const appRoot = isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

// User data dir — persisted between updates
const dataDir = path.join(app.getPath("userData"), "data");

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let nextProc: ReturnType<typeof utilityProcess.fork> | null = null;
let schedulerProc: ReturnType<typeof utilityProcess.fork> | null = null;
let quitting = false;

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else if (Date.now() < deadline) {
            setTimeout(attempt, 500);
          } else {
            reject(new Error("Server not ready in time"));
          }
        })
        .on("error", () => {
          if (Date.now() < deadline) {
            setTimeout(attempt, 500);
          } else {
            reject(new Error("Server not ready in time"));
          }
        });
    }
    attempt();
  });
}

function startNextServer() {
  const serverScript = path.join(appRoot, ".next", "standalone", "server.js");
  nextProc = utilityProcess.fork(serverScript, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      NODE_ENV: "production",
      DATA_DIR: dataDir,
      SESSION_SECRET,
    },
    stdio: "pipe",
  });
  nextProc.stdout?.on("data", (d: Buffer) =>
    console.log("[next]", d.toString().trimEnd())
  );
  nextProc.stderr?.on("data", (d: Buffer) =>
    console.error("[next]", d.toString().trimEnd())
  );
}

function startScheduler() {
  const script = path.join(appRoot, "scheduler.cjs");
  // NODE_PATH lets the scheduler find modbus-serial from standalone's node_modules
  const nodePath = path.join(appRoot, ".next", "standalone", "node_modules");
  schedulerProc = utilityProcess.fork(script, [], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      NODE_PATH: nodePath,
    },
    stdio: "pipe",
  });
  schedulerProc.stdout?.on("data", (d: Buffer) =>
    console.log("[sched]", d.toString().trimEnd())
  );
  schedulerProc.stderr?.on("data", (d: Buffer) =>
    console.error("[sched]", d.toString().trimEnd())
  );
  // Restart on crash
  schedulerProc.on("exit", () => {
    if (!quitting) {
      console.log("[sched] Restarting scheduler in 5s...");
      setTimeout(startScheduler, 5_000);
    }
  });
}

function createWindow(startHidden = false) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Energy Billing",
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow?.show();
  });

  // Minimise to tray on close instead of quitting
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createTray() {
  const iconPath = path.join(appRoot, "public", "favicon.ico");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("Energy Billing");

  const menu = Menu.buildFromTemplate([
    {
      label: "Open Energy Billing",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

const RESTART_FLAG = path.join(dataDir, "restart.flag");

function startRestartWatcher() {
  setInterval(() => {
    if (fs.existsSync(RESTART_FLAG)) {
      try {
        fs.unlinkSync(RESTART_FLAG);
      } catch (err) {
        // Relaunching with the flag in place would restart the app forever.
        console.error(`Could not clear ${RESTART_FLAG}; skipping restart:`, err);
        return;
      }
      app.relaunch();
      app.quit();
    }
  }, 2_000);
}

app.whenReady().then(async () => {
  // Enable auto-start when packaged
  if (isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  startNextServer();
  startScheduler();
  startRestartWatcher();

  try {
    await waitForServer(`http://127.0.0.1:${PORT}`);
  } catch (err) {
    console.error("Next.js server failed to start:", err);
    dialog.showErrorBox(
      "Energy Billing could not start",
      `The application server on port ${PORT} did not start:\n\n${err instanceof Error ? err.message : String(err)}`,
    );
    quitting = true;
    app.quit();
    return;
  }

  const startHidden = isPackaged && app.getLoginItemSettings().wasOpenedAtLogin;
  createTray();
  createWindow(startHidden);
});

// Keep running in tray when all windows are closed
app.on("window-all-closed", () => {
  // intentionally do not quit
});

app.on("activate", () => {
  mainWindow?.show();
});

app.on("before-quit", () => {
  quitting = true;
  nextProc?.kill();
  schedulerProc?.kill();
});
