import { proxySyscalls } from "../../plugos/syscalls/transport.js";
import { storeSyscalls } from "../../plugos/syscalls/store.sqlite.js";
export function clientStoreSyscalls(db) {
  const storeCalls = storeSyscalls(db, "localData");
  return proxySyscalls(
    ["clientStore.get", "clientStore.set", "clientStore.delete"],
    (ctx, name, ...args) => {
      return storeCalls[name.replace("clientStore.", "store.")](ctx, ...args);
    }
  );
}
