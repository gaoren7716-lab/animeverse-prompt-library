/* 动漫宇宙 · 页面逻辑。数据与引擎来自 assets/data-bundle.js 与 assets/engine.js（window.AV_DATA / window.AV）。
 * 本文件不碰布局显隐铁律：视图显隐只走 .view / .view.on，布局类（.grid/.row）只出现在视图内部容器上。 */
(function () {
"use strict";
var AV = window.AV, D = AV.data;

/* ---------- 基础 helpers ---------- */
function $(id) { return document.getElementById(id); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
var toastTimer = null;
function toast(msg) {
  var t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("on"); }, 1800);
}
function copyText(text, done) {
  function fallback() {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("已复制"); } catch (e) { toast("复制失败，请手动选择"); }
    document.body.removeChild(ta);
    if (done) done();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast("已复制"); if (done) done(); }, fallback);
  } else fallback();
}
function dimZh(d) { return D[d].zh; }
function zhOf(d, id) { var it = AV.index[d][id]; return it ? it.zh : id; }
function selChips(sel) {
  return AV.ASM_ORDER.filter(function (d) { return sel[d]; }).map(function (d) {
    return '<span class="pill">' + esc(dimZh(d)) + "·" + esc(zhOf(d, sel[d])) + "</span>";
  }).join("");
}

/* ---------- 视图切换 ---------- */
var CUR = "v-gallery";
function switchView(v) {
  CUR = v;
  $$("#nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === v); });
  $$(".view").forEach(function (el) { el.classList.toggle("on", el.id === v); });
  window.scrollTo(0, 0);
}
$$("#nav button").forEach(function (b) {
  b.addEventListener("click", function () { switchView(b.getAttribute("data-v")); });
});

/* ---------- 详情抽屉 ---------- */
function openDrawer(html) {
  $("dtBody").innerHTML = html;
  $("dtMask").classList.add("on");
  $("dtPanel").classList.add("on");
}
function closeDrawer() {
  $("dtMask").classList.remove("on");
  $("dtPanel").classList.remove("on");
}
$("dtMask").addEventListener("click", closeDrawer);
$("dtClose").addEventListener("click", closeDrawer);
// 抽屉内色块统一走事件委托（innerHTML 会重建，委托挂在 dtBody 上不丢）
$("dtBody").addEventListener("click", function (e) {
  var hex = e.target.getAttribute && e.target.getAttribute("data-hex");
  if (hex) copyText(hex);
});

/* ---------- 画廊 ---------- */
var gFilter = "all";
function galleryImg(id) {
  return (typeof GALLERY_IMGS !== "undefined" && GALLERY_IMGS && GALLERY_IMGS[id]) ? GALLERY_IMGS[id] : null;
}
function galleryHasImg(id) { return !!galleryImg(id); }
function renderGallery() {
  var grid = $("gGrid");
  var cases = D.cases.items;
  var shown = cases.filter(function (cs) {
    if (gFilter === "img") return galleryHasImg(cs.id);
    if (gFilter === "todo") return !galleryHasImg(cs.id);
    return true;
  });
  $("gCount").textContent = "共 " + shown.length + " 张（已配图 " + cases.filter(function (c) { return galleryHasImg(c.id); }).length + "）";
  grid.innerHTML = shown.map(function (cs) {
    var st = AV.index.styles[cs.recipe.style];
    var pal = AV.paletteOf(cs.recipe.style);
    var sw = pal ? pal.swatches.map(function (s) { return s.hex; }) : ["#2c2d55"];
    var swHtml = sw.map(function (h) { return '<i style="background:' + h + '"></i>'; }).join("");
    var img = galleryImg(cs.id);
    var imgHtml = img
      ? '<img src="' + esc(img) + '" alt="' + esc(cs.zh) + '">'
      : '<div class="colorcard"><div class="swrow">' + swHtml + '</div><span class="mut sm">待配图 · ' + esc(st ? st.zh : "") + '</span></div>';
    return '<div class="gcard" data-cs="' + cs.id + '">' +
      '<div class="imgwrap" data-act="detail"><span class="gid" data-act="gid">' + cs.id + '</span>' + imgHtml + "</div>" +
      '<div class="body"><h4>' + esc(cs.zh) + "</h4><div class=\"desc\">" + esc(cs.desc) + "</div></div>" +
      '<div class="acts">' +
      '<button class="gcopy" data-act="copy">复制提示词</button>' +
      '<button class="btn sm" data-act="synth">合成器改用</button>' +
      "</div></div>";
  }).join("");
}
$("gGrid").addEventListener("click", function (e) {
  var card = e.target.closest(".gcard");
  if (!card) return;
  var cs = D.cases.items.filter(function (c) { return c.id === card.getAttribute("data-cs"); })[0];
  if (!cs) return;
  var act = e.target.getAttribute("data-act");
  if (act === "gid") {
    var img = galleryImg(cs.id);
    copyText(img ? img.split("/").pop() : cs.id);
    return;
  }
  if (act === "copy") { copyText(AV.compose(cs.recipe).prompt); return; }
  if (act === "synth") { S.sel = Object.assign({}, cs.recipe); S.theme = ""; renderSynth(); switchView("v-synth"); toast("已载入配方"); return; }
  // 详情
  var r = AV.compose(cs.recipe);
  var pal = AV.paletteOf(cs.recipe.style);
  openDrawer(
    "<h3>" + esc(cs.id) + " · " + esc(cs.zh) + "</h3>" +
    '<p class="mut sm" style="margin:6px 0">' + esc(cs.desc) + "</p>" +
    '<h4 style="margin:12px 0 6px">配方（11 维）</h4><div>' + selChips(r.sel) + "</div>" +
    (pal ? '<h4 style="margin:12px 0 6px">配色（' + esc(pal.styleZh) + "）</h4>" +
      '<div class="swrow" style="display:flex;gap:6px">' + pal.swatches.map(function (s) {
        return '<div style="text-align:center"><div style="width:44px;height:44px;border-radius:8px;background:' + s.hex + ';cursor:pointer" data-hex="' + s.hex + '"></div><div class="mut" style="font-size:10px;margin-top:3px">' + esc(s.name) + "</div></div>";
      }).join("") + "</div>" : "") +
    '<h4 style="margin:12px 0 6px">验证点</h4><p class="sm">' + esc(cs.validates) + "</p>" +
    '<h4 style="margin:12px 0 6px">提示词</h4><pre class="mono sm" style="white-space:pre-wrap;background:var(--bg2);padding:10px;border-radius:8px">' + esc(r.prompt) + "</pre>" +
    '<div class="row" style="margin-top:10px"><button class="gcopy" id="dtCopy">复制提示词</button>' +
    '<button class="btn sm" id="dtSynth">合成器改用</button></div>'
  );
  $("dtCopy").addEventListener("click", function () { copyText(r.prompt); });
  $("dtSynth").addEventListener("click", function () { S.sel = Object.assign({}, cs.recipe); renderSynth(); switchView("v-synth"); closeDrawer(); });
});
$$("[data-gd]").forEach(function (b) {
  b.addEventListener("click", function () {
    $$("[data-gd]").forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    gFilter = b.getAttribute("data-gd");
    renderGallery();
  });
});

/* ---------- 全球地图 ---------- */
var entKind = "all", entQ = "";
function renderRegions() {
  $("rgGrid").innerHTML = D.regions.items.map(function (rg) {
    var ents = D.entities.entities.filter(function (e) { return e.region === rg.id; });
    return '<div class="card" data-rg="' + rg.id + '" style="cursor:pointer">' +
      '<div class="row" style="justify-content:space-between"><span class="cid">' + rg.id + '</span><span class="mut sm">' + ents.length + " 个实体</span></div>" +
      "<h4>" + esc(rg.zh) + "</h4>" +
      '<div class="desc">' + esc(rg.note) + "</div></div>";
  }).join("");
}
$("rgGrid").addEventListener("click", function (e) {
  var card = e.target.closest("[data-rg]");
  if (!card) return;
  var rg = D.regions.items.filter(function (r) { return r.id === card.getAttribute("data-rg"); })[0];
  var ents = D.entities.entities.filter(function (en) { return en.region === rg.id; });
  var rels = D.entities.relations.filter(function (r) {
    return ents.some(function (en) { return en.id === r.from; }) && ents.some(function (en) { return en.id === r.to; });
  });
  openDrawer(
    "<h3>" + esc(rg.id) + " · " + esc(rg.zh) + "</h3>" +
    '<p class="sm" style="margin:8px 0">' + esc(rg.prompt) + "</p>" +
    '<p class="mut sm">' + esc(rg.note) + "</p>" +
    "<h4 style=\"margin:14px 0 8px\">本土壤上的实体（" + ents.length + "）</h4>" +
    ents.map(function (en) {
      return '<div class="card" style="margin-bottom:8px;cursor:pointer" data-ent="' + en.id + '">' +
        '<span class="badge b-kind">' + esc(en.kind) + '</span> <span class="badge b-' + en.rights.toLowerCase() + '">' + en.rights + "</span> " +
        "<b>" + esc(en.zh) + "</b>" + (en.en ? ' <span class="mut sm">' + esc(en.en) + "</span>" : "") +
        '<div class="desc">' + esc(en.desc) + "</div></div>";
    }).join("") +
    (rels.length ? "<h4 style=\"margin:14px 0 8px\">内部关系</h4>" + rels.map(relHtml).join("") : "")
  );
  bindEntCards();
});
function relHtml(r) {
  var a = AV.entityById(r.from), b = AV.entityById(r.to);
  var arrow = { influenced: "← 受影响于", student_of: "← 师承", style_origin: "← 风格源头", rival: "⇄ 对手", successor: "← 继承者" }[r.type] || "—";
  return '<div class="sm" style="padding:6px 0;border-bottom:1px solid var(--line)">' +
    "<b>" + esc(a ? a.zh : r.from) + "</b> " + esc(arrow) + " <b>" + esc(b ? b.zh : r.to) + "</b>" +
    ' <span class="mut">' + esc(r.note) + "</span></div>";
}
function renderEntities() {
  var list = D.entities.entities.filter(function (en) {
    if (entKind !== "all" && en.kind !== entKind) return false;
    if (entQ) {
      var q = entQ.toLowerCase();
      var hay = (en.zh + " " + (en.en || "") + " " + en.desc + " " + (en.traits || "")).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  $("entGrid").innerHTML = list.map(function (en) {
    return '<div class="card" data-ent="' + en.id + '" style="cursor:pointer">' +
      '<div class="row" style="gap:6px"><span class="badge b-kind">' + esc(en.kind) + '</span>' +
      '<span class="badge b-' + en.rights.toLowerCase() + '">' + en.rights + "</span></div>" +
      "<h4>" + esc(en.zh) + (en.en ? ' <span class="mut sm">' + esc(en.en) + "</span>" : "") + "</h4>" +
      '<div class="desc">' + esc(en.desc) + "</div></div>";
  }).join("") || '<div class="mut">没有匹配的实体</div>';
}
function bindEntCards() {
  $$("#dtBody [data-ent]").forEach(function (el) {
    el.addEventListener("click", function () { showEntity(el.getAttribute("data-ent")); });
  });
}
function showEntity(id) {
  var en = AV.entityById(id);
  if (!en) return;
  var rels = AV.relationsOf(id);
  openDrawer(
    "<h3>" + esc(en.id) + " · " + esc(en.zh) + "</h3>" +
    '<div class="row" style="margin:8px 0"><span class="badge b-kind">' + esc(en.kind) + '</span>' +
    '<span class="badge b-' + en.rights.toLowerCase() + '">' + en.rights + " " + esc(D.entities.meta.rights[en.rights]) + "</span>" +
    (en.en ? '<span class="mut sm">' + esc(en.en) + "</span>" : "") + "</div>" +
    '<p class="sm">' + esc(en.desc) + "</p>" +
    (en.traits ? '<h4 style="margin:12px 0 6px">视觉特征</h4><p class="sm">' + esc(en.traits) + "</p>" : "") +
    '<h4 style="margin:12px 0 6px">去标识化描述（商业出图前用这个）</h4>' +
    '<pre class="mono sm" style="white-space:pre-wrap;background:var(--bg2);padding:10px;border-radius:8px">' + esc(en.deid) + "</pre>" +
    '<button class="gcopy" id="dtDeid">复制去标识化描述</button>' +
    (rels.length ? "<h4 style=\"margin:14px 0 8px\">影响关系（" + rels.length + "）</h4>" + rels.map(relHtml).join("") : "")
  );
  $("dtDeid").addEventListener("click", function () { copyText(en.deid); });
  bindEntCards();
}
$("entGrid").addEventListener("click", function (e) {
  var card = e.target.closest("[data-ent]");
  if (card) showEntity(card.getAttribute("data-ent"));
});
$("entSearch").addEventListener("input", function () { entQ = this.value.trim(); renderEntities(); });
$$("[data-ek]").forEach(function (b) {
  b.addEventListener("click", function () {
    $$("[data-ek]").forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    entKind = b.getAttribute("data-ek");
    renderEntities();
  });
});

/* ---------- 自定义出图 ---------- */
var PRESETS = [
  { zh: "剧场版主视觉", desc: "高潮对决的定帧瞬间，竖幅海报", theme: "a hero standing against a collapsing ceiling of light", sel: { size: "SZ-05", media: "MD-12", subject: "SU-01", character: "CH-01", world: "WD-15", shot: "SH-01", light: "LT-04", style: "ST-01", region: "RG-02", layout: "LO-01" } },
  { zh: "角色三视图", desc: "设定稿规格，等高等距纪律", theme: "", sel: { size: "SZ-02", media: "MD-02", subject: "SU-07", character: "CH-02", world: "WD-01", shot: "SH-03", light: "LT-03", style: "ST-01", region: "RG-05", layout: "LO-03" } },
  { zh: "表情九宫格", desc: "同角度同光线，一格里一个情绪", theme: "", sel: { size: "SZ-01", media: "MD-03", subject: "SU-07", character: "CH-02", world: "WD-01", shot: "SH-03", light: "LT-03", style: "ST-02", region: "RG-05", layout: "LO-04" } },
  { zh: "三格漫画页", desc: "墨线网点，对话框留空后期排版", theme: "", sel: { size: "SZ-02", media: "MD-04", subject: "SU-08", character: "CH-02", world: "WD-01", shot: "SH-05", light: "LT-01", style: "ST-07", region: "RG-02", layout: "LO-05", decor: "DC-01" } },
  { zh: "条漫竖屏格", desc: "韩系条漫，关键形状不碰侧边", theme: "", sel: { size: "SZ-04", media: "MD-05", subject: "SU-08", character: "CH-04", world: "WD-13", shot: "SH-03", light: "LT-03", style: "ST-02", region: "RG-15", layout: "LO-09" } },
  { zh: "游戏抽卡立绘", desc: "小尺寸可读，轮廓光分离背景", theme: "", sel: { size: "SZ-02", media: "MD-07", subject: "SU-03", character: "CH-08", world: "WD-14", shot: "SH-01", light: "LT-02", style: "ST-11", region: "RG-18", layout: "LO-01" } },
  { zh: "道具图标", desc: "64 像素可读的符号层", theme: "", sel: { size: "SZ-01", media: "MD-08", subject: "SU-06", world: "WD-09", shot: "SH-11", light: "LT-01", style: "ST-10", region: "RG-18", layout: "LO-11", decor: "DC-03" } },
  { zh: "卡牌牌面", desc: "标题带留空，系列光线一致", theme: "", sel: { size: "SZ-05", media: "MD-09", subject: "SU-13", character: "CH-14", world: "WD-15", shot: "SH-01", light: "LT-04", style: "ST-02", region: "RG-05", layout: "LO-01", decor: "DC-07" } },
  { zh: "虚拟主播立绘", desc: " thumbnail appeal， frontal pose", theme: "", sel: { size: "SZ-01", media: "MD-10", subject: "SU-07", character: "CH-02", world: "WD-13", shot: "SH-04", light: "LT-03", style: "ST-02", region: "RG-05", layout: "LO-01" } },
  { zh: "周边徽章图案", desc: "印刷工艺说了算：粗线少色", theme: "", sel: { size: "SZ-01", media: "MD-11", subject: "SU-04", character: "CH-12", world: "WD-16", shot: "SH-11", light: "LT-01", style: "ST-06", region: "RG-13", layout: "LO-11" } },
  { zh: "赛博海报", desc: "斜角动势 + 集中线，宽画幅", theme: "", sel: { size: "SZ-03", media: "MD-12", subject: "SU-05", character: "CH-01", world: "WD-03", shot: "SH-06", light: "LT-02", style: "ST-14", region: "RG-05", layout: "LO-02", decor: "DC-02" } },
  { zh: "轻小说彩页", desc: "水彩洇边，插图让位给文字", theme: "", sel: { size: "SZ-02", media: "MD-06", subject: "SU-09", character: "CH-02", world: "WD-11", shot: "SH-04", light: "LT-01", style: "ST-04", region: "RG-06", layout: "LO-01", decor: "DC-06" } }
];
function renderPresets() {
  $("preGrid").innerHTML = PRESETS.map(function (p, i) {
    return '<div class="card" data-pre="' + i + '" style="cursor:pointer">' +
      "<h4>" + esc(p.zh) + '</h4><div class="desc">' + esc(p.desc) + "</div>" +
      '<div style="margin-top:7px">' + selChips(AV.normalize ? AV.normalize(p.sel) : p.sel) + "</div></div>";
  }).join("");
  var sel = $("ezPreset");
  sel.innerHTML = PRESETS.map(function (p, i) { return '<option value="' + i + '">' + esc(p.zh) + "</option>"; }).join("");
}
$("preGrid").addEventListener("click", function (e) {
  var card = e.target.closest("[data-pre]");
  if (!card) return;
  var p = PRESETS[+card.getAttribute("data-pre")];
  $("ezPreset").value = card.getAttribute("data-pre");
  $("ezTheme").value = p.theme;
  runEasy();
});
function runEasy() {
  var i = +$("ezPreset").value || 0;
  var p = PRESETS[i];
  var theme = $("ezTheme").value.trim() || p.theme;
  var r = AV.compose(p.sel, { theme: theme });
  var pal = AV.paletteOf(p.sel.style);
  $("ezOut").innerHTML =
    '<div class="outbox" style="position:static">' +
    '<div class="row" style="justify-content:space-between"><b>' + esc(p.zh) + '</b><button class="gcopy" id="ezCopy">复制提示词</button></div>' +
    (r.warnings.length ? '<div class="warn">⚠ ' + r.warnings.map(function (w) { return esc(w.a + " × " + w.b + "：" + w.verdict); }).join("<br>") + "</div>" : "") +
    '<div class="prompt">' + esc(r.prompt) + "</div>" +
    '<div class="sm mut">' + r.zh.map(esc).join(" · ") + "</div>" +
    (pal ? '<div class="row" style="margin-top:8px">' + pal.swatches.map(function (s) {
      return '<span class="pill" style="cursor:pointer" data-hex="' + s.hex + '">' + s.hex + " " + esc(s.name) + "</span>";
    }).join("") + "</div>" : "") +
    '<div class="row" style="margin-top:10px"><button class="btn sm" id="ezToSynth">去合成器细调</button></div></div>';
  $("ezCopy").addEventListener("click", function () { copyText(r.prompt); });
  $("ezToSynth").addEventListener("click", function () {
    S.sel = Object.assign({}, r.sel); S.theme = theme; renderSynth(); switchView("v-synth");
  });
  $$("#ezOut [data-hex]").forEach(function (el) {
    el.addEventListener("click", function () { copyText(el.getAttribute("data-hex")); });
  });
}
$("ezGo").addEventListener("click", runEasy);
$("ezRand").addEventListener("click", function () {
  var r = AV.random();
  var i = Math.floor(Math.random() * PRESETS.length);
  $("ezPreset").value = String(i);
  var p = PRESETS[i];
  var merged = Object.assign({}, AV.normalize(p.sel), r);
  var rr = AV.compose(merged, { theme: p.theme });
  $("ezTheme").value = "";
  $("ezOut").innerHTML =
    '<div class="outbox" style="position:static">' +
    '<div class="row" style="justify-content:space-between"><b>🎲 随机一张（' + esc(p.zh) + " 底）</b>" +
    '<button class="gcopy" id="ezCopy">复制提示词</button></div>' +
    (rr.warnings.length ? '<div class="warn">⚠ ' + rr.warnings.map(function (w) { return esc(w.a + " × " + w.b + "：" + w.verdict); }).join("<br>") + "</div>" : "") +
    '<div class="prompt">' + esc(rr.prompt) + "</div>" +
    '<div class="sm mut">' + rr.zh.map(esc).join(" · ") + "</div></div>";
  $("ezCopy").addEventListener("click", function () { copyText(rr.prompt); });
});

/* ---------- 系列出图 ---------- */
var S = { sel: {}, theme: "", serCount: 4, serSeed: 20261022 };
function serThemeChips() {
  $("serChips").innerHTML = D.series.themes.map(function (t) {
    return '<span class="chip" data-th="' + t.id + '">' + esc(t.zh) + "</span>";
  }).join("");
}
$("serChips").addEventListener("click", function (e) {
  var chip = e.target.closest("[data-th]");
  if (!chip) return;
  $("serTheme").value = chip.getAttribute("data-th");
  doSeries();
});
$$(".sercnt").forEach(function (b) {
  b.addEventListener("click", function () {
    $$(".sercnt").forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    S.serCount = +b.getAttribute("data-n");
    if ($("serTheme").value.trim()) doSeries();
  });
});
function doSeries() {
  var raw = $("serTheme").value.trim();
  if (!raw) { toast("先输入主题，或点一个主题卡片"); return; }
  var ser = AV.buildSeries(raw, S.serCount, { seed: S.serSeed });
  renderSeries(ser);
}
$("doSeries").addEventListener("click", doSeries);
$("serTheme").addEventListener("keydown", function (e) { if (e.key === "Enter") doSeries(); });
$("serReroll").addEventListener("click", function () {
  S.serSeed = (S.serSeed * 1103515245 + 12345) % 2147483647;
  if ($("serTheme").value.trim()) doSeries();
  toast("已换一批配套");
});
$("serAll").addEventListener("click", function () {
  var out = $("seriesOut");
  var blocks = $$(".sercard pre", out);
  if (!blocks.length) { toast("先生成系列"); return; }
  var text = blocks.map(function (pre, i) {
    var card = pre.closest(".sercard");
    var title = card.querySelector("h4").textContent;
    return "【" + title + "】\n" + pre.textContent;
  }).join("\n\n");
  copyText(text);
});
function renderSeries(ser) {
  var pal = ser.palette;
  var head =
    '<div class="panel" style="background:var(--panel2);margin-bottom:14px">' +
    '<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">' +
    "<div><b style=\"font-size:15px\">「" + esc(ser.theme) + "」· " + ser.cards.length + " 张一套</b>" +
    '<div class="mut sm" style="margin-top:4px">全组统一：风格 ' + esc(ser.style.zh) + " · 题材 " + esc(ser.subject.zh) +
    " · 角色 " + esc(ser.character.zh) + " · 世界 " + esc(ser.world.zh) + " · 地区 " + esc(ser.region.zh) + "</div></div>" +
    (pal ? '<div style="text-align:right"><div class="mut sm">配色 · ' + esc(pal.styleZh) + "</div>" +
      '<div class="swrow" style="display:flex;gap:5px;margin-top:5px">' + pal.swatches.map(function (s) {
        return '<i style="width:30px;height:30px;border-radius:7px;background:' + s.hex + ';cursor:pointer;display:block" data-hex="' + s.hex + '" title="' + esc(s.name) + '"></i>';
      }).join("") + "</div></div>" : "") +
    "</div></div>";
  $("seriesOut").innerHTML = head + '<div class="grid g2" id="serCards">' + ser.cards.map(function (c) {
    return '<div class="sercard">' +
      '<span class="role">' + esc(c.zh) + "</span>" +
      "<h4>" + esc(c.title) + "</h4>" +
      '<div class="job">' + esc(c.job) + "</div>" +
      '<div style="margin:8px 0">' + selChips(c.sel) + "</div>" +
      (c.warnings.length ? '<div class="warn">⚠ ' + c.warnings.map(function (w) { return esc(w.a + " × " + w.b + "：" + w.verdict); }).join("<br>") + "</div>" : "") +
      "<pre>" + esc(c.prompt) + "</pre>" +
      '<div class="row"><button class="gcopy copy">复制这张</button>' +
      '<span class="mut sm">文案：' + esc(c.copyGuide) + "</span></div>" +
      '<div class="mut sm" style="margin-top:5px">为什么：' + esc(c.why) + "</div>" +
      "</div>";
  }).join("") + "</div>";
  $$("#seriesOut [data-hex]").forEach(function (el) {
    el.addEventListener("click", function () { copyText(el.getAttribute("data-hex")); });
  });
  $$("#serCards .copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      copyText(btn.closest(".sercard").querySelector("pre").textContent);
    });
  });
}

/* ---------- 提示词合成器 ---------- */
function renderSynth() {
  var combo = AV.stats().combos;
  $("synCombo").textContent = combo.toLocaleString("en-US");
  // 维度选择器
  $("synDims").innerHTML = AV.DIM_KEYS.map(function (d) {
    var meta = D[d];
    return '<div class="dimgroup"><div class="dh"><b>' + esc(meta.zh) + "</b><span>" + esc(meta.who) + " · " + esc(meta.decides) + "</span></div>" +
      '<div class="chips">' + meta.items.map(function (it) {
        var on = S.sel[d] === it.id ? " on" : "";
        return '<span class="chip' + on + '" data-d="' + d + '" data-id="' + it.id + '">' + esc(it.zh) + '<span class="cid">' + it.id + "</span></span>";
      }).join("") + "</div></div>";
  }).join("");
  $$("#synDims .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var d = chip.getAttribute("data-d"), id = chip.getAttribute("data-id");
      if (S.sel[d] === id) delete S.sel[d];
      else S.sel[d] = id;
      renderSynth();
    });
  });
  // 输出区
  var r = AV.compose(S.sel, { theme: S.theme });
  var html = '<div class="row" style="justify-content:space-between"><b>成品词面</b>' +
    '<button class="gcopy" id="synCopy">复制</button></div>';
  if (r.warnings.length) {
    html += '<div class="warn">⚠ 冲突裁决：<br>' + r.warnings.map(function (w) {
      return esc(w.a + " × " + w.b + " → " + w.verdict + "（" + w.why + "）");
    }).join("<br>") + "</div>";
  } else if (Object.keys(S.sel).length) {
    html += '<div class="okbox">✓ 无冲突</div>';
  }
  html += '<div class="prompt" id="synPrompt">' + (r.prompt ? esc(r.prompt) : '<span class="mut">左边选维度，这里实时出词</span>') + "</div>";
  if (r.zh.length) html += '<div class="sm mut">配方：' + r.zh.map(esc).join(" · ") + "</div>";
  var pal = S.sel.style ? AV.paletteOf(S.sel.style) : null;
  if (pal) {
    html += '<div class="sm mut" style="margin-top:6px">配色（' + esc(pal.styleZh) + "）：</div>" +
      '<div class="row">' + pal.swatches.map(function (s) {
        return '<span class="pill" style="cursor:pointer" data-hex="' + s.hex + '">' + s.hex + " " + esc(s.name) + "</span>";
      }).join("") + "</div>";
  }
  $("synOut").innerHTML = html;
  $("synCopy").addEventListener("click", function () { copyText(r.prompt); });
  $$("#synOut [data-hex]").forEach(function (el) {
    el.addEventListener("click", function () { copyText(el.getAttribute("data-hex")); });
  });
}
$("synTheme").addEventListener("input", function () { S.theme = this.value.trim(); renderSynth(); });
$("synRandom").addEventListener("click", function () {
  S.sel = AV.random();
  S.theme = "";
  $("synTheme").value = "";
  renderSynth();
  toast("随机配方已生成");
});
$("synReset").addEventListener("click", function () {
  S.sel = {}; S.theme = ""; $("synTheme").value = "";
  renderSynth();
});
$("synShare").addEventListener("click", function () {
  if (!Object.keys(S.sel).length) { toast("先选维度再生成分享码"); return; }
  var code = AV.encodeShare({ sel: S.sel, freeText: S.theme });
  $("synShareBox").innerHTML =
    '<input type="text" class="mono" style="flex:1;font-size:11.5px" value="' + esc(code) + '" readonly>' +
    '<button class="btn sm" id="synShareCopy">复制分享码</button>' +
    '<span class="mut sm">粘回任意一库合成器即还原配方</span>';
  $("synShareCopy").addEventListener("click", function () { copyText(code); });
});

/* ---------- 算子工具条 ---------- */
function renderOps() {
  $("opBar").innerHTML = Object.keys(AV.OPERATORS).map(function (k) {
    var op = AV.OPERATORS[k];
    return '<button class="opbtn" data-op="' + k + '"><b>' + esc(op.zh) + "</b><small>" + esc(op.desc) + "</small></button>";
  }).join("");
  $$("#opBar .opbtn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var k = btn.getAttribute("data-op");
      var op = AV.OPERATORS[k];
      if (!Object.keys(S.sel).length) { toast("先在左边选一个配方"); return; }
      var before = JSON.stringify(S.sel);
      var after = AV.applyOperator(S.sel, k);
      if (!after) { toast("算子不存在"); return; }
      S.sel = after;
      renderSynth();
      $("opInfo").innerHTML = "<b>" + esc(op.zh) + "</b>（" + k + "）：" + esc(op.desc) +
        '<div class="opmeta">' +
        '<span class="p">保持 ' + op.preserve.map(function (d) { return esc(dimZh(d)); }).join(" / ") + "</span>" +
        '<span class="c">改写 ' + op.change.map(function (d) { return esc(dimZh(d)); }).join(" / ") + "</span>" +
        (op.forbid.length ? '<span class="f">禁区 ' + op.forbid.map(esc).join("；") + "</span>" : '<span class="f">无硬禁区</span>') +
        "</div>" + (before === JSON.stringify(S.sel) ? '<div class="mut sm" style="margin-top:5px">本次无可变项（已在边界上）</div>' : "");
      toast("已应用：" + op.zh);
    });
  });
}

/* ---------- 抽卡 ---------- */
var gcLock = {}, gcN = 4;
function gcLockInfo() {
  var keys = Object.keys(gcLock);
  $("gcLockInfo").textContent = keys.length ? "锁定：" + keys.map(function (k) { return dimZh(k) + "·" + zhOf(k, gcLock[k]); }).join("，") : "无锁定（全随机）";
}
function doGacha() {
  $("gcGrid").innerHTML = "";
  for (var i = 0; i < gcN; i++) {
    (function (i) {
      var r = AV.random(gcLock);
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="row" style="justify-content:space-between"><span class="cid">#' + (i + 1) + '</span>' +
        '<span class="mut sm">' + (r.warnings || "").length + " 警告</span></div>" +
        '<div class="sm" style="margin:7px 0;min-height:64px">' + selChips(r) + "</div>" +
        '<pre class="mono" style="font-size:10.5px;white-space:pre-wrap;word-break:break-all;background:var(--bg2);padding:8px;border-radius:7px;max-height:110px;overflow-y:auto">' + esc(AV.compose(r).prompt) + "</pre>" +
        '<div class="row" style="margin-top:8px"><button class="btn sm">复制</button><button class="btn sm">载入合成器</button></div>';
      var btns = card.querySelectorAll("button");
      btns[0].addEventListener("click", function () { copyText(AV.compose(r).prompt); });
      btns[1].addEventListener("click", function () { S.sel = r; renderSynth(); switchView("v-synth"); toast("已载入"); });
      $("gcGrid").appendChild(card);
    })(i);
  }
}
$("gc1").addEventListener("click", function () { gcN = 1; doGacha(); });
$("gc4").addEventListener("click", function () { gcN = 4; doGacha(); });
$("gc8").addEventListener("click", function () { gcN = 8; doGacha(); });
// 锁定入口放在合成器输出区下方：由 renderSynth 注入
var origRenderSynth = renderSynth;
renderSynth = function () {
  origRenderSynth();
  var box = $("synOut");
  if (box && !$("gcLockBtns")) {
    var wrap = document.createElement("div");
    wrap.id = "gcLockBtns";
    wrap.className = "row";
    wrap.style.marginTop = "10px";
    wrap.innerHTML = '<span class="mut sm">抽卡锁定：</span>' +
      '<button class="btn sm" id="gcLockSet">锁定当前配方</button>' +
      '<button class="btn sm" id="gcLockClr">清除锁定</button>';
    box.appendChild(wrap);
    $("gcLockSet").addEventListener("click", function () {
      gcLock = Object.assign({}, AV.normalize(S.sel));
      gcLockInfo();
      toast(Object.keys(gcLock).length ? "已锁定 " + Object.keys(gcLock).length + " 维" : "配方为空，未锁定");
    });
    $("gcLockClr").addEventListener("click", function () { gcLock = {}; gcLockInfo(); toast("锁定已清除"); });
  }
};

/* ---------- 验证案例页 ---------- */
function renderCases() {
  $("csGrid").innerHTML = D.cases.items.map(function (cs) {
    var r = AV.compose(cs.recipe);
    return '<div class="card">' +
      '<div class="row" style="justify-content:space-between"><span class="cid">' + cs.id + '</span>' +
      '<span class="badge ' + (cs.tested ? "b-r0" : "b-r1") + '">' + (cs.tested ? "已实测" : "未实测") + "</span></div>" +
      "<h4>" + esc(cs.zh) + "</h4>" +
      '<div class="desc">' + esc(cs.desc) + "</div>" +
      '<div style="margin:8px 0">' + selChips(r.sel) + "</div>" +
      '<div class="sm" style="color:var(--cy)">验证点：' + esc(cs.validates) + "</div>" +
      '<div class="row" style="margin-top:9px"><button class="btn sm" data-cs="' + cs.id + '">复制提示词</button>' +
      '<button class="btn sm" data-cs2="' + cs.id + '">合成器改用</button></div></div>';
  }).join("");
}
$("csGrid").addEventListener("click", function (e) {
  var id = e.target.getAttribute("data-cs") || e.target.getAttribute("data-cs2");
  if (!id) return;
  var cs = D.cases.items.filter(function (c) { return c.id === id; })[0];
  if (e.target.getAttribute("data-cs")) { copyText(AV.compose(cs.recipe).prompt); return; }
  S.sel = Object.assign({}, cs.recipe); S.theme = "";
  renderSynth(); switchView("v-synth"); toast("已载入配方");
});

/* ---------- 全部词条 ---------- */
var enDim = "all", enQ = "";
function renderEntries() {
  var dims = ["all"].concat(AV.DIM_KEYS);
  $("dimTabs").innerHTML = dims.map(function (d) {
    var label = d === "all" ? "全部" : D[d].zh;
    return '<button class="btn sm' + (enDim === d ? " on" : "") + '" data-ed="' + d + '">' + esc(label) + "</button>";
  }).join("");
  var items = [];
  AV.DIM_KEYS.forEach(function (d) {
    if (enDim !== "all" && enDim !== d) return;
    D[d].items.forEach(function (it) { items.push({ d: d, it: it }); });
  });
  if (enQ) {
    var q = enQ.toLowerCase();
    items = items.filter(function (x) {
      return (x.it.zh + " " + x.it.prompt + " " + (x.it.note || "")).toLowerCase().indexOf(q) !== -1;
    });
  }
  $("enTotal").textContent = items.length + " 条";
  $("enGrid").innerHTML = items.map(function (x) {
    return '<div class="card" data-en="' + x.d + "|" + x.it.id + '" style="cursor:pointer">' +
      '<div class="row" style="justify-content:space-between"><span class="cid">' + x.it.id + '</span>' +
      '<span class="mut sm">' + esc(D[x.d].zh) + "</span></div>" +
      "<h4>" + esc(x.it.zh) + "</h4>" +
      '<div class="desc">' + esc(x.it.note || x.it.prompt.slice(0, 60) + "…") + "</div>" +
      '<div class="row" style="margin-top:8px"><button class="btn sm" data-copy="1">复制片段</button></div></div>';
  }).join("") || '<div class="mut">没有匹配的词条</div>';
}
$("dimTabs").addEventListener("click", function (e) {
  var b = e.target.closest("[data-ed]");
  if (!b) return;
  enDim = b.getAttribute("data-ed");
  renderEntries();
});
$("enSearch").addEventListener("input", function () { enQ = this.value.trim(); renderEntries(); });
$("enGrid").addEventListener("click", function (e) {
  var card = e.target.closest("[data-en]");
  if (!card) return;
  var parts = card.getAttribute("data-en").split("|");
  var it = AV.index[parts[0]][parts[1]];
  if (e.target.getAttribute("data-copy")) { copyText(it.prompt); return; }
  openDrawer(
    "<h3>" + esc(it.id) + " · " + esc(it.zh) + '</h3><div class="mut sm">' + esc(D[parts[0]].zh) + " · " + esc(D[parts[0]].who) + "</div>" +
    (it.note ? '<p class="sm" style="margin:10px 0;color:var(--cy)">' + esc(it.note) + "</p>" : "") +
    '<h4 style="margin:12px 0 6px">prompt 片段</h4>' +
    '<pre class="mono sm" style="white-space:pre-wrap;background:var(--bg2);padding:10px;border-radius:8px">' + esc(it.prompt) + "</pre>" +
    (it.children ? '<h4 style="margin:12px 0 6px">二级目录</h4><div>' + it.children.map(function (c) { return '<span class="pill">' + esc(c) + "</span>"; }).join("") + "</div>" : "") +
    '<div class="row" style="margin-top:12px"><button class="gcopy" id="dtCopy">复制片段</button>' +
    '<button class="btn sm" id="dtPick">加入配方</button></div>'
  );
  $("dtCopy").addEventListener("click", function () { copyText(it.prompt); });
  $("dtPick").addEventListener("click", function () {
    S.sel[parts[0]] = it.id;
    renderSynth(); switchView("v-synth"); closeDrawer(); toast("已加入配方");
  });
});

/* ---------- 风格配色 ---------- */
function renderPairs() {
  $("plGrid").innerHTML = D.palettes.items.map(function (pl) {
    return '<div class="card plcard">' +
      '<div class="row" style="justify-content:space-between"><span class="cid">' + pl.id + '</span>' +
      '<span class="mut sm">' + esc(pl.styleZh) + "</span></div>" +
      '<h4>' + esc(pl.styleZh) + " 配色</h4>" +
      '<div class="swrow">' + pl.swatches.map(function (s) {
        return '<i style="background:' + s.hex + '" data-hex="' + s.hex + '" title="' + esc(s.name) + " · 点击复制\"></i>";
      }).join("") + "</div>" +
      '<div class="desc">' + esc(pl.note) + "</div>" +
      '<div class="sm" style="color:var(--rd);margin-top:6px">避免：' + esc(pl.avoid) + "</div>" +
      '<div style="margin-top:7px">' + (pl.suits || []).map(function (id) { return '<span class="pill">' + esc(zhOf("media", id)) + "</span>"; }).join("") + "</div></div>";
  }).join("");
  $$("#plGrid [data-hex]").forEach(function (el) {
    el.addEventListener("click", function () { copyText(el.getAttribute("data-hex")); });
  });
}

/* ---------- 框架与体检 ---------- */
function renderFrame() {
  var s = AV.stats();
  var cards = [
    ["维度条目", s.entries, "11 个正交维度"],
    ["组合空间", s.combos.toLocaleString("en-US"), "各维度条目连乘"],
    ["配色卡", s.palettes, "每风格一张"],
    ["验证案例", s.cases, "全部 tested=false"],
    ["任务模板", s.templates, "fills/protect/checklist"],
    ["冲突规则", s.conflicts, "when/notWith/verdict"],
    ["系列角色", s.seriesRoles, "主题 " + s.seriesThemes + " 个"],
    ["参考实体", s.entities, "关系边 " + s.relations + " 条"]
  ];
  $("stCards").innerHTML = cards.map(function (c) {
    return '<div class="card"><div class="mut sm">' + esc(c[0]) + '</div>' +
      '<div style="font-size:19px;font-weight:700;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent">' + esc(c[1]) + "</div>" +
      '<div class="mut" style="font-size:11px">' + esc(c[2]) + "</div></div>";
  }).join("");
  $("dimTb").innerHTML = "<tr><th>#</th><th>维度</th><th>决定什么</th><th>谁来定</th><th>条目</th></tr>" +
    AV.DIM_KEYS.map(function (d, i) {
      var m = D[d];
      return "<tr><td>" + (i + 1) + '</td><td><b>' + esc(m.zh) + "</b> <span class=\"mono mut\">" + d + "</span></td>" +
        "<td>" + esc(m.decides) + "</td><td>" + esc(m.who) + "</td><td>" + m.items.length + "</td></tr>";
    }).join("");
  $("asmOrder").textContent = AV.ASM_ORDER.map(function (d) { return dimZh(d); }).join(" → ") +
    "（主题词注入在载体之后）→ 末尾固定硬约束：" + AV.FOOTER;
  $("cfTb").innerHTML = "<tr><th>id</th><th>触发</th><th>不与谁共存</th><th>裁决</th><th>为什么</th></tr>" +
    D.conflicts.conflicts.map(function (r) {
      var names = function (ids) { return ids.map(function (id) { return esc(AV.byId[id] ? AV.byId[id].zh : id); }).join(" × "); };
      return "<tr><td class=\"mono\">" + r.id + "</td><td>" + names(r.when) + "</td><td>" + names(r.notWith) + "</td><td>" + esc(r.verdict) + "</td><td>" + esc(r.why) + "</td></tr>";
    }).join("");
  $("srTb").innerHTML = "<tr><th>id</th><th>角色</th><th>职责</th><th>标题公式</th><th>为什么</th></tr>" +
    D.series.roles.map(function (r) {
      return "<tr><td class=\"mono\">" + r.id + "</td><td><b>" + esc(r.zh) + "</b></td><td>" + esc(r.job) + "</td><td>" + esc(r.titleFormula) + "</td><td>" + esc(r.why) + "</td></tr>";
    }).join("");
}

/* ---------- 启动 ---------- */
renderGallery();
renderRegions();
renderEntities();
renderPresets();
serThemeChips();
renderSynth();
renderOps();
renderCases();
renderEntries();
renderPairs();
renderFrame();
gcLockInfo();
doGacha();
})();
