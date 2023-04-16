import { path } from "../server/deps.js";
import { HttpServer } from "../server/http_server.js";
import assetBundle from "../dist/asset_bundle.json" assert { type: "json" };
import { AssetBundle } from "../plugos/asset_bundle/bundle.js";
export function serveCommand(options, folder) {
  const pagesPath = path.resolve(Deno.cwd(), folder);
  const hostname = options.hostname || "127.0.0.1";
  const port = options.port || 3e3;
  const bareMode = options.bare;
  console.log("Going to start SilverBullet binding to", `${hostname}:${port}`);
  console.log("Serving pages from", pagesPath);
  if (hostname === "127.0.0.1") {
    console.log(
      `_Note:_ SilverBullet will only be available locally (via http://localhost:${port}), to allow outside connections, pass --host 0.0.0.0 as a flag.`
    );
  }
  const httpServer = new HttpServer({
    hostname,
    port,
    pagesPath,
    dbPath: path.join(pagesPath, options.db),
    assetBundle: new AssetBundle(assetBundle),
    user: options.user,
    bareMode,
  });
  httpServer.start().catch((e) => {
    console.error("HTTP Server error", e);
    Deno.exit(1);
  });
}
