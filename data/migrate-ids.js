/* ===================================================================
 * migrate-ids.js — 给 data.json 加稳定 id
 *   用法：node migrate-ids.js
 * =================================================================== */

const fs = require("fs");
const path = require("path");

const DATA_DIR = "data";
const DATA_FILE = "data.json";
const FILE = path.join(__dirname, DATA_DIR, DATA_FILE);

function genId(prefix) {
  return (
    prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function main() {
  const raw = fs.readFileSync(FILE, "utf8");
  const data = JSON.parse(raw);

  let chCount = 0;
  let wCount = 0;

  (data.chapters || []).forEach((ch) => {
    if (!ch.id) {
      ch.id = genId("ch_");
      chCount++;
    }
    (ch.words || []).forEach((w) => {
      if (!w.id) {
        w.id = genId("w_");
        wCount++;
      }
    });
  });

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
  console.log(
    "[migrate-ids] 完成：新增章节 id " +
      chCount +
      " 个，单词 id " +
      wCount +
      " 个",
  );
}

main();
