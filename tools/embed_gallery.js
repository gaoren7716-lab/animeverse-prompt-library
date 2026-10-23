#!/usr/bin/env node
/* README 画廊嵌入：把已配图的槽位渲染进 README 的 GALLERY-EMBED 段
 *
 * 真源：assets/gallery-imgs.js（gallery_sync.js 同步出来的派生清单）
 *      —— 不自己扫目录，避免第二份扫描逻辑与 sync 漂移
 * 缩略图：assets/gallery-thumbs/<id>.jpg（320px q82）
 *      —— README 若直接引原图会加载 3MB，缩略图 10 张才 ~250KB
 * 卡槽标题：data/cases.json（CS-*）→ data/gallery.json（GL-* 预留位）
 *
 * 用法：node tools/embed_gallery.js          写入 README
 *      node tools/embed_gallery.js --check  只体检不写
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { q, readVer } = require("./asset_ver.js");

const ROOT = path.join(__dirname, "..");
const README = path.join(ROOT, "README.md");
const MANIFEST = path.join(ROOT, "assets", "gallery-imgs.js");
const THUMBS = path.join(ROOT, "assets", "gallery-thumbs");
const PAGES = "https://gaoren7716-lab.github.io/animeverse-prompt-library/";
const THUMB_W = 320;
const PER_ROW = 5;

const START = "<!-- GALLERY-EMBED:START -->";
const END = "<!-- GALLERY-EMBED:END -->";

// 读清单（派生物里的 window.GALLERY_IMGS = {...};）
function readManifest() {
  if (!fs.existsSync(MANIFEST)) return null;
  const txt = fs.readFileSync(MANIFEST, "utf8");
  const m = txt.match(/GALLERY_IMGS\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// 卡号 → 中文标题（CS-* 取案例名，GL-* 取槽位名）
function readTitles() {
  const out = {};
  const load = (f) => {
    const p = path.join(ROOT, "data", f);
    if (!fs.existsSync(p)) return [];
    try { return JSON.parse(fs.readFileSync(p, "utf8")).items || []; } catch (e) { return []; }
  };
  load("cases.json").forEach(it => { out[it.id] = it.zh; });
  load("gallery.json").forEach(it => { if (!out[it.id]) out[it.id] = it.zh; });
  return out;
}

/* 生成缩略图。sharp 缺席时跳过——不因此中断，README 退回引原图。
 * （sharp 装在外部 workspace，不强制依赖；缺了就退档，别把人卡在环境上）
 *
 * 必须 async/await 等全部落盘：sharp 是异步的，用 spin 等会阻塞事件循环，
 * 结果是谁都完不成（Node 单线程，I/O 回调也要抢同一个循环）。 */
async function makeThumbs(list) {
  let sharp = null;
  try { sharp = require("sharp"); } catch (e) { return []; }
  if (!fs.existsSync(THUMBS)) fs.mkdirSync(THUMBS, { recursive: true });
  const made = [];
  const jobs = list.map(async ({ id, src }) => {
    const dst = path.join(THUMBS, id + ".jpg");
    // 清单路径带 ?v= 缓存破坏参数，拼本地路径前剥掉（否则 existsSync 恒假，缩略图全跳过）
    const abs = path.join(ROOT, src.split("?")[0]);
    if (!fs.existsSync(abs)) return;
    // 幂等：缩略图不比原图旧就跳过
    if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(abs).mtimeMs) {
      made.push(dst); return;
    }
    try {
      const tmp = dst + ".tmp";
      await sharp(abs).rotate().resize({ width: THUMB_W, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true }).toFile(tmp);
      fs.renameSync(tmp, dst);
      made.push(dst);
    } catch (e) {
      try { fs.unlinkSync(dst + ".tmp"); } catch (e2) { /* ignore */ }
      // 单张失败不拖垮其余
    }
  });
  await Promise.all(jobs);
  return made;
}

function buildBlock(ids, titles, thumbOk) {
  const ver = readVer();
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const rows = [];
  for (let i = 0; i < ids.length; i += PER_ROW) {
    const row = ids.slice(i, i + PER_ROW).map(id => {
      // 缩略图与退回路径都拼版本号：重生成的同名缩略图也要让 GitHub 重新渲染
      const img = thumbOk ? q(ver, "assets/gallery-thumbs/" + id + ".jpg")
        : q(ver, "gallery/" + id + ".png");
      const title = titles[id] || id;
      // 图点击直接跳到线上画廊页；alt 带卡号+标题，悬停可读
      return '<a href="' + PAGES + '#v-gallery"><img src="' + img +
        '" width="19%" alt="' + esc(id + " " + title) + '"></a>';
    });
    rows.push("<p>\n  " + row.join("\n  ") + "\n</p>");
  }
  const n = ids.length;
  // 槽位总数与两类来源都从数据读，不写死——用户在不断填预留位，
  // 写死 50 的话每次加图这段文案就与事实脱节
  let total = n;
  try {
    const gal = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "gallery.json"), "utf8"));
    if (gal.slots && gal.slots.length) total = gal.slots.length;
  } catch (e) { /* 读不到就退回用图数，别因此中断 */ }
  const nCs = ids.filter(id => /^CS-/.test(id)).length;
  const nGl = n - nCs;
  return [
    "<p>",
    "  画廊已上墙 " + n + " 张：CS-01~CS-" + String(nCs).padStart(2, "0") +
    " 是自带配方的验证案例实测，" + (nGl ? "GL 段 " + nGl + " 张是预留位按配方出图，" : "") +
    "剩余 " + (total - n) + " 个预留位<strong>自带完整配方、可直接复制去出图</strong>：",
    "</p>",
    "",
  ].concat(rows).join("\n");
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const manifest = readManifest();
  if (!manifest) {
    console.log("✗ 读不到 assets/gallery-imgs.js，先跑 node tools/gallery_sync.js");
    process.exit(1);
  }
  const titles = readTitles();
  const ids = Object.keys(manifest).sort();
  if (!ids.length) { console.log("✗ 清单为空，没有可展示的图"); process.exit(1); }

  // 缩略图（缺 sharp 时退回原图路径）
  let thumbOk = false;
  if (!checkOnly) {
    const made = await makeThumbs(ids.map(id => ({ id: id, src: manifest[id] })));
    thumbOk = made.length > 0;
  } else {
    thumbOk = fs.existsSync(path.join(THUMBS, ids[0] + ".jpg"));
  }

  const block = buildBlock(ids, titles, thumbOk);

  if (!fs.existsSync(README)) { console.log("✗ README.md 不存在"); process.exit(1); }
  const txt = fs.readFileSync(README, "utf8");
  const si = txt.indexOf(START), ei = txt.indexOf(END);
  if (si < 0 || ei < 0) {
    console.log("✗ README.md 缺 " + START + " / " + END + " 标记");
    process.exit(1);
  }

  const inner = txt.slice(si + START.length, ei).replace(/^\n/, "").replace(/\n$/, "");
  if (checkOnly) {
    if (inner.trim() !== block.trim()) {
      console.log("✗ README 画廊段与清单不同步，重跑 node tools/embed_gallery.js");
      process.exit(1);
    }
    // 引用到的图片文件是否真的存在（路径带 ?v= 版本号，比对前先剥掉）
    const miss = [];
    const refs = inner.match(/src="([^"]+)"/g) || [];
    refs.forEach(r => {
      const p = r.slice(5, -1).split("?")[0];
      if (!fs.existsSync(path.join(ROOT, p))) miss.push(p);
    });
    if (miss.length) { console.log("✗ README 引用了不存在的图片：" + miss.join(", ")); process.exit(1); }
    console.log("README 画廊段体检通过：" + ids.length + " 张图，引用文件齐全");
    return;
  }

  const next = txt.slice(0, si + START.length) + "\n" + block + "\n" + txt.slice(ei);
  if (next === txt) { console.log("README 画廊段无变化"); return; }
  fs.writeFileSync(README, next);
  console.log("README 画廊段已更新：" + ids.length + " 张（" + (thumbOk ? "缩略图" : "原图") + "）");
}

if (require.main === module) main();
module.exports = { main, readManifest, buildBlock };
