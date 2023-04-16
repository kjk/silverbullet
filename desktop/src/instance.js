var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) =>
      x.done
        ? resolve(x.value)
        : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
import { spawn } from "node:child_process";
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  MenuItem,
  nativeImage,
  shell,
} from "electron";
import portfinder from "portfinder";
import fetch from "node-fetch";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { newWindowState, persistWindowState, removeWindow } from "./store";
export const runningServers = /* @__PURE__ */ new Map();
let denoPath = `${process.resourcesPath}/deno`;
if (!existsSync(denoPath)) {
  if (platform() === "win32") {
    if (existsSync(`${process.resourcesPath}/deno.exe`)) {
      denoPath = `${process.resourcesPath}/deno.exe`;
    } else {
      denoPath = "deno.exe";
    }
  } else {
    denoPath = "deno";
  }
}
function folderPicker() {
  return __async(this, null, function* () {
    const dialogReturn = yield dialog.showOpenDialog({
      title: "Pick a page folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (dialogReturn.filePaths.length === 1) {
      return dialogReturn.filePaths[0];
    }
  });
}
export function openFolderPicker() {
  return __async(this, null, function* () {
    const folderPath = yield folderPicker();
    if (folderPath) {
      app.addRecentDocument(folderPath);
      openFolder(newWindowState(folderPath));
    }
  });
}
export function openFolder(windowState) {
  return __async(this, null, function* () {
    const instance = yield spawnInstance(windowState.folderPath);
    newWindow(instance, windowState);
  });
}
function determineSilverBulletScriptPath() {
  let scriptPath = `${process.resourcesPath}/silverbullet.js`;
  if (!existsSync(scriptPath)) {
    console.log("Dev mode");
    scriptPath = "../silverbullet.js";
  }
  return scriptPath;
}
function spawnInstance(pagePath) {
  return __async(this, null, function* () {
    let instance = runningServers.get(pagePath);
    if (instance) {
      return instance;
    }
    portfinder.setBasePort(3010);
    portfinder.setHighestPort(3999);
    const port = yield portfinder.getPortPromise();
    const proc = spawn(denoPath, [
      "run",
      "-A",
      "--unstable",
      determineSilverBulletScriptPath(),
      "--port",
      "" + port,
      pagePath,
    ]);
    proc.stdout.on("data", (data) => {
      process.stdout.write(`[SB Out] ${data}`);
    });
    proc.stderr.on("data", (data) => {
      process.stderr.write(`[SB Err] ${data}`);
    });
    proc.on("close", (code) => {
      if (code) {
        console.log(`child process exited with code ${code}`);
      }
    });
    for (let i = 0; i < 30; i++) {
      try {
        const result = yield fetch(`http://localhost:${port}`);
        if (result.ok) {
          console.log("Live!");
          instance = {
            folder: pagePath,
            port,
            refcount: 0,
            proc,
          };
          runningServers.set(pagePath, instance);
          return instance;
        }
        console.log("Still booting...");
      } catch (e) {
        console.log("Still booting...");
      }
      yield new Promise((resolve) => setTimeout(resolve, 500));
    }
  });
}
export function findInstanceByUrl(url) {
  for (const instance of runningServers.values()) {
    if (instance.port === +url.port) {
      return instance;
    }
  }
  return null;
}
let quitting = false;
const icon = nativeImage.createFromPath(process.resourcesPath + "/logo.png");
export function newWindow(instance, windowState) {
  const window = new BrowserWindow({
    height: windowState.height,
    width: windowState.width,
    x: windowState.x,
    y: windowState.y,
    icon,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  instance.refcount++;
  persistWindowState(windowState, window);
  window.webContents.setWindowOpenHandler(({ url }) => {
    const instance2 = findInstanceByUrl(new URL(url));
    if (instance2) {
      newWindow(instance2, newWindowState(instance2.folder));
    } else {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("context-menu", (event, params) => {
    const menu = new Menu();
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => window.webContents.replaceMisspelling(suggestion),
          })
        );
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: "separator" }));
      }
      menu.append(
        new MenuItem({
          label: "Add to dictionary",
          click: () =>
            window.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord
            ),
        })
      );
      menu.append(new MenuItem({ type: "separator" }));
    }
    menu.append(new MenuItem({ label: "Cut", role: "cut" }));
    menu.append(new MenuItem({ label: "Copy", role: "copy" }));
    menu.append(new MenuItem({ label: "Paste", role: "paste" }));
    menu.popup();
  });
  window.on("resized", () => {
    console.log("Reized window");
    persistWindowState(windowState, window);
  });
  window.on("moved", () => {
    persistWindowState(windowState, window);
  });
  window.webContents.on("did-navigate-in-page", () => {
    persistWindowState(windowState, window);
  });
  window.once("close", () => {
    console.log("Closed window");
    instance.refcount--;
    console.log("Refcount", instance.refcount);
    if (!quitting) {
      removeWindow(windowState);
    }
    if (instance.refcount === 0) {
      console.log("Stopping server");
      instance.proc.kill();
      runningServers.delete(instance.folder);
    }
  });
  window.loadURL(`http://localhost:${instance.port}${windowState.urlPath}`);
}
app.on("before-quit", () => {
  console.log("Quitting");
  quitting = true;
});
