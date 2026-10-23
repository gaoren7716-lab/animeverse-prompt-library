/* 画廊一键刷新：换图后只跑这一条。
 *
 *   node tools/gallery_refresh.js
 *
 * 依次做五件事：
 *   ⓿ asset_ver.js bump      递增 index.html 资产版本号（缓存破坏，见下）
 *   ① gallery_sync.js        重建清单（认 png/jpg/jpeg/webp，按 id 归组取最新）
 *   ② gallery_compress.js    压缩到 1200px（保留原格式，PNG 不出 JPG）
 *   ③ embed_gallery.js       刷新 README 画廊段与 320px 缩略图
 *   ④ gallery_sync.js --check 体检（清单与目录必须一致）
 *
 * 为什么需要这一条：往 gallery/ 里丢图只是第一步，页面读的是清单
 * （assets/gallery-imgs.js），README 读的是缩略图（assets/gallery-thumbs/）——
 * 不重建清单，页面还指向旧文件，刷新一万次也不会变。
 *
 * ⓿ 为什么必须有：清单重建了、推送了，浏览器和 GitHub Pages CDN 仍可能发
 * 缓存的旧字节——文件名没变的资源（gallery-imgs.js、同名换图、同名缩略图）
 * 都吃这一套。先把 index.html 的版本号顶上去，所有资源 URL 全变，缓存自然失效。
 * bump 与 sync 的顺序不能反：反了 sync 写进清单的还是旧版本号。
 *
 * 跑完记得提交推送（见 AGENTS.md「推送」节），线上才会更新。
 */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const { bumpVer } = require("./asset_ver.js");

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

// ⓿ 先顶版本号：index.html 一改，页面引用的四个 JS + favicon/logo 全换新 URL。
// 放在 sync 之前——清单和 README 里的图片/缩略图路径要带的是新版本。
const ver = bumpVer();
console.log("⓿ 资产版本号 → " + ver + "（index.html 全部资源引用已换新 URL）");

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
