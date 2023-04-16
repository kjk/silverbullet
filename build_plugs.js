import { expandGlobSync, flags, path } from "./plugos/deps.js";
import { bundleRun } from "./plugos/bin/plugos-bundle.js";
import { esbuild } from "./plugos/compile.js";
if (import.meta.main) {
  const args = flags.parse(Deno.args, {
    boolean: ["debug", "watch", "reload", "info"],
    string: ["dist", "importmap"],
    alias: { w: "watch" },
  });
  if (!args.dist) {
    args.dist = path.resolve(path.join("dist_bundle", "_plug"));
  }
  const manifests = [];
  const pattern = path.join("plugs", "*", "*.plug.yaml");
  for (const file of expandGlobSync(pattern)) {
    manifests.push(file.path);
  }
  await bundleRun(manifests, args.dist, args.watch, {
    debug: args.debug,
    reload: args.reload,
    info: args.info,
    importMap: args.importmap
      ? new URL(args.importmap, `file://${Deno.cwd()}/`)
      : void 0,
  });
  esbuild.stop();
}
