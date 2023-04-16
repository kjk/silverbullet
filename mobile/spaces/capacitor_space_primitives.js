import {
  base64Decode,
  base64Encode,
} from "../../plugos/asset_bundle/base64.js";
import { Encoding, Filesystem } from "../deps.js";
import { mime } from "../../plugos/deps.js";
export class CapacitorSpacePrimitives {
  constructor(source, root) {
    this.source = source;
    this.root = root;
  }
  async fetchFileList() {
    const allFiles = [];
    const directory = this.source;
    const root = this.root;
    async function readAllFiles(dir) {
      const files = await Filesystem.readdir({
        path: `${root}/${dir}`,
        directory,
      });
      for (const file of files.files) {
        if (file.type === "file") {
          const name = `${dir}/${file.name}`.substring(1);
          allFiles.push({
            name,
            lastModified: file.mtime,
            perm: "rw",
            contentType: mime.getType(file.name) || "application/octet-stream",
            size: file.size,
          });
        } else {
          await readAllFiles(`${dir}/${file.name}`);
        }
      }
    }
    await readAllFiles("");
    return allFiles;
  }
  async readFile(name, encoding) {
    let data;
    try {
      switch (encoding) {
        case "utf8":
          data = (
            await Filesystem.readFile({
              path: this.root + name,
              directory: this.source,
              encoding: Encoding.UTF8,
            })
          ).data;
          break;
        case "arraybuffer": {
          const b64Data = (
            await Filesystem.readFile({
              path: this.root + name,
              directory: this.source,
            })
          ).data;
          data = base64Decode(b64Data);
          break;
        }
        case "dataurl": {
          const b64Data = (
            await Filesystem.readFile({
              path: this.root + name,
              directory: this.source,
            })
          ).data;
          data = `data:${
            mime.getType(name) || "application/octet-stream"
          };base64,${b64Data}`;
          break;
        }
      }
      return {
        data,
        meta: await this.getFileMeta(name),
      };
    } catch {
      throw new Error(`Page not found`);
    }
  }
  async getFileMeta(name) {
    try {
      const statResult = await Filesystem.stat({
        path: this.root + name,
        directory: this.source,
      });
      return {
        name,
        contentType: mime.getType(name) || "application/octet-stream",
        lastModified: statResult.mtime,
        perm: "rw",
        size: statResult.size,
      };
    } catch (e) {
      console.error("Error getting file meta", e.message);
      throw new Error(`Page not found`);
    }
  }
  async writeFile(name, encoding, data) {
    switch (encoding) {
      case "utf8":
        await Filesystem.writeFile({
          path: this.root + name,
          directory: this.source,
          encoding: Encoding.UTF8,
          data,
          recursive: true,
        });
        break;
      case "arraybuffer":
        await Filesystem.writeFile({
          path: this.root + name,
          directory: this.source,
          data: base64Encode(new Uint8Array(data)),
          recursive: true,
        });
        break;
      case "dataurl":
        await Filesystem.writeFile({
          path: this.root + name,
          directory: this.source,
          data: data.split(";base64,")[1],
          recursive: true,
        });
        break;
    }
    return this.getFileMeta(name);
  }
  async deleteFile(name) {
    await Filesystem.deleteFile({
      path: this.root + name,
      directory: this.source,
    });
  }
  proxySyscall(plug, name, args) {
    return plug.syscall(name, args);
  }
  invokeFunction(plug, _env, name, args) {
    return plug.invoke(name, args);
  }
}
