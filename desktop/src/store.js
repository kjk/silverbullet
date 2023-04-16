import Store from "electron-store";
const store = new Store({
  defaults: {
    openWindows: []
  }
});
export function getOpenWindows() {
  return store.get("openWindows");
}
import crypto from "node:crypto";
export function newWindowState(folderPath) {
  return {
    id: crypto.randomBytes(16).toString("hex"),
    width: 800,
    height: 600,
    x: void 0,
    y: void 0,
    folderPath,
    urlPath: "/"
  };
}
export function persistWindowState(windowState, window) {
  const [width, height] = window.getSize();
  const [x, y] = window.getPosition();
  windowState.height = height;
  windowState.width = width;
  windowState.x = x;
  windowState.y = y;
  const urlString = window.webContents.getURL();
  if (urlString) {
    windowState.urlPath = new URL(urlString).pathname;
  }
  let found = false;
  const newWindows = getOpenWindows().map((win) => {
    if (win.id === windowState.id) {
      found = true;
      return windowState;
    } else {
      return win;
    }
  });
  if (!found) {
    newWindows.push(windowState);
  }
  store.set(
    "openWindows",
    newWindows
  );
}
export function removeWindow(windowState) {
  const newWindows = getOpenWindows().filter(
    (win) => win.id !== windowState.id
  );
  store.set(
    "openWindows",
    newWindows
  );
}
