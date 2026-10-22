#!/usr/bin/env node
/* 界面冒烟（jsdom）：十页渲染 + 视图显隐 + CSS 绊线 + 系列构建 + 算子 + 抽卡 + 抽屉。
 * 跑法：NODE_PATH=<jsdom 所在 workspace/node_modules> node tools/smoke-web.js
 * CSS 绊线：布局类（grid/row/ops/wrap…）不得与 .view 同元素——否则同特异性下
 * 布局类的 display 会覆盖 .view 的关闭态，七页全泄露（2026-10-14 电商库事故形态）。 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const bundle = fs.readFileSync(path.join(ROOT, "assets", "data-bundle.js"), "utf8");
const engine = fs.readFileSync(path.join(ROOT, "assets", "engine.js"), "utf8");
const gallery = fs.readFileSync(path.join(ROOT, "assets", "gallery-imgs.js"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");

// 四个外链脚本内联进同一份 HTML（jsdom 不起本地服务器，file:// 下无 localStorage 也无需）
// 注意：替换串必须用函数返回——字符串替换会把 app.js 里的 $$ 塌成 $（$$ 在替换串里是转义序列）
const inlined = html
  .replace('<script src="assets/data-bundle.js"></script>', function () { return "<script>\n" + bundle + "\n</script>"; })
  .replace('<script src="assets/engine.js"></script>', function () { return "<script>\n" + engine + "\n</script>"; })
  .replace('<script src="assets/gallery-imgs.js"></script>', function () { return "<script>\n" + gallery + "\n</script>"; })
  .replace('<script src="assets/app.js"></script>', function () { return "<script>\n" + app + "\n</script>"; });
if (inlined.indexOf("assets/app.js") !== -1) {
  console.log("✗ 脚本内联失败：index.html 里仍有外链 script");
  process.exit(1);
}
if (inlined.indexOf("function $$") === -1) {
  console.log("✗ 内联自检失败：app.js 的 $$ 被替换串塌成了 $（必须用函数式 replace）");
  process.exit(1);
}

const dom = new JSDOM(inlined, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://localhost/animeverse/",
});
const { window } = dom;
const { document } = window;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; console.log("✗ " + name + (extra ? " | " + extra : "")); }
}
function $(id) { return document.getElementById(id); }
function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
function click(el) { el.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true })); }

window.addEventListener("load", function () {
  setTimeout(run, 50);
});

function run() {
  try {
    /* 1. 十一页骨架 */
    var views = ["v-gallery", "v-atlas", "v-custom", "v-series", "v-script", "v-synth", "v-gacha", "v-cases", "v-entries", "v-pairs", "v-frame"];
    ok($$("#nav button").length === 11, "导航 11 个按钮");
    // 导航顺序（前 5 位是用户指定的频次顺序，改动会被这条断言挡住）
    var navOrder = $$("#nav button").map(function (b) { return b.getAttribute("data-v"); });
    ok(navOrder.slice(0, 5).join(",") === "v-gallery,v-custom,v-gacha,v-series,v-script",
      "导航顺序：画廊/自定义/抽卡/系列/短剧", navOrder.slice(0, 5).join(","));
    ok(navOrder.indexOf("v-synth") < navOrder.indexOf("v-atlas"),
      "导航顺序：提示词合成器在全球地图之前", navOrder.join(","));
    ok(navOrder.length === 11, "导航共 11 项", String(navOrder.length));
    views.forEach(function (v) { ok(!!$(v), "视图存在：" + v); });

    /* 2. 视图显隐（CSS 级：computed display） */
    ok(window.getComputedStyle($("v-gallery")).display === "block", "画廊默认显示");
    views.slice(1).forEach(function (v) {
      ok(window.getComputedStyle($(v)).display === "none", "默认隐藏：" + v);
    });
    $$("#nav button").forEach(function (b) {
      if (b.getAttribute("data-v") === "v-series") click(b);
    });
    ok($("v-series").classList.contains("on") && window.getComputedStyle($("v-series")).display === "block", "切到系列页显示");
    ok(!$("v-gallery").classList.contains("on") && window.getComputedStyle($("v-gallery")).display === "none", "画廊随之隐藏");

    /* 3. CSS 绊线（源文本 + DOM 双重） */
    ok(/\.view\{display:none\}/.test(html), "绊线：.view 关闭态存在");
    ok(/\.view\.on\{display:block\}/.test(html), "绊线：.view.on 开启态存在");
    var LAYOUT = ["grid", "row", "ops", "wrap", "dimgroup", "outbox", "ser-wrap"];
    var badEl = $$(".view").filter(function (el) {
      return LAYOUT.some(function (c) { return el.classList.contains(c); });
    });
    ok(badEl.length === 0, "绊线：无 .view 元素挂布局类", badEl.map(function (e) { return e.className; }).join("|"));
    var cssLines = html.split("\n").filter(function (ln) {
      return /\.view[^{}]*\{[^}]*display\s*:/.test(ln) && !/\.view\{display:none\}|\.view\.on\{display:block\}/.test(ln);
    });
    ok(cssLines.length === 0, "绊线：无第三方 .view display 规则", cssLines.join("|"));

    /* 4. 画廊 / 地图 / 词条 / 搭配 / 案例 渲染 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-gallery"; })[0]);
    ok($$("#gGrid .gcard").length === 50, "画廊 50 个位置", String($$("#gGrid .gcard").length));
    ok($$("#gGrid .gcard img").length === 10, "画廊 10 张已配图", String($$("#gGrid .gcard img").length));
    ok($$("#gGrid .gcard .colorcard").length === 40, "画廊 40 个待配图占位", String($$("#gGrid .gcard .colorcard").length));
    ok($("gCount").textContent.indexOf("已配图 10") !== -1, "画廊计数显示已配图 10", $("gCount").textContent);
    // 图幅切换：大图 → 小图（网格类名变化，卡片数量不变）
    var gGrid = $("gGrid");
    ok(gGrid.className.indexOf("gs-sm") === -1, "画廊默认大图", gGrid.className);
    click($$("[data-gs]").filter(function (b) { return b.getAttribute("data-gs") === "sm"; })[0]);
    ok(gGrid.className.indexOf("gs-sm") !== -1, "画廊切小图加 gs-sm 类", gGrid.className);
    ok($$("#gGrid .gcard").length === 50, "小图下仍是 50 张", String($$("#gGrid .gcard").length));
    click($$("[data-gs]").filter(function (b) { return b.getAttribute("data-gs") === "lg"; })[0]);
    ok(gGrid.className.indexOf("gs-sm") === -1, "画廊切回大图", gGrid.className);
    ok($$("#gGrid .gcard img")[0].getAttribute("src").indexOf("gallery/CS-") === 0, "配图 src 指向 gallery/ 目录");
    ok(typeof window.GALLERY_IMGS === "object" && Object.keys(window.GALLERY_IMGS).length === 10, "GALLERY_IMGS 清单 10 条");
    // 预留位必须自带配方：点开详情能看到词面与验证点
    var glCard = $$("#gGrid .gcard").filter(function (c) { return c.getAttribute("data-cs") === "GL-23"; })[0];
    ok(!!glCard, "画廊含 GL-23 预留位");
    if (glCard) {
      click(glCard.querySelector('[data-act="detail"]'));
      ok($("dtBody").innerHTML.indexOf("提示词") !== -1 && $("dtBody").innerHTML.indexOf("验证点") !== -1, "预留位详情含词面与验证点");
      click($("dtClose"));
    }
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-atlas"; })[0]);
    ok($$("#rgGrid .card").length === 18, "全球地图 18 个地区");
    ok($$("#entGrid .card").length === 28, "实体 28 张");
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-entries"; })[0]);
    ok($$("#enGrid .card").length === 150, "词条 150 张", String($$("#enGrid .card").length));
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-pairs"; })[0]);
    ok($$("#plGrid .card").length === 16, "配色卡 16 张");
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-cases"; })[0]);
    ok($$("#csGrid .card").length === 10, "案例页 10 张");
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-frame"; })[0]);
    ok($$("#stCards .card").length === 8, "体检卡 8 张");
    ok($$("#dimTb tr").length === 12, "维度表 11 行 + 表头");

    /* 5. 系列出图 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-series"; })[0]);
    $("serTheme").value = "TH-05";
    click($("doSeries"));
    var serCards = $$("#seriesOut .sercard");
    ok(serCards.length === 4, "系列默认 4 张", String(serCards.length));
    ok(serCards.every(function (c) { return c.querySelector("pre").textContent.indexOf("theme: martial arts tournament") !== -1; }), "系列每张注入主题词");
    ok(serCards.every(function (c) { return c.querySelector("h4").textContent.indexOf("武道大会") !== -1; }), "系列标题带主题");
    // 全组统一：六张预赛同风格（从 pill 文本看风格位）
    var stylePills = serCards.map(function (c) {
      var pills = c.querySelectorAll(".pill");
      for (var i = 0; i < pills.length; i++) if (pills[i].textContent.indexOf("视觉风格") === 0) return pills[i].textContent;
      return "";
    });
    ok(stylePills.every(function (s) { return s === stylePills[0] && s.indexOf("赛璐璐") !== -1; }), "系列全组统一风格（TH-05→赛璐璐平涂）", stylePills.join("|"));
    // 张数切换 3/6
    click($$(".sercnt").filter(function (b) { return b.getAttribute("data-n") === "6"; })[0]);
    ok($$("#seriesOut .sercard").length === 6, "系列切 6 张");
    click($$(".sercnt").filter(function (b) { return b.getAttribute("data-n") === "3"; })[0]);
    ok($$("#seriesOut .sercard").length === 3, "系列切 3 张");
    // 未知主题
    $("serTheme").value = "雨天便利店";
    click($("doSeries"));
    ok($$("#seriesOut .sercard").length === 3 && $$("#seriesOut .sercard")[0].querySelector("pre").textContent.indexOf("theme: 雨天便利店") !== -1, "未知主题原文注入");
    // 换一批不炸
    click($("serReroll"));
    ok($$("#seriesOut .sercard").length === 3, "换一批后仍是 3 张");
    // 一键复制不抛错（jsdom 无剪贴板，走兜底）
    var threw = false;
    try { click($("serAll")); } catch (e) { threw = true; }
    ok(!threw, "一键复制不抛异常");
    // 关键词锁定 + 加入主题
    $("serTheme").value = "雨夜信";
    $("serKw").value = "赛博朋克, 霓虹";
    click($("doSeries"));
    var kwPills = $$("#seriesOut .sercard")[0].querySelectorAll(".pill");
    var kwText = Array.prototype.map.call(kwPills, function (p) { return p.textContent; }).join("|");
    ok(kwText.indexOf("赛博朋克") !== -1, "系列关键词锁定题材（赛博朋克）", kwText.slice(0, 120));
    ok(kwText.indexOf("霓虹都市") !== -1 || kwText.indexOf("霓虹夜光") !== -1, "系列关键词锁定场景/光影（霓虹）");
    $("serTheme").value = "我的短剧主题";
    $("serKw").value = "竹林";
    click($("serSave"));
    ok($$("#myChips [data-mt]").length >= 1, "加入主题后我的主题出现条目");

    /* 5b. 短剧分镜：文案 → 一套分镜 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-script"; })[0]);
    ok(window.getComputedStyle($("v-script")).display === "block", "短剧分镜页可切换");
    $("scTheme").value = "雨夜信";
    $("scKw").value = "赛博朋克, 霓虹";
    $("scText").value = "雨夜的霓虹都市，少年主角站在便利店门口。\n\n他抬起头，远处传来爆炸声。\n\n神秘面具客从阴影里走出。";
    click($("scGo"));
    var scCards = $$("#scOut .sercard");
    ok(scCards.length === 3, "短剧按段拆出 3 张", String(scCards.length));
    ok(scCards[0].querySelector(".job").textContent.indexOf("便利店") !== -1, "分镜卡带原文段落");
    ok(scCards[0].querySelector("pre").textContent.indexOf("no watermark") !== -1, "分镜词面含硬约束");
    var scActs = scCards.map(function (c) { return c.querySelector(".role").textContent; });
    ok(scActs[0] === "建立镜头" && scActs[2] === "收尾留白", "分镜按叙事顺序分幕", scActs.join("→"));
    // 段落继承：第 2 段没提角色 → 沿用第 1 段的少年主角
    var scPills = scCards.map(function (c) {
      return Array.prototype.map.call(c.querySelectorAll(".pill"), function (p) { return p.textContent; }).join("|");
    });
    var ch1 = (scPills[0].match(/角色原型·[^|]*/) || [""])[0];
    var ch2 = (scPills[1].match(/角色原型·[^|]*/) || [""])[0];
    ok(ch1 && ch1 === ch2, "分镜角色跨段继承", ch1 + " / " + ch2);
    // 按句拆
    $("scMode").value = "sent";
    $("scText").value = "他抬起头。远处传来爆炸声。神秘面具客走出。";
    click($("scGo"));
    ok($$("#scOut .sercard").length === 3, "短剧按句拆出 3 张");
    // 换一批不炸
    var scThrew = false;
    try { click($("scReroll")); } catch (e) { scThrew = true; }
    ok(!scThrew && $$("#scOut .sercard").length === 3, "短剧换一批不炸且张数不变");
    // 短剧抽卡：没想法就抽一部（骨架 + 角色/场景自动填 → 直接出分镜）
    $("scText").value = "";
    click($("scRand"));
    var scRandText = $("scText").value;
    ok(scRandText.length > 60, "短剧抽卡生成文案", String(scRandText.length) + " 字");
    ok(scRandText.indexOf("{") === -1, "短剧抽卡文案无未替换占位符", scRandText.slice(0, 60));
    ok(scRandText.split("\n\n").length >= 3, "短剧抽卡文案按段分行", String(scRandText.split("\n\n").length));
    ok($$("#scOut .sercard").length >= 3, "短剧抽卡直接出分镜", String($$("#scOut .sercard").length));
    ok($("scTheme").value.length > 0, "短剧抽卡填入主题");
    // 抽卡文案里的角色名能被匹配器识别（维度锁定）
    var scRandPills = $$("#scOut .sercard").map(function (c) {
      return Array.prototype.map.call(c.querySelectorAll(".pill"), function (p) { return p.textContent; }).join("|");
    });
    ok(scRandPills.some(function (t) { return /角色原型·/.test(t); }), "短剧抽卡文案锁住角色维度", scRandPills[0].slice(0, 100));
    // 换一批：同一份文案换配套，不炸
    var scRandThrew = false;
    try { click($("scReroll")); } catch (e) { scRandThrew = true; }
    ok(!scRandThrew && $$("#scOut .sercard").length >= 3, "短剧抽卡后换一批不炸");
    // 自定义出图：自由组合 + 关键词
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-custom"; })[0]);
    $("ezPreset").value = "free";
    $("ezKw").value = "机甲, 竹林";
    $("ezTheme").value = "机甲少女的竹林";
    click($("ezGo"));
    var ezTxt = $("ezOut").textContent;
    ok(ezTxt.indexOf("关键词锁定") !== -1, "自由组合显示关键词锁定结果", ezTxt.slice(0, 100));
    ok(ezTxt.indexOf("机甲") !== -1, "自由组合锁定机甲题材");

    /* 6. 合成器：点 chip 出词 / 冲突警告 / 算子 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-synth"; })[0]);
    var chipSZ04 = $$("#synDims .chip").filter(function (c) { return c.getAttribute("data-id") === "SZ-04"; })[0];
    var chipLO08 = $$("#synDims .chip").filter(function (c) { return c.getAttribute("data-id") === "LO-08"; })[0];
    click(chipSZ04); click(chipLO08);
    // 注意：$() 只吃裸 id；CSS 选择器一律走 $$()（renderSynth 每次点击会重建 chips  DOM，
    // 旧引用虽然脱离文档，但 chip 自带 listener，点击依然生效——这是页面设计不是 bug）
    ok($$("#synOut .warn").length > 0, "合成器冲突警告显示（CF-01）");
    ok($("synPrompt").textContent.indexOf("no watermark") !== -1, "合成器输出含硬约束");
    // 随机 + 算子
    click($("synRandom"));
    var p1 = $("synPrompt").textContent;
    var opBtn = $$("#opBar .opbtn")[1]; // style-flip
    click(opBtn);
    var p2 = $("synPrompt").textContent;
    ok(p1 !== p2, "算子 style-flip 改变词面");
    ok($("opInfo").textContent.indexOf("保持") !== -1 && $("opInfo").textContent.indexOf("改写") !== -1, "算子元数据展示 preserve/change");
    // 主题注入
    $("synTheme").value = "rain-soaked alley";
    $("synTheme").dispatchEvent(new window.Event("input", { bubbles: true }));
    ok($("synPrompt").textContent.indexOf("theme: rain-soaked alley") !== -1, "合成器主题注入");
    // 分享码
    click($("synShare"));
    var shareInput = $$("#synShareBox input")[0];
    ok(shareInput !== null && shareInput.value.indexOf("AVX1.") === 0, "分享码生成");

    /* 7. 抽卡 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-gacha"; })[0]);
    ok($$("#gcGrid .card").length === 4, "抽卡默认 4 张");
    click($("gc8"));
    ok($$("#gcGrid .card").length === 8, "抽卡切 8 张");
    click($("gcRand"));
    ok($$("#gcGrid .card").length === 1, "随机来一张出 1 张");
    ok($("gcGrid").innerHTML.indexOf("复制提示词") !== -1 && $("gcGrid").innerHTML.indexOf("再来一张") !== -1, "随机一张含复制与再来");
    ok($("gcGrid").innerHTML.indexOf("no watermark") !== -1, "随机一张含硬约束词面");
    click($("gcRAgain"));
    ok($$("#gcGrid .card").length === 1, "再来一张仍 1 张");

    /* 8. 自定义出图 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-custom"; })[0]);
    ok($$("#preGrid .card").length === 12, "预设 12 张");
    click($$("#preGrid .card")[0]);
    var ezPrompt = $$("#ezOut .prompt")[0];
    ok(ezPrompt !== null && ezPrompt.textContent.length > 50, "预设点击出词");

    /* 9. 词条抽屉 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-entries"; })[0]);
    var enCard = $$("#enGrid .card")[0];
    click(enCard.querySelector("h4"));
    ok($("dtPanel").classList.contains("on"), "词条详情抽屉打开");
    click($("dtClose"));
    ok(!$("dtPanel").classList.contains("on"), "抽屉关闭");

    /* 10. 画廊复制按钮不抛错 */
    click($$("#nav button").filter(function (b) { return b.getAttribute("data-v") === "v-gallery"; })[0]);
    threw = false;
    try { click($$("#gGrid .gcard .cp")[0]); } catch (e) { threw = true; }
    ok(!threw, "画廊复制按钮不抛异常");
    ok($("toast").classList.contains("on"), "复制反馈 toast 出现");

    /* 11. 品牌 LOGO 独立资产 + 导航放大 + 抽卡按钮顺序 + 复制按钮配色 */
    ok($$("#side .logo img").length === 1, "导航栏带独立 LOGO 图片");
    ok(($$("#side .logo img")[0].getAttribute("src") || "").indexOf("assets/logo") !== -1, "LOGO 指向 assets/logo", $$("#side .logo img")[0].getAttribute("src"));
    ok($$("#v-frame [data-logo]").length === 2, "框架页提供 2 个 LOGO 复制入口");
    // 抽卡按钮顺序：抽1张 → 抽4张 → 抽8张 → 随机来一张（用户指定顺序）
    var gcOrder = ["gc1", "gc4", "gc8", "gcRand"].map(function (id) { return !!$(id); });
    ok(gcOrder.every(Boolean), "抽卡四个按钮都在");
    var gcBtns = $$("#v-gacha .row button").slice(0, 4).map(function (b) { return b.id; });
    ok(gcBtns.join(",") === "gc1,gc4,gc8,gcRand", "抽卡按钮顺序：1张/4张/8张/随机", gcBtns.join(","));
    // 所有「复制提示词」类按钮必须是 .cp（青蓝高亮），不能是灰底 .btn
    var copyBtns = $$("#v-gallery .cp, #v-cases .cp, #v-entries .cp, #v-synth .cp, #v-gacha .cp, #v-series .cp, #v-script .cp, #v-custom .cp");
    ok(copyBtns.length >= 8, "复制按钮统一为 .cp 高亮样式", String(copyBtns.length));
    var grayCopy = $$("button.btn.sm").filter(function (b) { return /复制/.test(b.textContent); });
    ok(grayCopy.length === 0, "无灰底复制按钮残留", grayCopy.map(function (b) { return b.textContent; }).join("|"));
    // 选取框尺寸：输入框/下拉 min-height ≥ 50px
    var inputH = window.getComputedStyle($("entSearch")).minHeight;
    ok(parseFloat(inputH) >= 50, "输入框 min-height ≥ 50px", inputH);
    // 导航栏高度 ≥ 70px
    var sideH = window.getComputedStyle($("side")).height;
    ok(parseFloat(sideH) >= 70, "导航栏高度 ≥ 70px", sideH);

    console.log("\nsmoke-web 结果：通过 " + pass + " / 失败 " + fail);
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.log("✗ 运行异常：" + (e && e.stack || e));
    process.exit(1);
  }
}
