#!/usr/bin/env node
/* 画廊多格式同步专项测试（2026-10-22）
 *
 * 起因：用户把 CS-01~CS-03 从 JPG 换成 PNG，暴露出三个问题——
 *  ① 界面与文档多处把 .jpg 写死，用户换格式后提示还在教人存 .jpg；
 *  ② 同 id 两种格式并存时，gallery_sync 用 readdir 顺序直接覆盖，
 *     清单随机指向哪张（不同时刻同步结果可能不同）→ 静默不确定；
 *  ③ gallery_compress 只处理 PNG 且一律转 JPEG，会把用户刚换的 PNG 又改回去。
 *
 * 本测试用临时目录构造各种边界，不碰真实 gallery/。
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const gs = require("./gallery_sync.js");

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("✗ " + name + (extra ? " | " + extra : "")); }
}

const IDS = { "CS-01": "案例一", "CS-02": "案例二", "GL-23": "预留位" };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "av_gal_"));

function reset() {
  for (const f of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, f));
}
function put(name, mtimeSec) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, "x");
  if (mtimeSec) {
    const t = new Date(mtimeSec * 1000);
    fs.utimesSync(p, t, t);
  }
  return p;
}

/* 1. 单格式：jpg / png 各自认领 */
reset();
put("CS-01.jpg", 1000);
put("CS-02.png", 1000);
let s = gs.scanDir(tmp, IDS);
ok(Object.keys(s.claimed).length === 2, "单格式：两张都认领", JSON.stringify(s.claimed));
ok(s.claimed["CS-01"] === "gallery/CS-01.jpg", "单格式：jpg 路径正确", s.claimed["CS-01"]);
ok(s.claimed["CS-02"] === "gallery/CS-02.png", "单格式：png 路径正确", s.claimed["CS-02"]);
ok(s.dups.length === 0 && s.unclaimed.length === 0, "单格式：无重复无未认领");

/* 2. 同 id 两种格式并存 → 取 mtime 较新的一张，且必须报 dup */
reset();
put("CS-01.jpg", 1000);
put("CS-01.png", 2000);
s = gs.scanDir(tmp, IDS);
ok(s.claimed["CS-01"] === "gallery/CS-01.png", "同 id 多格式：取较新的 png", s.claimed["CS-01"]);
ok(s.dups.length === 1 && s.dups[0].file === "CS-01.jpg", "同 id 多格式：多余的记为 dup 并报警",
  JSON.stringify(s.dups));
/* 反向：png 旧、jpg 新 → 必须取 jpg（不能写死优先级） */
reset();
put("CS-01.png", 1000);
put("CS-01.jpg", 2000);
s = gs.scanDir(tmp, IDS);
ok(s.claimed["CS-01"] === "gallery/CS-01.jpg", "同 id 多格式：png 旧 jpg 新时取 jpg（不写死优先级）",
  s.claimed["CS-01"]);

/* 3. 混排：jpg 与 png 混在同一目录 */
reset();
put("CS-01.jpg", 1000);
put("CS-02.png", 1000);
put("GL-23.png", 1000);
s = gs.scanDir(tmp, IDS);
ok(Object.keys(s.claimed).length === 3, "混排：jpg+png 三张全认领", JSON.stringify(s.claimed));
ok(s.claimed["GL-23"] === "gallery/GL-23.png", "混排：预留位 png 也认领", s.claimed["GL-23"]);

/* 4. 大小写与母版前缀 */
reset();
put("cs-01.PNG", 1000);      // 主干小写、扩展名大写
put("_CS-01.png", 1000);     // 母版前缀 → 不进清单
put("CS-02.jpg.tmp", 1000);  // 非图片扩展名 → 未认领
s = gs.scanDir(tmp, IDS);
ok(s.claimed["CS-01"] === "gallery/cs-01.PNG", "大小写：主干与扩展名大小写都归一化后认领",
  s.claimed["CS-01"]);
ok(s.unclaimed.indexOf("_CS-01.png") === -1, "母版前缀：_ 开头的文件不进清单也不报警",
  JSON.stringify(s.unclaimed));
ok(s.unclaimed.indexOf("CS-02.jpg.tmp") !== -1, "非图片扩展名：进未认领清单",
  JSON.stringify(s.unclaimed));

/* 5. 未登记的 id */
reset();
put("XX-99.png", 1000);
s = gs.scanDir(tmp, IDS);
ok(s.unclaimed.indexOf("XX-99.png") !== -1, "未登记 id：进未认领清单");
ok(Object.keys(s.claimed).length === 0, "未登记 id：不进清单");

/* 6. 支持的格式白名单 */
ok(gs.IMAGE_EXT.indexOf("png") !== -1 && gs.IMAGE_EXT.indexOf("jpg") !== -1 &&
   gs.IMAGE_EXT.indexOf("jpeg") !== -1 && gs.IMAGE_EXT.indexOf("webp") !== -1,
   "白名单：png/jpg/jpeg/webp 四种都在", gs.IMAGE_EXT.join(","));

/* 7. 真实画廊目录体检：清单与磁盘一致、无未认领、无重复 */
const real = gs.scanDir(path.join(__dirname, "..", "gallery"), gs.knownIds());
// 张数动态推导：用户在不断加图，写死数字会随每次添图而红。
// knownIds() 返回 {id: zh} 对象（不是数组），取 CS 前缀的键。
const nCs = Object.keys(gs.knownIds()).filter(id => /^CS-/.test(id)).length;
ok(Object.keys(real.claimed).length >= nCs, "真实目录：CS 案例位全部认领",
  String(Object.keys(real.claimed).length) + " 张（其中 CS " + nCs + "）");
ok(real.unclaimed.length === 0, "真实目录：无未认领文件", real.unclaimed.join(","));
ok(real.dups.length === 0, "真实目录：无同 id 多格式残留",
  JSON.stringify(real.dups));
const exts = Object.keys(real.claimed).map(k => real.claimed[k].split(".").pop().toLowerCase());
// 混排能力由上方的构造目录用例覆盖（jpg/png/webp 并存、同 id 多文件取舍）；
// 真实目录现在可能全是同一种格式（用户把 10 张都换成了 PNG），
// 这里只断言扩展名合法、且与磁盘对得上——不写死必须有两种格式
ok(exts.length > 0 && exts.every(e => /^(png|jpe?g|webp)$/i.test(e)),
  "真实目录：扩展名全部合法（jpg/png/webp 均可）", exts.join(","));

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\n画廊多格式测试：通过 " + pass + " / 失败 " + fail);
process.exit(fail ? 1 : 0);
