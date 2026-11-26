const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const ORIGIN = new URL(config.appUrl).origin;
const START = ORIGIN + (config.startPath || "/admin");

// Only the management area (and printable invoices) may open inside the app.
const isAllowedInApp = (url) => {
  try {
    const u = new URL(url);
    return u.origin === ORIGIN && (u.pathname.startsWith("/admin") || u.pathname.startsWith("/invoice/"));
  } catch {
    return false;
  }
};

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Mithara Admin",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.maximize();
  win.loadURL(START);

  // Anything outside the admin area (the public site, other sites) opens in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedInApp(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isAllowedInApp(url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  // No internet / server unreachable -> friendly retry page instead of a blank window.
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !url.startsWith("file:")) {
      win.loadFile(path.join(__dirname, "offline.html"));
    }
  });
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Mithara",
        submenu: [
          { label: "Dashboard", click: () => win.loadURL(ORIGIN + "/admin/dashboard") },
          { label: "Orders", click: () => win.loadURL(ORIGIN + "/admin/orders") },
          { label: "Kitchen", click: () => win.loadURL(ORIGIN + "/admin/kitchen") },
          { type: "separator" },
          { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win.loadURL(START) },
          { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => win.webContents.print() },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { label: "View", submenu: [{ role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
      { label: "Help", submenu: [{ label: "About", click: () => dialog.showMessageBox(win, { message: `Mithara Admin v${app.getVersion()}` }) }] },
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
