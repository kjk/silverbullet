var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
import axios from "axios";
import fs from "node:fs";
export function downloadFile(url, destFile) {
  return __async(this, null, function* () {
    const file = fs.createWriteStream(destFile);
    let response = yield axios.request({
      url,
      method: "GET",
      responseType: "stream"
    });
    return new Promise((resolve, reject) => {
      response.data.pipe(file);
      let error = null;
      file.on("error", (e) => {
        error = e;
        reject(e);
      });
      file.on("close", () => {
        if (error) {
          return;
        }
        file.close();
        resolve();
      });
    });
  });
}
