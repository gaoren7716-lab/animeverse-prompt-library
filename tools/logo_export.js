#!/usr/bin/env node
/* LOGO 导出：assets/logo.svg（图形标） + assets/logo-lockup.svg（横版组合）→ PNG
 * 跑法：NODE_PATH=<托管 node workspace>/node_modules node tools/logo_export.js
 * 产出：assets/logo.png（512 方形）、assets/logo-lockup.png（1240×256 横版）
 * SVG 是唯一真源，改造型改 SVG 后重跑本脚本，不要手改 PNG。 */
"use strict";
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const A = (p) => path.join(ROOT, "assets", p);

const JOBS = [
  { src: "logo.svg", out: "logo.png", w: 512, h: 512 },
  { src: "logo-lockup.svg", out: "logo-lockup.png", w: 1240, h: 256 },
];

(async function () {
  for (const j of JOBS) {
    await sharp(A(j.src), { density: 300 })
      .resize(j.w, j.h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(A(j.out));
    console.log("✓ " + j.out + "  " + j.w + "×" + j.h);
  }
  // favicon：32×32 方形 PNG，浏览器标签页用
  await sharp(A("logo.svg"), { density: 300 })
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(A("favicon.png"));
  console.log("✓ favicon.png  32×32");
})().catch(function (e) {
  console.log("✗ LOGO 导出失败：" + (e && e.message || e));
  process.exit(1);
});
