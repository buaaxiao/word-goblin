/* ===================================================================
 * migrate-ids.js — 给 data.json 加稳定 id
 *   用法：node migrate-ids.js
 * =================================================================== */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const DATA_DIR = "data";
const DATA_FILE = "data.json";
const FILE = path.join(__dirname, DATA_DIR, DATA_FILE);

function main() {
  const raw = fs.readFileSync(FILE, "utf8");
  const data = JSON.parse(raw);

  let chCount = 0;
  let wCount = 0;

  (data.chapters || []).forEach((ch) => {
    if (!ch.id) {
      ch.id = randomUUID();
      chCount++;
    }
    (ch.words || []).forEach((w) => {
      if (!w.id) {
        w.id = randomUUID();
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
