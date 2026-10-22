#!/usr/bin/env node
/* 画廊压缩：gallery/*.png → 1200px JPEG q88（吸收 art-prompt-forge 约定）。
 * 转换成功后删除原 PNG（原图在系统临时目录留底，仓库只进压缩件）。
 * 依赖 sharp（NODE_PATH 指向托管 node workspace 的 node_modules）。
 * 跑完必须再跑 gallery_sync.js 重建清单（扩展名变了）。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GAL = path.join(ROOT, "gallery");

async function main() {
  let sharp;
  try { sharp = require("sharp"); }
  catch (e) { console.error("✗ 缺 sharp：NODE_PATH=.../node/workspace/node_modules 再跑"); process.exit(1); }

  const pngs = fs.readdirSync(GAL).filter(f => /\.png$/i.test(f));
  if (!pngs.length) { console.log("画廊无 PNG，无需压缩"); return; }

  for (const f of pngs) {
    const src = path.join(GAL, f);
    const dst = path.join(GAL, f.replace(/\.png$/i, ".jpg"));
    const buf = await sharp(src).resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    fs.writeFileSync(dst, buf);
    fs.unlinkSync(src);
    console.log("✓ " + f + " → " + path.basename(dst) + " (" + Math.round(buf.length / 1024) + " KB)");
  }
  console.log("压缩完成：" + pngs.length + " 张。记得跑 gallery_sync 重建清单。");
}

main().catch(e => { console.error(e); process.exit(1); });
