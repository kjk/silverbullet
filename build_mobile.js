import { bundle, esbuild } from "./build_web.js";
import * as flags from "https://deno.land/std@0.165.0/flags/mod.js";
if (import.meta.main) {
  const args = flags.parse(Deno.args, {
    boolean: ["watch"],
    alias: { w: "watch" },
    default: {
      watch: false,
    },
  });
  await bundle(args.watch, "mobile", "mobile/dist");
  if (!args.watch) {
    esbuild.stop();
  }
}
