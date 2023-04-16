import { Command } from "https://deno.land/x/cliffy@v0.25.2/command/command.js";
import { version } from "./version.js";
import { upgradeCommand } from "./cmd/upgrade.js";
import { versionCommand } from "./cmd/version.js";
import { fixCommand } from "./cmd/fix.js";
import { serveCommand } from "./cmd/server.js";
import { plugCompileCommand } from "./cmd/plug_compile.js";
import { invokeFunction } from "./cmd/invokeFunction.js";
await new Command()
  .name("silverbullet")
  .description("Markdown as a platform")
  .version(version)
  .help({
    colors: false,
  })
  .usage("<options> <folder> | <command> (see below)")
  .arguments("<folder:string>")
  .option("--hostname <hostname:string>", "Hostname or address to listen on")
  .option("-p, --port <port:number>", "Port to listen on")
  .option("--bare [type:boolean]", "Don't auto generate pages", {
    default: false,
  })
  .option("--db <dbfile:string>", "Filename for the database", {
    default: "data.db",
  })
  .option(
    "--user <user:string>",
    "'username:password' combo for BasicAuth authentication"
  )
  .action(serveCommand)
  .command("fix", "Fix a broken space")
  .arguments("<folder:string>")
  .action(fixCommand)
  .command("plug:compile", "Bundle (compile) one or more plug manifests")
  .arguments("<...name.plug.yaml:string>")
  .option("--debug [type:boolean]", "Do not minifiy code", { default: false })
  .option("--info [type:boolean]", "Print out size info per function", {
    default: false,
  })
  .option("--watch, -w [type:boolean]", "Watch for changes and rebuild", {
    default: false,
  })
  .option(
    "--dist <path:string>",
    "Folder to put the resulting .plug.json file into",
    { default: "." }
  )
  .option("--importmap <path:string>", "Path to import map file to use")
  .action(plugCompileCommand)
  .command("invokeFunction", "Invoke a specific plug function from the CLI")
  .arguments("<path:string> <function:string> [...arguments:string]")
  .option("--db <dbfile:string>", "Filename for the database", {
    default: "data.db",
  })
  .action(invokeFunction)
  .command("upgrade", "Upgrade SilverBullet")
  .action(upgradeCommand)
  .command("version", "Get current version")
  .action(versionCommand)
  .parse(Deno.args);
