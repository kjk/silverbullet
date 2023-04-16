import { Editor } from "../web/editor.jsx";
import { ensureAndLoadSettings, safeRun } from "../common/util.js";
import { Space } from "../common/spaces/space.js";
import { PlugSpacePrimitives } from "../common/spaces/plug_space_primitives.js";
import { PageNamespaceHook } from "../common/hooks/page_namespace.js";
import { System } from "../plugos/system.js";
import { Directory, CapacitorApp } from "./deps.js";
import { CapacitorSpacePrimitives } from "./spaces/capacitor_space_primitives.js";
import { AssetBundlePlugSpacePrimitives } from "../common/spaces/asset_bundle_space_primitives.js";
import assetBundle from "../dist/asset_bundle.json" assert { type: "json" };
import { AssetBundle } from "../plugos/asset_bundle/bundle.js";
import {
  ensureTable as ensureStoreTable,
  storeSyscalls,
} from "../plugos/syscalls/store.sqlite.js";
import { CapacitorDb } from "../plugos/sqlite/capacitor_sqlite.js";
import {
  ensureTable as ensurePageIndexTable,
  pageIndexSyscalls,
} from "../server/syscalls/index.js";
import {
  ensureFTSTable,
  fullTextSearchSyscalls,
} from "../plugos/syscalls/fulltext.sqlite.js";
import { FileMetaSpacePrimitives } from "../common/spaces/file_meta_space_primitives.js";
import { EventedSpacePrimitives } from "../common/spaces/evented_space_primitives.js";
import { EventHook } from "../plugos/hooks/event.js";
import { clientStoreSyscalls } from "./syscalls/clientStore.js";
import { sandboxFetchSyscalls } from "../plugos/syscalls/fetch.js";
import { syncSyscalls } from "../common/syscalls/sync.js";
import { CronHook } from "../plugos/hooks/cron.js";
safeRun(async () => {
  const system = new System();
  const namespaceHook = new PageNamespaceHook();
  system.addHook(namespaceHook);
  const eventHook = new EventHook();
  system.addHook(eventHook);
  const db = new CapacitorDb("data.db");
  await db.init();
  const cronHook = new CronHook(system);
  system.addHook(cronHook);
  await ensureStoreTable(db, "store");
  await ensureStoreTable(db, "localData");
  await ensurePageIndexTable(db);
  await ensureFTSTable(db, "fts");
  const indexSyscalls = pageIndexSyscalls(db);
  const spacePrimitives = new FileMetaSpacePrimitives(
    new AssetBundlePlugSpacePrimitives(
      new EventedSpacePrimitives(
        new PlugSpacePrimitives(
          new CapacitorSpacePrimitives(Directory.Documents, ""),
          namespaceHook
        ),
        eventHook
      ),
      new AssetBundle(assetBundle)
    ),
    indexSyscalls
  );
  const space = new Space(spacePrimitives);
  space.watch();
  const settings = await ensureAndLoadSettings(space, false);
  system.registerSyscalls(
    [],
    storeSyscalls(db, "store"),
    indexSyscalls,
    clientStoreSyscalls(db),
    syncSyscalls(spacePrimitives, system),
    fullTextSearchSyscalls(db, "fts"),
    sandboxFetchSyscalls()
  );
  console.log("Booting...");
  const editor = new Editor(
    space,
    system,
    eventHook,
    document.getElementById("sb-root"),
    "",
    settings
  );
  await editor.init();
  CapacitorApp.addListener("pause", () => {
    console.log("PAUSING APP-------");
    space.unwatch();
    cronHook.stop();
  });
  CapacitorApp.addListener("resume", () => {
    console.log("RESUMING APP-------");
    space.watch();
    cronHook.reloadCrons();
  });
  CapacitorApp.addListener("appRestoredResult", (result) => {
    console.log("Restored state", result);
  });
});
