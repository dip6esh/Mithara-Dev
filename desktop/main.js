const { app, BrowserWindow, WebContentsView, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Self-update (Windows installer version only). If the add-on is somehow missing the app still opens normally.
let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const ORIGIN = new URL(config.appUrl).origin;
const START = ORIGIN + (config.startPath || "/admin");

// How long the opening animation stays on screen at minimum (milliseconds). The admin page loads in the
// background meanwhile, so the app opens after whichever takes longer. Set "splashMinMs" in config.json
// to change it (0 = open as soon as the admin page is ready).
const SPLASH_MIN_MS = Number.isFinite(Number(config.splashMinMs)) ? Number(config.splashMinMs) : 2600;
const SPLASH_MAX_MS = 15000; // never wait longer than this, even if the page is very slow to load
const FADE_MS = 350;

// Only the management area (and printable invoices) may open inside the app.
const isAllowedInApp = (url) => {
  try {
    const u = new URL(url);
    return u.origin === ORIGIN && (u.pathname.startsWith("/admin") || u.pathname.startsWith("/invoice/"));
  } catch {
    return false;
  }
};

let win; // the window; it shows the splash itself
let view; // the admin web page, loaded in the background and placed over the splash when ready
let revealed = false;
let pageReady = false;
let minElapsed = false;

const page = () => view.webContents;

function layoutView() {
  if (!win || !view || !revealed) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 0, y: 0, width, height });
}

// Show the admin page once BOTH the animation has had its time and the page has finished loading.
function maybeReveal() {
  if (revealed || !pageReady || !minElapsed || !win || win.isDestroyed()) return;
  revealed = true;
  // Fade the splash out, then slide the real page in over it.
  win.webContents.executeJavaScript("document.body.classList.add('leaving')").catch(() => {});
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    win.contentView.addChildView(view);
    layoutView();
    page().focus();
    // The splash is hidden now: stop its animations so they don't use the graphics card.
    win.webContents.loadURL("about:blank").catch(() => {});
    startUpdateChecks();
  }, FADE_MS);
}

/* ------------------------------ Updates ------------------------------ */
// The app asks GitHub Releases whether a newer version exists. If so it offers "Update now / Later".
// "Update now" downloads it, restarts the app and installs it by itself: no installer to click through.
// Not available in the portable .exe or when running from source (npm start).
const UPDATE_CHECK_EVERY_MS = 4 * 60 * 60 * 1000; // kitchen PCs stay on all day, so check again every 4 hours
let updaterReady = false;
let updateBusy = false; // a prompt or download is already in progress
let manualCheck = false;

function canSelfUpdate() {
  return !!autoUpdater && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
}

function setupUpdater() {
  if (updaterReady || !canSelfUpdate()) return;
  updaterReady = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on("update-available", async (info) => {
    if (updateBusy) return;
    updateBusy = true;
    manualCheck = false;
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "Update available",
      message: `A new version of Mithara Admin is ready (${info.version}).`,
      detail: "Update now? The app restarts and installs it in a few seconds.",
      buttons: ["Update now", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) {
      try {
        await autoUpdater.downloadUpdate();
      } catch {
        updateBusy = false;
        win.setProgressBar(-1);
        dialog.showMessageBox(win, { type: "warning", message: "The update could not be downloaded.", detail: "Please check the internet connection and try again from Help → Check for updates." });
      }
    } else {
      updateBusy = false;
    }
  });

  autoUpdater.on("download-progress", (p) => {
    if (win && !win.isDestroyed()) win.setProgressBar(Math.max(0, Math.min(1, p.percent / 100)));
  });

  autoUpdater.on("update-downloaded", () => {
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    // silent install, then reopen the app straight away
    autoUpdater.quitAndInstall(true, true);
  });

  autoUpdater.on("update-not-available", () => {
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox(win, { type: "info", message: "You're up to date.", detail: `Mithara Admin v${app.getVersion()}` });
    }
  });

  autoUpdater.on("error", () => {
    updateBusy = false;
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox(win, { type: "warning", message: "Could not check for updates.", detail: "Please check the internet connection and try again." });
    }
  });
}

function checkForUpdates(manual = false) {
  if (!canSelfUpdate()) {
    if (manual) {
      dialog.showMessageBox(win, {
        type: "info",
        message: "Updates are not available in this version.",
        detail: "Install the normal Setup version of Mithara Admin to get in-app updates.",
      });
    }
    return;
  }
  setupUpdater();
  if (updateBusy) return;
  manualCheck = manual;
  autoUpdater.checkForUpdates().catch(() => {});
}

let updateChecksStarted = false;
function startUpdateChecks() {
  if (updateChecksStarted || !canSelfUpdate()) return;
  updateChecksStarted = true;
  setTimeout(() => checkForUpdates(false), 6000); // a few seconds after the app is on screen, never during the splash
  setInterval(() => checkForUpdates(false), UPDATE_CHECK_EVERY_MS);
}

// The menu bar is hidden to keep the app clean. Tapping Alt shows / hides it. Because the admin page sits in
// its own layer inside the window, Windows' built-in Alt handling no longer sees the key, so it is done here.
function toggleMenuBar() {
  if (!win || win.isDestroyed()) return;
  win.setMenuBarVisibility(!win.isMenuBarVisible());
  // The page area changes size when the bar appears or disappears.
  setTimeout(layoutView, 40);
  setTimeout(layoutView, 250);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Mithara Admin",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#282345", // brand purple, so there is never a white flash
    show: false, // appear only once the splash is painted, not as an empty frame
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.maximize();

  // The admin page loads in a separate view that is NOT on screen yet.
  view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  view.setBackgroundColor("#ffffff");

  for (const ev of ["resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    win.on(ev, layoutView);
  }

  // 1) The splash appears at once from the local disk, and its minimum time starts when it is visible.
  win.once("ready-to-show", () => {
    win.show();
    setTimeout(() => {
      minElapsed = true;
      maybeReveal();
    }, SPLASH_MIN_MS);
  });
  win.loadFile(path.join(__dirname, "splash.html"));

  // 2) Meanwhile the real admin page loads behind it.
  page().once("did-finish-load", () => {
    pageReady = true;
    maybeReveal();
  });
  page().loadURL(START);

  // Safety net: if the page is extremely slow, show whatever we have rather than keep the splash forever.
  setTimeout(() => {
    pageReady = true;
    minElapsed = true;
    maybeReveal();
  }, SPLASH_MAX_MS);

  // Alt on its own (pressed and released, not used with another key) shows / hides the menu bar.
  let altDown = false;
  let altUsed = false;
  page().on("before-input-event", (_e, input) => {
    if (input.key === "Alt") {
      if (input.type === "keyDown") {
        if (!altDown) altUsed = false;
        altDown = true;
      } else if (input.type === "keyUp") {
        if (altDown && !altUsed) toggleMenuBar();
        altDown = false;
      }
    } else if (input.type === "keyDown" && altDown) {
      altUsed = true;
    }
  });

  // Anything outside the admin area (the public site, other sites) opens in the normal browser.
  page().setWindowOpenHandler(({ url }) => {
    if (isAllowedInApp(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  page().on("will-navigate", (e, url) => {
    if (!isAllowedInApp(url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  // No internet / server unreachable -> friendly retry page instead of a blank window.
  page().on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !url.startsWith("file:")) {
      page().loadFile(path.join(__dirname, "offline.html"));
    }
  });
}

const go = (url) => page().loadURL(url);
const zoom = (delta) => page().setZoomLevel(delta === 0 ? 0 : page().getZoomLevel() + delta);

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Mithara",
        submenu: [
          { label: "Dashboard", click: () => go(ORIGIN + "/admin/dashboard") },
          { label: "Orders", click: () => go(ORIGIN + "/admin/orders") },
          { label: "Kitchen", click: () => go(ORIGIN + "/admin/kitchen") },
          { type: "separator" },
          { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => go(START) },
          { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => page().print() },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "togglefullscreen" },
          // Zoom is applied to the admin page itself (the page sits inside the window as its own view).
          { label: "Zoom in", accelerator: "CmdOrCtrl+Plus", click: () => zoom(0.5) },
          { label: "Zoom in (alt)", accelerator: "CmdOrCtrl+=", visible: false, click: () => zoom(0.5) },
          { label: "Zoom out", accelerator: "CmdOrCtrl+-", click: () => zoom(-0.5) },
          { label: "Actual size", accelerator: "CmdOrCtrl+0", click: () => zoom(0) },
        ],
      },
      {
        label: "Help",
        submenu: [
          { label: "Check for updates…", accelerator: "CmdOrCtrl+Shift+U", click: () => checkForUpdates(true) },
          { type: "separator" },
          { label: "About", click: () => dialog.showMessageBox(win, { message: `Mithara Admin v${app.getVersion()}` }) },
        ],
      },
    ])
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    buildMenu();
  });
  app.on("window-all-closed", () => app.quit());
}
