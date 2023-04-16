import { walk } from "https://deno.land/std@0.165.0/fs/mod.js";
import { resolve } from "https://deno.land/std@0.165.0/path/mod.js";
import { mime } from "https://deno.land/x/mimetypes@v1.0.0/mod.js";
const rootDir = resolve("website_build/fs");
const allFiles = [];
for await (const file of walk(rootDir, {
  includeDirs: false,
  skip: [/^.*\/\..+$/],
})) {
  const fullPath = file.path;
  const s = await Deno.stat(fullPath);
  allFiles.push({
    name: fullPath.substring(rootDir.length + 1),
    lastModified: 1,
    contentType: mime.getType(fullPath) || "application/octet-stream",
    size: s.size,
    perm: "rw",
  });
}
console.log(JSON.stringify(allFiles, null, 2));
