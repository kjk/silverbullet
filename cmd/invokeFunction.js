import { SpaceSystem } from "../server/space_system.js";
import assetBundle from "../dist/asset_bundle.json" assert { type: "json" };
import { path } from "../plugos/deps.js";
import { AssetBundle } from "../plugos/asset_bundle/bundle.js";
export async function invokeFunction(
  options,
  pagesPath,
  functionName,
  ...args
) {
  console.log("Going to invoke funciton", functionName, "with args", args);
  const spaceSystem = new SpaceSystem(
    new AssetBundle(assetBundle),
    pagesPath,
    path.join(pagesPath, options.db)
  );
  await spaceSystem.start();
  const [plugName, funcName] = functionName.split(".");
  const plug = spaceSystem.system.loadedPlugs.get(plugName);
  if (!plug) {
    console.error("Plug not found", plugName);
    Deno.exit(1);
  }
  await plug.invoke(funcName, args);
  Deno.exit(0);
}
