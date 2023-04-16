import { bundleRun } from "../plugos/bin/plugos-bundle.js";
import { esbuild } from "../plugos/compile.js";
export async function plugCompileCommand(
  { watch, dist, debug, info, importmap },
  ...manifestPaths
) {
  await bundleRun(manifestPaths, dist, watch, {
    debug,
    info,
    importMap: importmap ? new URL(importmap, `file://${Deno.cwd()}/`) : void 0,
  });
  esbuild.stop();
}
