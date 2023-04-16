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
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";
import { platform } from "node:os";
import fs from "node:fs";
import path from "node:path";
import decompress from "decompress";
import { downloadFile } from "./http_util";
const denoVersion = "v1.29.1";
const denoZip = {
  "win32-x64": "deno-x86_64-pc-windows-msvc.zip",
  "darwin-x64": "deno-x86_64-apple-darwin.zip",
  "darwin-arm64": "deno-aarch64-apple-darwin.zip",
  "linux-x64": "deno-x86_64-unknown-linux-gnu.zip"
};
const denoExecutableResource = platform() === "win32" ? "resources/deno.exe" : "resources/deno";
function downloadDeno(platform2, arch) {
  return __async(this, null, function* () {
    const folder = fs.mkdtempSync("deno-download");
    const destFile = path.join(folder, "deno.zip");
    const zipFile = denoZip[`${platform2}-${arch}`];
    if (!zipFile) {
      throw new Error(`No deno binary for ${platform2}-${arch}`);
    }
    yield downloadFile(
      `https://github.com/denoland/deno/releases/download/${denoVersion}/${zipFile}`,
      destFile
    );
    yield decompress(destFile, "resources");
    fs.rmSync(folder, { recursive: true });
  });
}
const config = {
  packagerConfig: {
    name: process.platform === "linux" ? "silverbullet" : "SilverBullet",
    executableName: process.platform === "linux" ? "silverbullet" : "SilverBullet",
    icon: "../web/images/logo",
    appBundleId: "md.silverbullet",
    extraResource: [denoExecutableResource, "resources/silverbullet.js", "resources/logo.png"],
    beforeCopyExtraResources: [(_buildPath, _electronVersion, platform2, arch, callback) => {
      if (fs.existsSync(denoExecutableResource)) {
        fs.rmSync(denoExecutableResource, { force: true });
      }
      Promise.resolve().then(() => __async(void 0, null, function* () {
        yield downloadDeno(platform2, arch);
        fs.copyFileSync("../dist/silverbullet.js", "resources/silverbullet.js");
        fs.copyFileSync("../web/images/logo.png", "resources/logo.png");
      })).then((r) => callback()).catch(callback);
    }],
    osxSign: {
      optionsForFile: (filePath) => {
        return {
          entitlements: "entitlements.plist"
        };
      }
    }
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      iconUrl: "https://silverbullet.md/logo.ico",
      setupIcon: "../web/images/logo.ico"
    }),
    new MakerZIP({}, ["darwin", "linux"]),
    new MakerRpm({}),
    new MakerDeb({
      options: {
        icon: "../web/images/logo.png"
      }
    })
  ],
  plugins: [
    new WebpackPlugin({
      port: 3001,
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            name: "main_window",
            preload: {
              js: "./src/preload.ts"
            }
          }
        ]
      }
    })
  ]
};
function notarizeMaybe() {
  if (process.platform !== "darwin") {
    return;
  }
  if (!process.env.CI) {
    return;
  }
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
    console.warn(
      "Should be notarizing, but environment variables APPLE_ID or APPLE_ID_PASSWORD are missing!"
    );
    return;
  }
  config.packagerConfig.osxNotarize = {
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  };
}
notarizeMaybe();
export default config;
