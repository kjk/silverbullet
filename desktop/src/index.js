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
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
import { app, BrowserWindow, Menu } from "electron";
import { openFolder, openFolderPicker } from "./instance";
import { menu } from "./menu";
import { getOpenWindows, newWindowState } from "./store";
if (require("electron-squirrel-startup")) {
  app.quit();
}
require("update-electron-app")();
function boot() {
  return __async(this, null, function* () {
    console.log("Process args", process.argv);
    const openWindows = getOpenWindows();
    if (openWindows.length === 0) {
      yield openFolderPicker();
    } else {
      for (const window of openWindows) {
        yield openFolder(window);
      }
    }
  });
}
app.on("ready", () => {
  Menu.setApplicationMenu(menu);
  console.log("App data path", app.getPath("userData"));
  boot().catch(console.error);
});
app.on("open-file", (event, path) => {
  openFolder(newWindowState(path)).catch(console.error);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    boot();
  }
});
