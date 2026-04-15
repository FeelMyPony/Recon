/**
 * RECON Desktop — Electron main process.
 *
 * Boots the Next.js dev server as a child process, waits for :3000
 * to respond, then opens a BrowserWindow pointed at the local app.
 *
 * Assumes Docker (Postgres) + LM Studio (Gemma on port 1234) are
 * already running. We don't try to manage those — too much pain for
 * an internal tool.
 */

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const APP_URL = "http://localhost:3000";
const STARTUP_TIMEOUT_MS = 90_000;

let mainWindow = null;
let nextProcess = null;

// ─── Spawn Next.js dev server ───────────────────────────────────────────

function startNextServer() {
  console.log("[recon] starting Next.js dev server from", REPO_ROOT);

  // Use login shell so PATH picks up nvm / brew / pnpm.
  nextProcess = spawn(
    "/bin/zsh",
    ["-l", "-c", "pnpm --filter @recon/web dev"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  nextProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[next] ${chunk}`);
  });
  nextProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[next:err] ${chunk}`);
  });
  nextProcess.on("exit", (code) => {
    console.log(`[recon] Next.js exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(
        `document.body.innerHTML = '<div style="font-family:sans-serif;padding:40px;color:#0F1B2D"><h1>RECON server stopped</h1><p>Close and relaunch the app.</p></div>'`,
      );
    }
  });
}

// ─── Poll until server responds ─────────────────────────────────────────

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        // Any response (even 3xx/4xx from auth redirects) means the server is up
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Server did not respond within ${timeoutMs}ms`));
        } else {
          setTimeout(tick, 500);
        }
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

// ─── Create the app window ──────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "RECON",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0F1B2D",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Loading splash while we wait for Next.js
  mainWindow.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`
        <!doctype html><html><body style="margin:0;background:#0F1B2D;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:24px">
          <div style="font-size:36px;font-weight:700;letter-spacing:-1px">RECON</div>
          <div style="color:#00BFA6;font-size:14px">Starting local server…</div>
          <div style="width:200px;height:3px;background:#1a2a42;border-radius:2px;overflow:hidden">
            <div style="width:40%;height:100%;background:#00BFA6;animation:pulse 1.5s ease-in-out infinite"></div>
          </div>
          <style>@keyframes pulse{0%,100%{margin-left:0}50%{margin-left:60%}}</style>
        </body></html>
      `),
  );

  // Open external links in the user's browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ──────────────────────────────────────────────────────

app.whenReady().then(async () => {
  buildMenu();
  createWindow();
  startNextServer();

  try {
    await waitForServer(APP_URL, STARTUP_TIMEOUT_MS);
    if (mainWindow) mainWindow.loadURL(APP_URL);
  } catch (err) {
    dialog.showErrorBox(
      "RECON — server did not start",
      `${err.message}\n\nMake sure Docker (Postgres) is running and that 'pnpm install' has been run in the repo.`,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // On macOS, apps usually stay open — but for a local dev tool, quit.
  app.quit();
});

app.on("before-quit", () => {
  if (nextProcess && !nextProcess.killed) {
    // SIGTERM the whole process group so child node processes die too
    try {
      process.kill(-nextProcess.pid, "SIGTERM");
    } catch {
      nextProcess.kill("SIGTERM");
    }
  }
});

// ─── Minimal menu ───────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: "RECON",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "Cmd+R",
          click: () => mainWindow && mainWindow.reload(),
        },
        {
          label: "Force Reload",
          accelerator: "Cmd+Shift+R",
          click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache(),
        },
        {
          label: "Toggle DevTools",
          accelerator: "Cmd+Alt+I",
          click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
