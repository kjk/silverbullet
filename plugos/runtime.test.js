import { createSandbox } from "./environments/deno_sandbox.js";
import { System } from "./system.js";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.165.0/testing/asserts.js";
Deno.test("Run a deno sandbox", async () => {
  const system = new System("server");
  system.registerSyscalls([], {
    addNumbers: (_ctx, a, b) => {
      return a + b;
    },
    failingSyscall: () => {
      throw new Error("#fail");
    },
  });
  system.registerSyscalls(["restricted"], {
    restrictedSyscall: () => {
      return "restricted";
    },
  });
  system.registerSyscalls(["dangerous"], {
    dangerousSyscall: () => {
      return "yay";
    },
  });
  const plug = await system.load(
    {
      name: "test",
      requiredPermissions: ["dangerous"],
      functions: {
        addTen: {
          code: `(() => {
          return {
            default: (n) => {
              return n + 10;
            }
          };
        })()`,
        },
        redirectTest: {
          redirect: "addTen",
        },
        redirectTest2: {
          redirect: "test.addTen",
        },
        addNumbersSyscall: {
          code: `(() => {
          return {
            default: async (a, b) => {
              return await self.syscall("addNumbers", a, b);
            }
          };
        })()`,
        },
        errorOut: {
          code: `(() => {
          return {
            default: () => {
              throw Error("BOOM");
            }
          };
        })()`,
        },
        errorOutSys: {
          code: `(() => {
          return {
            default: async () => {
              await self.syscall("failingSyscall");
            }
          };
        })()`,
        },
        restrictedTest: {
          code: `(() => {
          return {
            default: async () => {
              await self.syscall("restrictedSyscall");
            }
          };
        })()`,
        },
        dangerousTest: {
          code: `(() => {
          return {
            default: async () => {
              return await self.syscall("dangerousSyscall");
            }
          };
        })()`,
        },
      },
    },
    createSandbox
  );
  assertEquals(await plug.invoke("addTen", [10]), 20);
  assertEquals(await plug.invoke("redirectTest", [10]), 20);
  assertEquals(await plug.invoke("redirectTest2", [10]), 20);
  for (let i = 0; i < 100; i++) {
    assertEquals(await plug.invoke("addNumbersSyscall", [10, i]), 10 + i);
  }
  try {
    await plug.invoke("errorOut", []);
    assert(false);
  } catch (e) {
    assert(e.message.indexOf("BOOM") !== -1);
  }
  try {
    await plug.invoke("errorOutSys", []);
    assert(false);
  } catch (e) {
    assert(e.message.indexOf("#fail") !== -1);
  }
  try {
    await plug.invoke("restrictedTest", []);
    assert(false);
  } catch (e) {
    assert(
      e.message.indexOf(
        "Missing permission 'restricted' for syscall restrictedSyscall"
      ) !== -1
    );
  }
  assertEquals(await plug.invoke("dangerousTest", []), "yay");
  await system.unloadAll();
});
import { bundle as plugOsBundle } from "./bin/plugos-bundle.js";
import { esbuild } from "./compile.js";
import { urlToPathname } from "./util.js";
const __dirname = urlToPathname(new URL(".", import.meta.url));
Deno.test("Preload dependencies", async () => {
  const globalModules = await plugOsBundle(
    `${__dirname}../plugs/global.plug.yaml`
  );
  const testPlugManifest = await plugOsBundle(`${__dirname}test.plug.yaml`, {
    imports: [globalModules],
  });
  esbuild.stop();
  const system = new System("server");
  system.on({
    sandboxInitialized: async (sandbox) => {
      for (const [modName, code] of Object.entries(
        globalModules.dependencies
      )) {
        await sandbox.loadDependency(modName, code);
      }
    },
  });
  console.log("Loading test module");
  const testPlug = await system.load(testPlugManifest, createSandbox);
  console.log("Running");
  const result = await testPlug.invoke("boot", []);
  console.log("Result", result);
  await system.unloadAll();
});
