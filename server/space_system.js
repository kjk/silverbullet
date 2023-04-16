import { loadMarkdownExtensions } from "../common/markdown_parser/markdown_ext.js";
import buildMarkdown from "../common/markdown_parser/parser.js";
import { DiskSpacePrimitives } from "../common/spaces/disk_space_primitives.js";
import { EventedSpacePrimitives } from "../common/spaces/evented_space_primitives.js";
import { Space } from "../common/spaces/space.js";
import { markdownSyscalls } from "../common/syscalls/markdown.js";
import { createSandbox } from "../plugos/environments/deno_sandbox.js";
import { EventHook } from "../plugos/hooks/event.js";
import { CronHook } from "../plugos/hooks/cron.js";
import { esbuildSyscalls } from "../plugos/syscalls/esbuild.js";
import { eventSyscalls } from "../plugos/syscalls/event.js";
import fileSystemSyscalls from "../plugos/syscalls/fs.deno.js";
import {
  ensureFTSTable,
  fullTextSearchSyscalls,
} from "../plugos/syscalls/fulltext.sqlite.js";
import sandboxSyscalls from "../plugos/syscalls/sandbox.js";
import shellSyscalls from "../plugos/syscalls/shell.deno.js";
import {
  ensureTable as ensureStoreTable,
  storeSyscalls,
} from "../plugos/syscalls/store.sqlite.js";
import { System } from "../plugos/system.js";
import { PageNamespaceHook } from "../common/hooks/page_namespace.js";
import { PlugSpacePrimitives } from "../common/spaces/plug_space_primitives.js";
import {
  ensureTable as ensureIndexTable,
  pageIndexSyscalls,
} from "./syscalls/index.js";
import spaceSyscalls from "../common/syscalls/space.js";
import { systemSyscalls } from "./syscalls/system.js";
import { AssetBundlePlugSpacePrimitives } from "../common/spaces/asset_bundle_space_primitives.js";
import assetSyscalls from "../plugos/syscalls/asset.js";
import { AsyncSQLite } from "../plugos/sqlite/async_sqlite.js";
import { FileMetaSpacePrimitives } from "../common/spaces/file_meta_space_primitives.js";
import { sandboxFetchSyscalls } from "../plugos/syscalls/fetch.js";
import { syncSyscalls } from "../common/syscalls/sync.js";
export const indexRequiredKey = "$spaceIndexed";
export class SpaceSystem {
  constructor(assetBundle, pagesPath, databasePath) {
    this.assetBundle = assetBundle;
    const globalModules = JSON.parse(
      assetBundle.readTextFileSync(`web/global.plug.json`)
    );
    this.system = new System("server");
    this.eventHook = new EventHook();
    this.system.addHook(this.eventHook);
    const namespaceHook = new PageNamespaceHook();
    this.system.addHook(namespaceHook);
    this.db = new AsyncSQLite(databasePath);
    this.db.init().catch((e) => {
      console.error("Error initializing database", e);
    });
    const indexSyscalls = pageIndexSyscalls(this.db);
    try {
      this.spacePrimitives = new FileMetaSpacePrimitives(
        new AssetBundlePlugSpacePrimitives(
          new EventedSpacePrimitives(
            new PlugSpacePrimitives(
              new DiskSpacePrimitives(pagesPath),
              namespaceHook,
              "server"
            ),
            this.eventHook
          ),
          assetBundle
        ),
        indexSyscalls
      );
      this.space = new Space(this.spacePrimitives);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        console.error("Pages folder", pagesPath, "not found");
      } else {
        console.error(e.message);
      }
      Deno.exit(1);
    }
    this.system.addHook(new CronHook(this.system));
    this.system.registerSyscalls(
      [],
      indexSyscalls,
      storeSyscalls(this.db, "store"),
      fullTextSearchSyscalls(this.db, "fts"),
      spaceSyscalls(this.space),
      syncSyscalls(this.spacePrimitives, this.system),
      eventSyscalls(this.eventHook),
      markdownSyscalls(buildMarkdown([])),
      esbuildSyscalls([globalModules]),
      systemSyscalls(this.loadPlugsFromSpace.bind(this), this.system),
      sandboxSyscalls(this.system),
      assetSyscalls(this.system),
      sandboxFetchSyscalls()
    );
    this.system.registerSyscalls(["shell"], shellSyscalls(pagesPath));
    this.system.registerSyscalls(["fs"], fileSystemSyscalls("/"));
    this.system.on({
      sandboxInitialized: async (sandbox) => {
        for (const [modName, code] of Object.entries(
          globalModules.dependencies
        )) {
          await sandbox.loadDependency(modName, code);
        }
      },
    });
  }
  async loadPlugsFromSpace() {
    await this.space.updatePageList();
    const allPlugs = await this.space.listPlugs();
    console.log("Going to load", allPlugs.length, "plugs...");
    await Promise.all(
      allPlugs.map(async (plugName) => {
        const { data } = await this.space.readAttachment(plugName, "utf8");
        await this.system.load(JSON.parse(data), createSandbox);
      })
    );
    this.system.registerSyscalls(
      [],
      markdownSyscalls(buildMarkdown(loadMarkdownExtensions(this.system)))
    );
  }
  async ensureSpaceIndex(forceReindex = false) {
    const corePlug = this.system.loadedPlugs.get("core");
    if (!corePlug) {
      console.error("Something went very wrong, 'core' plug not found");
      return;
    }
    if (
      forceReindex ||
      !(await this.system.localSyscall("core", "store.get", [indexRequiredKey]))
    ) {
      console.log("Now reindexing space...");
      await corePlug.invoke("reindexSpace", []);
      await this.system.localSyscall("core", "store.set", [
        indexRequiredKey,
        true,
      ]);
    }
  }
  async start() {
    await ensureIndexTable(this.db);
    await ensureStoreTable(this.db, "store");
    await ensureFTSTable(this.db, "fts");
    await this.loadPlugsFromSpace();
  }
}
