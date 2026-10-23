/* 画廊一键刷新：换图后只跑这一条。
 *
 *   node tools/gallery_refresh.js
 *
 * 依次做四件事：
 *   ① gallery_sync.js        重建清单（认 png/jpg/jpeg/webp，按 id 归组取最新）
 *   ② gallery_compress.js    压缩到 1200px（保留原格式，PNG 不出 JPG）
 *   ③ embed_gallery.js       刷新 README 画廊段与 320px 缩略图
 *   ④ gallery_sync.js --check 体检（清单与目录必须一致）
 *
 * 为什么需要这一条：往 gallery/ 里丢图只是第一步，页面读的是清单
 * （assets/gallery-imgs.js），README 读的是缩略图（assets/gallery-thumbs/）——
 * 不重建清单，页面还指向旧文件，刷新一万次也不会变。
 *
 * 跑完记得提交推送（见 AGENTS.md「推送」节），线上才会更新。
 */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const NODE = process.execPath;
const ROOT = path.join(__dirname, "..");
const STEPS = [
  { name: "① 重建清单", cmd: ["tools/gallery_sync.js"] },
  { name: "② 压缩图片", cmd: ["tools/gallery_compress.js"] },
  { name: "③ 刷新 README 缩略图", cmd: ["tools/embed_gallery.js"] },
  { name: "④ 清单体检", cmd: ["tools/gallery_sync.js", "--check"] },
];

// sharp 装在外部 workspace，透传 NODE_PATH 让子进程也能 require 到
const env = Object.assign({}, process.env);
if (!env.NODE_PATH && process.env.npm_config_NODE_PATH) env.NODE_PATH = process.env.npm_config_NODE_PATH;

let failed = 0;
for (const s of STEPS) {
  const r = spawnSync(NODE, s.cmd, { cwd: ROOT, stdio: "inherit", env });
  if (r.status !== 0) {
    failed++;
    console.log("✗ " + s.name + " 失败（退出码 " + r.status + "），已中止");
    break;
  }
}

if (failed) {
  console.log("\n画廊刷新未完成，请按上面的报错排查。");
  process.exit(1);
}
console.log("\n✅ 画廊刷新完成。本地刷新页面即可看到新图；要更新线上，提交推送并等 Pages 重建。");
