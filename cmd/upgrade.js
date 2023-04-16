import { version } from "../version.js";
export async function upgradeCommand() {
  console.log("Now going to attempt an upgrade...");
  const p = Deno.run({
    cmd: ["deno", "cache", "--reload", Deno.mainModule],
  });
  const exitCode = await p.status();
  if (!exitCode.success) {
    console.error("Something went wrong there...");
    Deno.exit(1);
  }
  console.log(
    "So, that's done. Now let's see if this actually did anything..."
  );
  const vp = Deno.run({
    cmd: ["deno", "run", "-A", "--unstable", Deno.mainModule, "version"],
    stdout: "piped",
  });
  const versionStatus = await vp.status();
  if (!versionStatus.success) {
    console.error("Could not run version command, something is wrong.");
    Deno.exit(1);
  }
  const rawVersion = await vp.output();
  const newVersion = new TextDecoder().decode(rawVersion).trim();
  if (newVersion === version) {
    console.log(
      `Nope. I hate to tell you this, but it looks like we're still running ${newVersion}. This was a bit of a futile exercise. Let's try again soon some time.`
    );
  } else {
    console.log(
      `Congrats, we've upgraded you from ${version} to ${newVersion}. Seems like quite a bump, enjoy! https://silverbullet.md/CHANGELOG may give you more hints on what's new.`
    );
  }
}
