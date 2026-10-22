#!/usr/bin/env node
/* 画廊压缩：gallery/*.{png,jpg,jpeg,webp} → 宽 1200px，按原格式重新编码（覆盖原文件）。
 *
 * 设计约定（2026-10-22 改）：
 *  - **保留原格式**。早期版本只处理 PNG 且一律转成 JPEG 再删掉原 PNG，
 *    用户手动把图换成 PNG 后跑这个工具会把格式又改回去，等于撤销用户操作。
 *    现在 PNG 仍出 PNG、JPEG 仍出 JPEG，只做尺寸与码率优化。
 *  - **原地覆盖**，不删文件、不改名 → 文件名（= 槽位 id）永远稳定。
 *  - 想统一转 JPEG 用 --to jpg（显式指定才转，不做默认行为）。
 * 依赖 sharp（NODE_PATH 指向托管 node workspace 的 node_modules）。
 * 跑完不用重建清单（文件名没变）；但如果 --to jpg 改了扩展名，必须再跑 gallery_sync.js。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GAL = path.join(ROOT, "gallery");
const EXT_RE = /\.(png|jpe?g|webp)$/i;

const argv = process.argv.slice(2);
const toJpg = argv.includes("--to") ? argv[argv.indexOf("--to") + 1] === "jpg" : false;
const dry = argv.includes("--dry");

async function main() {
  let sharp;
  try { sharp = require("sharp"); }
  catch (e) { console.error("✗ 缺 sharp：NODE_PATH=.../node/workspace/node_modules 再跑"); process.exit(1); }

  const files = fs.readdirSync(GAL).filter(f => !f.startsWith("_") && EXT_RE.test(f));
  if (!files.length) { console.log("画廊无图片，无需压缩"); return; }

  let totalBefore = 0, totalAfter = 0;
  for (const f of files) {
    const src = path.join(GAL, f);
    const before = fs.statSync(src).size;
    totalBefore += before;

    const m = await sharp(src).metadata();
    const isPng = m.format === "png";
    // PNG 走调色板量化（256 色）——纯 PNG 重编码对照片类图省不了多少，调色板才压得下来
    let pipe = sharp(src).resize({ width: 1200, withoutEnlargement: true });
    let buf;
    if (toJpg) {
      buf = await pipe.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    } else if (isPng) {
      buf = await pipe.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
    } else if (m.format === "webp") {
      buf = await pipe.webp({ quality: 88 }).toBuffer();
    } else {
      buf = await pipe.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    }
    totalAfter += buf.length;

    const newName = toJpg ? f.replace(EXT_RE, ".jpg") : f;
    const dst = path.join(GAL, newName);
    if (dry) {
      console.log("  (dry) " + f + " " + Math.round(before / 1024) + " KB → " +
        Math.round(buf.length / 1024) + " KB");
      continue;
    }
    /* 先写临时文件再原子替换：直接覆盖目标文件时若被占用（缩略图缓存 /
     * 资源管理器预览）会抛 UNKNOWN open，整批中断。临时文件 + rename 稳。 */
    const tmp = dst + ".tmp";
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dst);
    if (newName !== f) fs.unlinkSync(src);
    const arrow = newName === f ? "" : "（改名）";
    console.log("✓ " + f + arrow + " " + Math.round(before / 1024) + " KB → " +
      Math.round(buf.length / 1024) + " KB  " + m.width + "x" + m.height);
  }
  console.log("压缩完成：" + files.length + " 张，" +
    Math.round(totalBefore / 1024) + " KB → " + Math.round(totalAfter / 1024) + " KB" +
    (toJpg ? "（已转 JPEG，扩展名变了，须重跑 gallery_sync.js）" : "（格式与文件名均未变）") +
    (dry ? "【dry-run，未写盘】" : ""));
}

main().catch(e => { console.error(e); process.exit(1); });
