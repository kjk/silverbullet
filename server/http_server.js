import { Application, path, Router } from "./deps.js";
import { EndpointHook } from "../plugos/hooks/endpoint.js";
import { SpaceSystem } from "./space_system.js";
import { ensureAndLoadSettings } from "../common/util.js";
import { base64Decode } from "../plugos/asset_bundle/base64.js";
const staticLastModified = new Date().toUTCString();
export class HttpServer {
  constructor(options) {
    this.settings = {};
    this.hostname = options.hostname;
    this.port = options.port;
    this.app = new Application();
    this.user = options.user;
    this.systemBoot = new SpaceSystem(
      options.assetBundle,
      options.pagesPath,
      options.dbPath
    );
    this.bareMode = options.bareMode || false;
    this.systemBoot.eventHook.addLocalListener(
      "get-plug:file",
      async (plugPath) => {
        const resolvedPath = path.resolve(plugPath);
        try {
          const manifestJson = await Deno.readTextFile(resolvedPath);
          return JSON.parse(manifestJson);
        } catch {
          throw new Error(
            `No such file: ${resolvedPath} or could not parse as JSON`
          );
        }
      }
    );
    setInterval(() => {
      this.systemBoot.space.updatePageList().catch(console.error);
    }, 5e3);
    this.systemBoot.system.addHook(new EndpointHook(this.app, "/_"));
  }
  async start() {
    await this.systemBoot.start();
    await this.systemBoot.ensureSpaceIndex();
    await ensureAndLoadSettings(this.systemBoot.space, this.bareMode);
    this.addPasswordAuth(this.app);
    this.app.use(async ({ request, response }, next) => {
      if (request.url.pathname === "/") {
        if (request.headers.get("If-Modified-Since") === staticLastModified) {
          response.status = 304;
          return;
        }
        response.headers.set("Content-type", "text/html");
        response.body =
          this.systemBoot.assetBundle.readTextFileSync("web/index.html");
        response.headers.set("Last-Modified", staticLastModified);
        return;
      }
      try {
        const assetName = `web${request.url.pathname}`;
        if (
          this.systemBoot.assetBundle.has(assetName) &&
          request.headers.get("If-Modified-Since") === staticLastModified
        ) {
          response.status = 304;
          return;
        }
        response.status = 200;
        response.headers.set(
          "Content-type",
          this.systemBoot.assetBundle.getMimeType(assetName)
        );
        const data = this.systemBoot.assetBundle.readFileSync(assetName);
        response.headers.set("Cache-Control", "no-cache");
        response.headers.set("Content-length", "" + data.length);
        response.headers.set("Last-Modified", staticLastModified);
        if (request.method === "GET") {
          response.body = data;
        }
      } catch {
        await next();
      }
    });
    const fsRouter = this.buildFsRouter(this.systemBoot.spacePrimitives);
    this.app.use(fsRouter.routes());
    this.app.use(fsRouter.allowedMethods());
    const plugRouter = this.buildPlugRouter();
    this.app.use(plugRouter.routes());
    this.app.use(plugRouter.allowedMethods());
    this.app.use((ctx) => {
      ctx.response.headers.set("Content-type", "text/html");
      ctx.response.body =
        this.systemBoot.assetBundle.readTextFileSync("web/index.html");
    });
    this.abortController = new AbortController();
    this.app
      .listen({
        hostname: this.hostname,
        port: this.port,
        signal: this.abortController.signal,
      })
      .catch((e) => {
        console.log("Server listen error:", e.message);
        Deno.exit(1);
      });
    const visibleHostname =
      this.hostname === "0.0.0.0" ? "localhost" : this.hostname;
    console.log(
      `SilverBullet is now running: http://${visibleHostname}:${this.port}`
    );
  }
  addPasswordAuth(app) {
    const excludedPaths = [
      "/manifest.json",
      "/favicon.png",
      "/logo.png",
      "/.auth",
    ];
    if (this.user) {
      const b64User = btoa(this.user);
      app.use(async ({ request, response, cookies }, next) => {
        if (!excludedPaths.includes(request.url.pathname)) {
          const authCookie = await cookies.get("auth");
          if (!authCookie || authCookie !== b64User) {
            response.redirect(`/.auth?refer=${request.url.pathname}`);
            return;
          }
        }
        if (request.url.pathname === "/.auth") {
          if (request.method === "GET") {
            response.headers.set("Content-type", "text/html");
            response.body =
              this.systemBoot.assetBundle.readTextFileSync("web/auth.html");
            return;
          } else if (request.method === "POST") {
            const values = await request.body({ type: "form" }).value;
            const username = values.get("username"),
              password = values.get("password"),
              refer = values.get("refer");
            if (this.user === `${username}:${password}`) {
              await cookies.set("auth", b64User, {
                expires: new Date(Date.now() + 1e3 * 60 * 60 * 24 * 7),
                sameSite: "strict",
              });
              response.redirect(refer || "/");
            } else {
              response.redirect("/.auth?error=1");
            }
            return;
          } else {
            response.status = 401;
            response.body = "Unauthorized";
            return;
          }
        } else {
          await next();
        }
      });
    }
  }
  buildFsRouter(spacePrimitives) {
    const fsRouter = new Router();
    fsRouter.get("/", async ({ response }) => {
      response.headers.set("Content-type", "application/json");
      const files = await spacePrimitives.fetchFileList();
      response.body = JSON.stringify(files);
    });
    fsRouter
      .get("/(.+)", async ({ params, response, request }) => {
        const name = params[0];
        try {
          const attachmentData = await spacePrimitives.readFile(
            name,
            "arraybuffer"
          );
          const lastModifiedHeader = new Date(
            attachmentData.meta.lastModified
          ).toUTCString();
          if (request.headers.get("If-Modified-Since") === lastModifiedHeader) {
            response.status = 304;
            return;
          }
          response.status = 200;
          response.headers.set(
            "X-Last-Modified",
            "" + attachmentData.meta.lastModified
          );
          response.headers.set("Cache-Control", "no-cache");
          response.headers.set("X-Permission", attachmentData.meta.perm);
          response.headers.set("Last-Modified", lastModifiedHeader);
          response.headers.set("Content-Type", attachmentData.meta.contentType);
          response.body = attachmentData.data;
        } catch {
          response.status = 404;
          response.body = "";
        }
      })
      .put("/(.+)", async ({ request, response, params }) => {
        const name = params[0];
        console.log("Saving file", name);
        let body;
        if (request.headers.get("X-Content-Base64")) {
          const content = await request.body({ type: "text" }).value;
          body = base64Decode(content);
        } else {
          body = await request.body({ type: "bytes" }).value;
        }
        try {
          const meta = await spacePrimitives.writeFile(
            name,
            "arraybuffer",
            body
          );
          response.status = 200;
          response.headers.set("Content-Type", meta.contentType);
          response.headers.set("X-Last-Modified", "" + meta.lastModified);
          response.headers.set("X-Content-Length", "" + meta.size);
          response.headers.set("X-Permission", meta.perm);
          response.body = "OK";
        } catch (err) {
          response.status = 500;
          response.body = "Write failed";
          console.error("Pipeline failed", err);
        }
      })
      .options("/(.+)", async ({ response, params }) => {
        const name = params[0];
        try {
          const meta = await spacePrimitives.getFileMeta(name);
          response.status = 200;
          response.headers.set("Content-Type", meta.contentType);
          response.headers.set("X-Last-Modified", "" + meta.lastModified);
          response.headers.set("X-Content-Length", "" + meta.size);
          response.headers.set("X-Permission", meta.perm);
        } catch {
          response.status = 404;
          response.body = "File not found";
        }
      })
      .delete("/(.+)", async ({ response, params }) => {
        const name = params[0];
        try {
          await spacePrimitives.deleteFile(name);
          response.status = 200;
          response.body = "OK";
        } catch (e) {
          console.error("Error deleting attachment", e);
          response.status = 200;
          response.body = e.message;
        }
      });
    return new Router().use("/fs", fsRouter.routes());
  }
  buildPlugRouter() {
    const plugRouter = new Router();
    const system = this.systemBoot.system;
    plugRouter.post("/:plug/syscall/:name", async (ctx) => {
      const name = ctx.params.name;
      const plugName = ctx.params.plug;
      const args = await ctx.request.body().value;
      const plug = system.loadedPlugs.get(plugName);
      if (!plug) {
        ctx.response.status = 404;
        ctx.response.body = `Plug ${plugName} not found`;
        return;
      }
      try {
        const result = await system.syscallWithContext({ plug }, name, args);
        ctx.response.headers.set("Content-Type", "application/json");
        ctx.response.body = JSON.stringify(result);
      } catch (e) {
        console.log("Error", e);
        ctx.response.status = 500;
        ctx.response.body = e.message;
        return;
      }
    });
    plugRouter.post("/:plug/function/:name", async (ctx) => {
      const name = ctx.params.name;
      const plugName = ctx.params.plug;
      const args = await ctx.request.body().value;
      const plug = system.loadedPlugs.get(plugName);
      if (!plug) {
        ctx.response.status = 404;
        ctx.response.body = `Plug ${plugName} not found`;
        return;
      }
      try {
        const result = await plug.invoke(name, args);
        ctx.response.headers.set("Content-Type", "application/json");
        ctx.response.body = JSON.stringify(result);
      } catch (e) {
        ctx.response.status = 500;
        ctx.response.body = e.message;
      }
    });
    return new Router().use("/plug", plugRouter.routes());
  }
  async stop() {
    const system = this.systemBoot.system;
    if (this.abortController) {
      console.log("Stopping");
      await system.unloadAll();
      console.log("Stopped plugs");
      this.abortController.abort();
      console.log("stopped server");
    }
  }
}
