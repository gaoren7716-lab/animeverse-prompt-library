#!/usr/bin/env node
/* 线上产物验收（GitHub API 通道）
 *
 * 为什么不用 playwright 访问 Pages：github.io 域名在本机 Chrome 的网络栈里连不上
 * （page.goto 超时），而 node fetch / GitHub API 走的是另一条路，畅通。
 * Pages 的构建产物就是仓库 main 分支的内容（静态直出），所以用 API 核对
 * 远端仓库字节 == 验线上效果，且比截图更严格（看的是真实发布的文件）。
 *
 * 用法：node tools/verify_live_api.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = process.env.AV_REPO || "gaoren7716-lab/animeverse-prompt-library";
const TOKEN = fs.readFileSync(path.join(process.env.TEMP || "/tmp", "gh_tok.txt"), "utf8").trim();
const H = { Authorization: "token " + TOKEN, Accept: "application/vnd.github+json", "User-Agent": "av-verify" };

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
  // 1. 线上清单：png 与 jpg 都有，且扩展名与远端真实文件一致
  const mf = await api("/contents/assets/gallery-imgs.js?ref=main");
  const txt = Buffer.from(mf.content, "base64").toString("utf8");
  const m = txt.match(/window\.GALLERY_IMGS\s*=\s*(\{[\s\S]*?\});/);
  const imgs = m ? JSON.parse(m[1]) : {};
  const keys = Object.keys(imgs);
  ok(keys.length === 10, "线上清单 10 条", String(keys.length));
  const paths = keys.map(k => imgs[k]);
  ok(paths.some(p => /\.png$/i.test(p)), "线上清单含 png 路径", paths.filter(p => /\.png$/i.test(p)).join(","));
  ok(paths.some(p => /\.jpe?g$/i.test(p)), "线上清单含 jpg 路径", paths.filter(p => /\.jpe?g$/i.test(p)).join(","));
  ok(!/CS-0[123]\.jpg/i.test(txt), "线上清单已不引用旧的 CS-0x.jpg");

  // 2. 远端 gallery/ 目录：文件真实存在、格式与清单对得上、旧文件已删
  const list = await api("/contents/gallery/?ref=main");
  const byName = {};
  list.forEach(f => { byName[f.name] = f; });
  const missing = paths.filter(p => !byName[p.split("/").pop()]);
  ok(missing.length === 0, "清单每条路径在远端都有对应文件", missing.join(","));
  const noStale = !list.some(f => /^CS-0[123]\.jpg$/.test(f.name));
  ok(noStale, "远端旧 CS-01~03.jpg 已彻底删除（不会 404 但仍被引用）");
  const pngFiles = list.filter(f => /\.png$/i.test(f.name));
  const jpgFiles = list.filter(f => /\.jpe?g$/i.test(f.name));
  ok(pngFiles.length === 3 && jpgFiles.length === 7, "远端 3 PNG + 7 JPG 混排", pngFiles.length + "+" + jpgFiles.length);

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
  ok(badBytes.length === 0, "10 张图远端字节头正确且完整（无截断/无损坏）", badBytes.join(","));
  ok(pngOk === 3 && jpgOk === 7, "PNG 头 89504e47 / JPG 头 ffd8ff 全部正确", "png " + pngOk + " jpg " + jpgOk);

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
  const app = await api("/contents/assets/app.js?ref=main");
  const appTxt = Buffer.from(app.content, "base64").toString("utf8");
  ok(appTxt.indexOf(".jpg / .png") !== -1, "线上 app.js 待配图提示已格式无关");

  // 6. 同步脚本在线上是最新版（含多格式归组逻辑）
  const gs = await api("/contents/tools/gallery_sync.js?ref=main");
  const gsTxt = Buffer.from(gs.content, "base64").toString("utf8");
  ok(gsTxt.indexOf("scanDir") !== -1 && gsTxt.indexOf("IMAGE_EXT") !== -1,
    "线上 gallery_sync.js 已是多格式版本");
  const t = await api("/contents/tools/gallery_multiformat_test.js?ref=main");
  ok(!!t.sha, "线上已含多格式专项测试文件");

  // 7. Pages 构建状态
  const pb = await api("/pages/builds/latest");
  ok(pb.status === "built", "Pages 构建完成", pb.status + " @ " + (pb.commit || "").slice(0, 7));

  console.log("\n线上产物验收：通过 " + pass + " / 失败 " + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
