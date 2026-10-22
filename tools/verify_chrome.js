/* 真实 Chrome 验证：LOGO 加载 / 导航放大 / 抽卡按钮顺序 / 复制按钮配色 / 控件尺寸
 * 必须走 file:// URL（本机 localhost http 被坏代理拦死）
 *
 * 跑法：NODE_PATH=<workspace>/node_modules node tools/verify_chrome.js
 * Chrome 路径按 CHROME_PATH 环境变量 → 常见安装位置探测 → playwright 自带 chromium 依次尝试。
 * 没找到会打印候选列表并退出（不静默跳过）。 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const URL = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");

// Chrome 可执行文件候选：环境变量优先，其次各平台常见安装位置
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  // Windows
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* ignore */ }
  }
  return null;
}

let pass = 0, fail = 0;
function ok(c, name, extra) {
  if (c) { pass++; console.log("✓ " + name); }
  else { fail++; console.log("✗ " + name + (extra ? " | " + extra : "")); }
}

(async function () {
  const chrome = findChrome();
  if (!chrome) {
    console.error("✗ 找不到 Chrome 可执行文件，无法跑真实浏览器验证。");
    console.error("  已探测：" + CHROME_CANDIDATES.join("\n            "));
    console.error("  请安装 Chrome，或用环境变量指定：CHROME_PATH=/path/to/chrome");
    process.exit(1);
  }
  console.log("Chrome: " + chrome);
  const browser = await chromium.launch({ executablePath: chrome, args: ["--no-proxy-server", "--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(900);

  // 1. LOGO 真的加载出来了（naturalWidth > 0）
  const logo = await page.evaluate(() => {
    var img = document.querySelector("#side .logo img");
    if (!img) return null;
    var r = img.getBoundingClientRect();
    return { src: img.getAttribute("src"), nw: img.naturalWidth, w: Math.round(r.width), h: Math.round(r.height) };
  });
  ok(logo !== null, "导航栏存在 LOGO 图片");
  ok(logo && logo.nw > 0, "LOGO SVG 实际加载成功（naturalWidth>0）", JSON.stringify(logo));
  ok(logo && logo.w >= 40 && logo.h >= 40, "LOGO 显示尺寸 ≥ 40px", JSON.stringify(logo));

  // 2. 导航栏放大
  const side = await page.evaluate(() => {
    var s = document.getElementById("side");
    var cs = getComputedStyle(s);
    var b = document.querySelector("#nav button");
    var bs = getComputedStyle(b);
    return { h: s.getBoundingClientRect().height, fs: bs.fontSize, pad: bs.padding };
  });
  ok(side.h >= 70, "导航栏高度 ≥ 70px", side.h + "px");
  ok(parseFloat(side.fs) >= 15, "导航按钮字号 ≥ 15px", side.fs);

  // 3. 抽卡按钮顺序
  await page.click('button[data-v="v-gacha"]');
  await page.waitForTimeout(200);
  const gc = await page.evaluate(() => Array.prototype.map.call(
    document.querySelectorAll("#v-gacha .row button"), function (b) { return b.id; }
  ).filter(Boolean).slice(0, 4));
  ok(gc.join(",") === "gc1,gc4,gc8,gcRand", "抽卡顺序：抽1张/抽4张/抽8张/随机来一张", gc.join(","));

  // 4. 复制按钮突出色（青蓝渐变），生成按钮是品牌粉紫
  const colors = await page.evaluate(() => {
    function bg(sel) {
      var el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundImage : "";
    }
    return {
      gc1: bg("#gc1"),
      gcRand: bg("#gcRand"),
      gcopy: bg("#gGrid .gcard .cp"),
    };
  });
  ok(colors.gcopy.indexOf("gradient") !== -1, "复制按钮为渐变高亮", colors.gcopy.slice(0, 80));
  ok(colors.gc1.indexOf("gradient") === -1, "普通按钮非渐变（对比基线）", colors.gc1.slice(0, 60));

  // 5. 选取框放大（input/select/textarea 实际渲染高度）
  // 注意：display:none 的视图里 getBoundingClientRect 恒为 0，必须先切到对应页再量
  await page.click('button[data-v="v-entries"]');
  await page.waitForTimeout(250);
  const entInput = await page.evaluate(() => {
    var e = document.getElementById("enSearch");
    return e ? Math.round(e.getBoundingClientRect().height) : 0;
  });
  ok(entInput >= 48, "输入框渲染高度 ≥ 48px", entInput + "px");

  await page.click('button[data-v="v-custom"]');
  await page.waitForTimeout(250);
  const selH = await page.evaluate(() => {
    var e = document.querySelector("#ezPreset");
    return e ? Math.round(e.getBoundingClientRect().height) : 0;
  });
  ok(selH >= 48, "下拉框渲染高度 ≥ 48px", selH + "px");

  await page.click('button[data-v="v-script"]');
  await page.waitForTimeout(250);
  const taH = await page.evaluate(() => {
    var e = document.querySelector("#scText");
    return e ? Math.round(e.getBoundingClientRect().height) : 0;
  });
  ok(taH >= 240, "文本域渲染高度 ≥ 240px", taH + "px");

  await page.click('button[data-v="v-synth"]');
  await page.waitForTimeout(250);
  const chipH = await page.evaluate(() => {
    var e = document.querySelector("#synDims .chip");
    return e ? Math.round(e.getBoundingClientRect().height) : 0;
  });
  ok(chipH >= 34, "维度 chip 高度 ≥ 34px", chipH + "px");

  // 6. 框架页品牌标识区
  await page.click('button[data-v="v-frame"]');
  await page.waitForTimeout(300);
  const brand = await page.evaluate(() => {
    var imgs = document.querySelectorAll("#v-frame img");
    return {
      n: imgs.length,
      logoOk: imgs[0] ? imgs[0].naturalWidth > 0 : false,
      lockupOk: imgs[1] ? imgs[1].naturalWidth > 0 : false,
      copyBtns: document.querySelectorAll("#v-frame [data-logo]").length,
    };
  });
  ok(brand.n === 2, "框架页 2 张 LOGO 图", String(brand.n));
  ok(brand.logoOk && brand.lockupOk, "两张 LOGO 都加载成功", JSON.stringify(brand));
  ok(brand.copyBtns === 2, "2 个复制 SVG 入口", String(brand.copyBtns));

  // 7. 视图显隐仍无泄露（真实 Chrome 才查得出 CSS 级联）
  const views = ["v-gallery", "v-atlas", "v-custom", "v-series", "v-script", "v-synth", "v-gacha", "v-cases", "v-entries", "v-pairs", "v-frame"];
  const leak = await page.evaluate((vs) => vs.filter(function (v) {
    return getComputedStyle(document.getElementById(v)).display !== "none";
  }), views);
  ok(leak.length === 1 && leak[0] === "v-frame", "只有当前页可见（无布局类泄露）", leak.join(","));

  // 8. 导航顺序：提示词合成器在全球地图之前
  const navOrder = await page.evaluate(() => Array.prototype.map.call(
    document.querySelectorAll("#nav button"), function (b) { return b.getAttribute("data-v"); }
  ));
  ok(navOrder.indexOf("v-synth") < navOrder.indexOf("v-atlas"),
    "导航顺序：合成器在地图之前", navOrder.join(","));

  // 9. 画廊大小图切换（真实渲染宽度才说明白）
  await page.click('button[data-v="v-gallery"]');
  await page.waitForTimeout(300);
  const wLarge = await page.evaluate(() => {
    var c = document.querySelector("#gGrid .gcard");
    return c ? Math.round(c.getBoundingClientRect().width) : 0;
  });
  await page.click('[data-gs="sm"]');
  await page.waitForTimeout(300);
  const wSmall = await page.evaluate(() => {
    var c = document.querySelector("#gGrid .gcard");
    var g = document.getElementById("gGrid");
    return { w: c ? Math.round(c.getBoundingClientRect().width) : 0, cls: g.className };
  });
  ok(wLarge > 0 && wSmall.w > 0, "画廊两种图幅都渲染出卡片", wLarge + " → " + wSmall.w);
  ok(wSmall.w < wLarge, "小图确实更小", wLarge + " → " + wSmall.w);
  ok(wSmall.cls.indexOf("gs-sm") !== -1, "小图模式挂 gs-sm 类", wSmall.cls);
  const cols = await page.evaluate(() => getComputedStyle(document.getElementById("gGrid")).gridTemplateColumns.split(" ").length);
  ok(cols >= 4, "小图模式列数 ≥ 4", String(cols));
  await page.click('[data-gs="lg"]');
  await page.waitForTimeout(200);

  // 9b. 图片格式自适应：png/jpg 混排都要真的加载出来
  // （jsdom 根本不加载 <img>，路径写错或格式不认都查不出来——必须真实浏览器）
  const imgs = await page.evaluate(() => Array.prototype.map.call(
    document.querySelectorAll("#gGrid .gcard img"),
    function (i) { return { src: i.getAttribute("src"), w: i.naturalWidth, h: i.naturalHeight }; }
  ));
  const broken = imgs.filter(function (i) { return !i.w || !i.h; });
  ok(imgs.length === 10 && broken.length === 0,
    "画廊 10 张图全部真实加载成功（无碎图）",
    imgs.length + " 张，碎图 " + broken.length + (broken.length ? "：" + broken.map(function (b) { return b.src; }).join(",") : ""));
  const srcs = imgs.map(function (i) { return i.src; });
  ok(srcs.some(function (s) { return /\.png$/i.test(s); }) &&
     srcs.some(function (s) { return /\.jpe?g$/i.test(s); }),
    "画廊 png 与 jpg 混排都被浏览器正确渲染",
    srcs.filter(function (s) { return /\.(png|jpe?g)$/i.test(s); }).length + " 张已配图");
  const pngImg = imgs.filter(function (i) { return /\.png$/i.test(i.src); })[0];
  ok(pngImg && pngImg.w >= 1200, "PNG 图真实像素宽度正常（未被压坏）",
    pngImg ? pngImg.w + "x" + pngImg.h : "无 PNG 图");

  // 10. 短剧抽卡（没想法就抽一部）
  await page.click('button[data-v="v-script"]');
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById("scText").value = ""; });
  await page.click("#scRand");
  await page.waitForTimeout(500);
  const sc = await page.evaluate(() => ({
    text: document.getElementById("scText").value,
    theme: document.getElementById("scTheme").value,
    cards: document.querySelectorAll("#scOut .sercard").length,
    roles: Array.prototype.map.call(document.querySelectorAll("#scOut .sercard .role"), function (r) { return r.textContent; }),
  }));
  ok(sc.text.length > 60, "短剧抽卡生成文案", String(sc.text.length) + " 字");
  ok(sc.text.indexOf("{") === -1, "抽卡文案无残留占位符", sc.text.slice(0, 60));
  ok(sc.theme.length > 0, "抽卡填入主题", sc.theme);
  ok(sc.cards === 5, "抽卡直接出 5 张分镜", String(sc.cards));
  ok(sc.roles.join(",") === "建立镜头,角色亮相,冲突推进,高潮,收尾留白",
    "抽卡分镜按五幕叙事顺序", sc.roles.join(","));
  await page.screenshot({ path: path.join(ROOT, ".workbuddy", "shot_script.png") });

  // 截图留证
  await page.click('button[data-v="v-gallery"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ROOT, ".workbuddy", "shot_gallery.png") });
  await page.click('button[data-v="v-gacha"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, ".workbuddy", "shot_gacha.png") });
  await page.click('button[data-v="v-frame"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, ".workbuddy", "shot_frame.png"), fullPage: false });

  await browser.close();
  console.log("\n真实 Chrome 验证：通过 " + pass + " / 失败 " + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log("✗ 运行异常：" + (e && e.stack || e));
  process.exit(1);
});
