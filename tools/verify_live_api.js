#!/usr/bin/env node
/* 线上产物验收（GitHub API 通道）
 *
 * 为什么不用 playwright 访问 Pages：github.io 域名在本机 Chrome 的网络栈里连不上
 * （page.goto 超时），而 node fetch / GitHub API 走的是另一条路，畅通。
 * Pages 的构建产物就是仓库 main 分支的内容（静态直出），所以用 API 核对
 * 远端仓库字节 == 验线上效果，且比截图更严格（看的是真实发布的文件）。
 *
 * 用法：node tools/verify_live_api.js
 *   环境变量：AV_REPO=<owner/name>  指定仓库（默认本项目）
 *             GITHUB_TOKEN=<token>  GitHub 访问令牌（也兼容 GH_TOKEN）
 *   没有令牌时匿名访问（只读公开内容仍可跑，但读不到 Pages 状态等私有字段）。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = process.env.AV_REPO || "gaoren7716-lab/animeverse-prompt-library";
// 令牌来源：环境变量优先 → 本机临时目录的 gh_tok.txt → 匿名
function readToken() {
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env && env.trim()) return env.trim();
  const tmp = process.env.TEMP || process.env.TMPDIR || "/tmp";
  try {
    const t = fs.readFileSync(path.join(tmp, "gh_tok.txt"), "utf8").trim();
    if (t) return t;
  } catch (e) { /* 匿名模式 */ }
  return "";
}
const TOKEN = readToken();
const H = { Accept: "application/vnd.github+json", "User-Agent": "av-verify" };
if (TOKEN) H.Authorization = "token " + TOKEN;
else console.log("（未找到 GitHub 令牌，以匿名模式访问公开接口）");

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name + (extra ? " | " + extra : "")); }
}

async function api(p) {
  const r = await fetch("https://api.github.com/repos/" + REPO + p, { headers: H });
  if (!r.ok) throw new Error(p + " -> " + r.status);
  return r.json();
}

(async () => {
  // 1. 线上清单：与本地清单一致（用户在不断加图，数字一律动态比）
  const mf = await api("/contents/assets/gallery-imgs.js?ref=main");
  const txt = Buffer.from(mf.content, "base64").toString("utf8");
  const m = txt.match(/window\.GALLERY_IMGS\s*=\s*(\{[\s\S]*?\});/);
  const imgs = m ? JSON.parse(m[1]) : {};
  const keys = Object.keys(imgs);
  let localKeys = keys;
  try {
    const lt = fs.readFileSync(path.join(__dirname, "..", "assets", "gallery-imgs.js"), "utf8");
    const lm = lt.match(/window\.GALLERY_IMGS\s*=\s*(\{[\s\S]*?\});/);
    if (lm) localKeys = Object.keys(JSON.parse(lm[1]));
  } catch (e) { /* 跑在没 clone 的机器上就只验线上自身一致性 */ }
  ok(keys.length === localKeys.length && keys.every(k => imgs[k]),
    "线上清单与本地一致（" + keys.length + " 条）",
    "线上 " + keys.length + " / 本地 " + localKeys.length);
  const paths = keys.map(k => imgs[k]);
  // 路径带 ?v= 缓存破坏参数（tools/asset_ver.js），断言前先剥掉
  const bare = paths.map(p => p.split("?")[0]);
  ok(bare.every(p => /\.(png|jpe?g|webp)$/i.test(p)),
    "线上清单扩展名全部合法（jpg/png 均可，不写死格式）", paths.join(","));
  ok(!/CS-0[123]\.jpg/i.test(txt), "线上清单已不引用旧的 CS-0x.jpg");

  // 2. 远端 gallery/ 目录：文件真实存在、格式与清单对得上、旧文件已删
  const list = await api("/contents/gallery/?ref=main");
  const byName = {};
  list.forEach(f => { byName[f.name] = f; });
  const missing = bare.filter(p => !byName[p.split("/").pop()]);
  ok(missing.length === 0, "清单每条路径在远端都有对应文件", missing.join(","));
  const noStale = !list.some(f => /^CS-0[123]\.jpg$/.test(f.name));
  ok(noStale, "远端旧 CS-01~03.jpg 已彻底删除（不会 404 但仍被引用）");
  const pngFiles = list.filter(f => /\.png$/i.test(f.name));
  const jpgFiles = list.filter(f => /\.jpe?g$/i.test(f.name));
  // 混排能力由本地 gallery_multiformat_test 的构造目录覆盖；
  // 这里只断言远端图片总数与清单条数对得上（用户可能全 PNG 也可能混放）
  ok(pngFiles.length + jpgFiles.length >= keys.length,
    "远端图片数与清单对得上（jpg/png 混放均可）",
    pngFiles.length + " PNG + " + jpgFiles.length + " JPG / 清单 " + keys.length);

  // 3. 图片真实字节：PNG 头是 89504e47，JPEG 头是 ffd8ff + 标记字节，尺寸正常
  let pngOk = 0, jpgOk = 0, badBytes = [];
  for (const f of list.filter(f => /\.(png|jpe?g)$/i.test(f.name))) {
    const blob = await api("/git/blobs/" + f.sha);
    const buf = Buffer.from(blob.content, "base64");
    const isPng = f.name.endsWith(".png");
    // JPEG：ffd8ff 后跟一个标记字节（db/ee/c0…），只比前 3 字节
    const good = isPng
      ? buf.slice(0, 4).toString("hex") === "89504e47"
      : buf.slice(0, 3).toString("hex") === "ffd8ff";
    if (!good) badBytes.push(f.name + "=" + buf.slice(0, 4).toString("hex"));
    else if (isPng) pngOk++; else jpgOk++;
    if (buf.length !== f.size) badBytes.push(f.name + " 长度不符");
  }
  ok(badBytes.length === 0, "远端图片字节头正确且完整（无截断/无损坏）",
    (pngOk + jpgOk) + " 张，" + badBytes.join(","));
  ok(pngOk + jpgOk === keys.length, "远端图片数与清单条数一致",
    "png " + pngOk + " jpg " + jpgOk + " / 清单 " + keys.length);

  // 4. PNG 尺寸：长边 ≥ 1200（压缩规则是「宽 1200」，横图 1200×800、竖图 1024×1536 都正常；
  //    withoutEnlargement 不会把小图放大——别拿某一边的下限一刀切）
  const tooSmall = [];
  for (const f of pngFiles) {
    const blob = await api("/git/blobs/" + f.sha);
    const buf = Buffer.from(blob.content, "base64");
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (Math.max(w, h) < 1200) tooSmall.push(f.name + "=" + w + "x" + h);
  }
  ok(tooSmall.length === 0, "PNG 长边均 ≥ 1200px（压缩没把图压坏）", tooSmall.join(","));

  // 5. 界面文案不再写死 .jpg
  const idx = await api("/contents/index.html?ref=main");
  const html = Buffer.from(idx.content, "base64").toString("utf8");
  ok(html.indexOf("&lt;卡号&gt;.jpg") !== -1 && html.indexOf(".png") !== -1,
    "线上 index.html 放图提示同时列出 jpg 与 png");
  // 5b. 缓存破坏在位：四个 JS + favicon/logo 必须带 ?v=，且与 window.ASSET_VER 一致。
  //     不带的后果：内容换了 URL 不变，浏览器与 Pages CDN 一直发旧字节——
  //     「本地更新了线上就是不换」的第二轮根因（2026-10-24 修，勿回退）。
  const avM = html.match(/window\.ASSET_VER\s*=\s*"([^"]*)"/);
  const av = avM ? avM[1] : "";
  ok(!!av, "线上 index.html 带 window.ASSET_VER 版本号", av || "（缺失）");
  const resRefs = html.match(/(?:src|href|data-logo)="(assets\/[\w.-]+\.(?:js|png|svg))"/g) || [];
  const noVer = resRefs.filter(r => r.indexOf("?v=") === -1);
  const wrongVer = resRefs.filter(r => r.indexOf("?v=" + av) === -1 && r.indexOf("?v=") !== -1);
  ok(resRefs.length >= 13 && noVer.length === 0 && wrongVer.length === 0,
    "线上资源引用全部带正确版本号（缓存破坏）",
    resRefs.length + " 个引用，缺版本 " + noVer.length + "，版本不符 " + wrongVer.length +
    (noVer.concat(wrongVer).length ? "：" + noVer.concat(wrongVer).join(" ") : ""));
  const app = await api("/contents/assets/app.js?ref=main");
  const appTxt = Buffer.from(app.content, "base64").toString("utf8");
  ok(appTxt.indexOf(".jpg / .png") !== -1, "线上 app.js 待配图提示已格式无关");
  ok(appTxt.indexOf('split("?")[0]') !== -1, "线上 app.js 复制文件名会剥掉 ?v= 参数");

  // 6. 同步脚本在线上是最新版（含多格式归组逻辑）
  const gs = await api("/contents/tools/gallery_sync.js?ref=main");
  const gsTxt = Buffer.from(gs.content, "base64").toString("utf8");
  ok(gsTxt.indexOf("scanDir") !== -1 && gsTxt.indexOf("IMAGE_EXT") !== -1,
    "线上 gallery_sync.js 已是多格式版本");
  const t = await api("/contents/tools/gallery_multiformat_test.js?ref=main");
  ok(!!t.sha, "线上已含多格式专项测试文件");

  // 6b. README 画廊段与缩略图：嵌入标记在、引用的缩略图在远端存在
  const rm = await api("/contents/README.md?ref=main");
  const rmTxt = Buffer.from(rm.content, "base64").toString("utf8");
  const inBlock = rmTxt.indexOf("GALLERY-EMBED:START") !== -1 &&
    rmTxt.indexOf("GALLERY-EMBED:END") !== -1;
  ok(inBlock, "README 含 GALLERY-EMBED 嵌入段");
  const thumbRefs = (rmTxt.match(/assets\/gallery-thumbs\/[\w.-]+\.jpg/g) || []);
  // 张数与线上清单条数对齐（用户在不断填预留位，不写死具体数字）
  ok(thumbRefs.length === keys.length, "README 画廊段引用缩略图数与清单一致",
    String(thumbRefs.length) + " / " + keys.length);
  const tl = await api("/contents/assets/gallery-thumbs/?ref=main");
  const thumbNames = new Set(tl.map(f => f.name));
  const thumbMiss = thumbRefs.map(p => p.split("/").pop()).filter(n => !thumbNames.has(n));
  ok(thumbMiss.length === 0, "README 引用的缩略图在远端全部存在", thumbMiss.join(","));

  // 7. Pages 构建状态
  const pb = await api("/pages/builds/latest");
  ok(pb.status === "built", "Pages 构建完成", pb.status + " @ " + (pb.commit || "").slice(0, 7));

  console.log("\n线上产物验收：通过 " + pass + " / 失败 " + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
