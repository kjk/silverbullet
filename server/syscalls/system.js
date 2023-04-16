export function systemSyscalls(plugReloader, system) {
  return {
    "system.invokeFunction": (ctx, _env, name, ...args) => {
      if (!ctx.plug) {
        throw Error("No plug associated with context");
      }
      let plug = ctx.plug;
      if (name.indexOf(".") !== -1) {
        const [plugName, functionName] = name.split(".");
        plug = system.loadedPlugs.get(plugName);
        if (!plug) {
          throw Error(`Plug ${plugName} not found`);
        }
        name = functionName;
      }
      return plug.invoke(name, args);
    },
    "system.reloadPlugs": () => {
      return plugReloader();
    },
    "system.getEnv": () => {
      return system.env;
    }
  };
}
