#!/usr/bin/env node
/* 静态资源版本号（缓存破坏）——「换了内容但 URL 不变，浏览器/CDN 一直发旧字节」
 * 这类不同步出现过两轮：第一轮是忘了重建清单，第二轮是清单重建了、推送了，
 * 页面却还拿缓存的旧 gallery-imgs.js。文件名不变的资源都有这个坑。
 *
 * 做法：版本号集中存在 index.html 的 window.ASSET_VER（入口文件本身缓存短），
 * 所有 <script>/<link> 引用拼 ?v=<版本>；清单里的图片路径、README 的缩略图
 * 引用同理。版本一变，全部 URL 变，浏览器和 GitHub Pages CDN 都必须重新取。
 *
 *   readVer()            读当前版本
 *   bumpVer()            生成新版本（时间戳）并写进 index.html，返回新版本
 *   q(ver, path)         path + "?v=" + ver（path 已带 query 则不重复拼）
 *
 * 谁该调 bumpVer：任何会改变已发布资产内容的工具——
 *   gallery_refresh.js（换图）、build_web.js（数据变动）、手动改 assets/*.js 后。
 * 跑完 bump 必须重跑依赖版本的产物（gallery_sync / embed_gallery），
 * 否则 --check 会因版本不一致报红——这是故意的，防止漏跑。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const VER_RE = /window\.ASSET_VER\s*=\s*"([^"]*)"/;
// 只替换 ?v= 后面的值；不动 URL 里可能存在的其他 query（目前没有，防将来）
const QUERY_RE = /(\?v=)[^"'\s>]*/g;

function readVer() {
  const t = fs.readFileSync(HTML, "utf8");
  const m = t.match(VER_RE);
  return m ? m[1] : "";
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    "-" + p(d.getHours()) + p(d.getMinutes());
}

function writeVer(v) {
  let t = fs.readFileSync(HTML, "utf8");
  if (!VER_RE.test(t)) {
    console.error("✗ index.html 找不到 window.ASSET_VER，先按注释格式补上");
    process.exit(1);
  }
  t = t.replace(VER_RE, 'window.ASSET_VER="' + v + '"');
  t = t.replace(QUERY_RE, "$1" + v);
  fs.writeFileSync(HTML, t, "utf8");
}

function bumpVer() {
  const v = stamp();
  writeVer(v);
  return v;
}

function q(v, p) {
  if (!v) return p;
  return p.indexOf("?") >= 0 ? p : p + "?v=" + v;
}

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === "bump") {
    console.log("资产版本号 → " + bumpVer());
  } else {
    console.log("当前资产版本号：" + (readVer() || "（未设置）"));
  }
}
module.exports = { readVer, bumpVer, writeVer, q };
