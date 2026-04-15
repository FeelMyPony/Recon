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
const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");

const APP_URL = "http://localhost:3000";
const STARTUP_TIMEOUT_MS = 120_000;

/**
 * Resolve the repo root that holds pnpm-workspace.yaml + apps/web.
 *
 * When run via `electron .` from source, __dirname is apps/desktop/ and
 * we can just go up two levels. When run from a packaged .app, __dirname
 * is inside RECON.app/Contents/Resources/app/ so that trick breaks.
 *
 * Resolution order:
 *   1. $RECON_REPO env var (explicit override)
 *   2. ~/.recon/repo-path.txt (first-line of file)
 *   3. Relative walk-up from __dirname looking for pnpm-workspace.yaml
 *   4. Hardcoded fallback (the author's dev path)
 */
function resolveRepoRoot() {
  if (process.env.RECON_REPO && fs.existsSync(process.env.RECON_REPO)) {
    return process.env.RECON_REPO;
  }

  const configFile = path.join(os.homedir(), ".recon", "repo-path.txt");
  if (fs.existsSync(configFile)) {
    const p = fs.readFileSync(configFile, "utf8").trim();
    if (p && fs.existsSync(p)) return p;
  }

  // Walk up from __dirname — works when running unpackaged via `electron .`
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Hardcoded fallback — this Mac's known dev location
  const fallback = path.join(
    os.homedir(),
    "Downloads",
    "Outreach Automation",
    "recon",
  );
  if (fs.existsSync(path.join(fallback, "pnpm-workspace.yaml"))) return fallback;

  return null;
}

const REPO_ROOT = resolveRepoRoot();

// Persist successful resolution so the packaged .app can find it next time
if (REPO_ROOT) {
  try {
    const dir = path.join(os.homedir(), ".recon");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "repo-path.txt"), REPO_ROOT);
  } catch {
    // non-fatal
  }
}

let mainWindow = null;
let nextProcess = null;

// ─── Spawn Next.js dev server ───────────────────────────────────────────

function startNextServer() {
  if (!REPO_ROOT) {
    dialog.showErrorBox(
      "RECON — repo not found",
      `Could not locate the RECON source repo.\n\nFix: create ~/.recon/repo-path.txt with the absolute path to the recon checkout, or set the RECON_REPO env var.`,
    );
    app.quit();
    return;
  }
  console.log("[recon] starting Next.js dev server from", REPO_ROOT);

  // Use login shell so PATH picks up nvm / brew / pnpm.
  // `detached: true` puts the shell + its children in their own process group
  // so we can kill the whole tree on app quit via process.kill(-pid).
  nextProcess = spawn(
    "/bin/zsh",
    ["-l", "-c", "pnpm --filter @recon/web dev"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
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
