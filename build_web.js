import * as esbuildWasm from "https://deno.land/x/esbuild@v0.14.54/wasm.js";
import * as esbuildNative from "https://deno.land/x/esbuild@v0.14.54/mod.js";
import { denoPlugin } from "https://deno.land/x/esbuild_deno_loader@0.6.0/mod.js";
import { copy } from "https://deno.land/std@0.165.0/fs/copy.js";
import sass from "https://deno.land/x/denosass@1.0.4/mod.js";
import { bundleFolder } from "./plugos/asset_bundle/builder.js";
import { patchDenoLibJS } from "./plugos/hack.js";
import { bundle as plugOsBundle } from "./plugos/bin/plugos-bundle.js";
import * as flags from "https://deno.land/std@0.165.0/flags/mod.js";
export const esbuild = Deno.run === void 0 ? esbuildWasm : esbuildNative;
export async function prepareAssets(dist) {
  await copy("web/fonts", `${dist}`, { overwrite: true });
  await copy("web/index.html", `${dist}/index.html`, {
    overwrite: true,
  });
  await copy("web/auth.html", `${dist}/auth.html`, {
    overwrite: true,
  });
  await copy("web/images/favicon.png", `${dist}/favicon.png`, {
    overwrite: true,
  });
  await copy("web/images/logo.png", `${dist}/logo.png`, {
    overwrite: true,
  });
  await copy("web/manifest.json", `${dist}/manifest.json`, {
    overwrite: true,
  });
  const compiler = sass(Deno.readTextFileSync("web/styles/main.scss"), {
    load_paths: ["web/styles"],
  });
  await Deno.writeTextFile(`${dist}/main.css`, compiler.to_string("expanded"));
  const globalManifest = await plugOsBundle("./plugs/global.plug.yaml");
  await Deno.writeTextFile(
    `${dist}/global.plug.json`,
    JSON.stringify(globalManifest, null, 2)
  );
  let bundleJs = await Deno.readTextFile(`${dist}/client.js`);
  bundleJs = patchDenoLibJS(bundleJs);
  await Deno.writeTextFile(`${dist}/client.js`, bundleJs);
}
export async function bundle(watch, type, distDir) {
  let building = false;
  await doBuild(`${type}/boot.ts`);
  let timer;
  if (watch) {
    const watcher = Deno.watchFs([type, "dist_bundle/_plug"]);
    for await (const _event of watcher) {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        console.log("Change detected, rebuilding...");
        doBuild(`${type}/boot.ts`);
      }, 1e3);
    }
  }
  async function doBuild(mainScript) {
    if (building) {
      return;
    }
    building = true;
    if (type === "mobile") {
      await bundleFolder("dist_bundle", "dist/asset_bundle.json");
    }
    await Promise.all([
      esbuild.build({
        entryPoints: {
          client: mainScript,
          service_worker: "web/service_worker.ts",
          worker: "plugos/environments/sandbox_worker.ts",
        },
        outdir: distDir,
        absWorkingDir: Deno.cwd(),
        bundle: true,
        treeShaking: true,
        sourcemap: "linked",
        minify: true,
        jsxFactory: "h",
        jsx: "automatic",
        jsxFragment: "Fragment",
        jsxImportSource: "https://esm.sh/preact@10.11.1",
        plugins: [
          denoPlugin({
            importMapURL: new URL("./import_map.json", import.meta.url),
          }),
        ],
      }),
    ]);
    await prepareAssets(distDir);
    if (type === "web") {
      await bundleFolder("dist_bundle", "dist/asset_bundle.json");
    }
    building = false;
    console.log("Built!");
  }
}
if (import.meta.main) {
  const args = flags.parse(Deno.args, {
    boolean: ["watch"],
    alias: { w: "watch" },
    default: {
      watch: false,
    },
  });
  await bundle(args.watch, "web", "dist_bundle/web");
  if (!args.watch) {
    esbuild.stop();
  }
}
