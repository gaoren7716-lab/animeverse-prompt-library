/* AV 引擎：装配 / 冲突 / 受控变形算子 / 系列构建 / 约束随机 / 盘点。
 * 双跑（Node CLI + 浏览器页面共用同一份逻辑，杜绝两套实现漂移）：
 *   Node:   var AV = require("./tools/compose.js");
 *   浏览器: 引入 assets/engine.js 后 window.AV
 * 数据来源：浏览器读 window.AV_DATA；Node 直接读 data/*.json。
 * 注意：注释里不出现 script 闭合标签（内联注入会被截断）。 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(); }
  else { root.AV = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  var DIM_KEYS = ["regions", "styles", "media", "subjects", "characters",
    "worlds", "shots", "lights", "layouts", "sizes", "decors"];
  var ASM_ORDER = ["sizes", "media", "subjects", "characters", "worlds",
    "shots", "lights", "styles", "regions", "layouts", "decors"];
  var FOOTER = "no watermark, no logo, no garbled text, no deformed anatomy, no extra limbs, clean readable composition";
  // 配方键（单数）→ 维度键（复数）
  var KEY2DIM = { region: "regions", style: "styles", media: "media",
    subject: "subjects", character: "characters", world: "worlds",
    shot: "shots", light: "lights", layout: "layouts", size: "sizes", decor: "decors" };

  var data = (typeof window !== "undefined" && window.AV_DATA) ? window.AV_DATA : null;
  if (!data) {
    var fs = require("fs"), path = require("path");
    var DATA_DIR = path.join(__dirname, "..", "data");
    data = {};
    DIM_KEYS.concat(["series", "cases", "conflicts", "templates", "palettes", "entities", "gallery", "scripts"]).forEach(function (n) {
      data[n] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, n + ".json"), "utf8"));
    });
  }

  var index = {}, byId = {};
  DIM_KEYS.forEach(function (d) {
    index[d] = {};
    data[d].items.forEach(function (it) { index[d][it.id] = it; byId[it.id] = it; });
  });
  function dimOf(id) {
    for (var d in index) if (index[d][id]) return d;
    return null;
  }
  function normalize(sel) {
    // 接受复数键（forms）或单数键（form）；theme/freeText 原样保留（不进维度）
    var out = {};
    Object.keys(sel || {}).forEach(function (k) {
      var d = KEY2DIM[k] || k;
      if (DIM_KEYS.indexOf(d) === -1) return;
      var v = sel[k];
      if (!v) return;
      out[d] = Array.isArray(v) ? v[0] : v;
    });
    return out;
  }

  /* ---------- 装配 ---------- */
  function compose(sel, opts) {
    var s = normalize(sel);
    var o = opts || {};
    var segs = [], zh = [];
    var themeSeg = "";
    if (o.theme && String(o.theme).trim()) themeSeg = "theme: " + String(o.theme).trim();
    ASM_ORDER.forEach(function (d) {
      var id = s[d]; if (!id) return;
      var it = index[d][id]; if (!it) return;
      if (d === "media" && themeSeg) { segs.push(it.prompt); zh.push(data[d].zh + "：" + it.zh); segs.push(themeSeg); zh.push("主题：" + String(o.theme).trim()); return; }
      segs.push(it.prompt);
      zh.push(data[d].zh + "：" + it.zh);
    });
    if (themeSeg && !s.media) { segs.unshift(themeSeg); zh.unshift("主题：" + String(o.theme).trim()); }
    if (o.freeText && String(o.freeText).trim()) { segs.push(String(o.freeText).trim()); }
    var prompt = segs.length ? segs.join(", ") + ", " + FOOTER : "";
    return { prompt: prompt, zh: zh, warnings: conflicts(s), sel: s };
  }

  function conflicts(sel) {
    var s = normalize(sel), msgs = [];
    data.conflicts.conflicts.forEach(function (r) {
      var whenHit = r.when.every(function (id) { return s[dimOf(id)] === id; });
      if (!whenHit) return;
      r.notWith.forEach(function (id) {
        if (s[dimOf(id)] === id) {
          msgs.push({ verdict: r.verdict, why: r.why,
            a: byId[r.when[0]] ? byId[r.when[0]].zh : r.when[0],
            b: byId[id] ? byId[id].zh : id });
        }
      });
    });
    return msgs;
  }

  function changesList(sel, opts) {
    var s = normalize(sel), o = opts || {};
    var rows = [];
    ASM_ORDER.forEach(function (d) {
      var id = s[d];
      if (!id || !index[d][id]) return;
      rows.push({ dim: data[d].zh, id: id, zh: index[d][id].zh });
    });
    return { rows: rows, freeText: o.freeText || "", theme: o.theme || "", warnings: conflicts(s) };
  }

  /* ---------- 受控变形算子 ----------
   * 每个算子声明 preserve（保持不变的维度）/ change（会被改写的维度）/ forbid（硬边界），
   * 页面工具栏据此显示「什么不动、什么变、什么不许碰」。apply 是纯函数：入旧 sel 出新 sel。
   * 算子内部带冲突守卫：目标状态若触雷，顺移到下一个合法候选。 */
  function nextInChain(chain, cur) {
    var i = chain.indexOf(cur);
    return chain[(i + 1) % chain.length];
  }
  // 自然光循环（舞台/烛火/逆光/体积/阴天不参与时段循环）
  var LIGHT_CYCLE = ["LT-09", "LT-07", "LT-01", "LT-08", "LT-02"];
  var STAGE_LIGHTS = { "LT-04": 1, "LT-05": 1, "LT-06": 1, "LT-10": 1, "LT-03": 1 };
  // 换画风候选序：同族相邻，避免一次跳太远
  var STYLE_CHAIN = ["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-07", "ST-08", "ST-09",
    "ST-10", "ST-11", "ST-12", "ST-06", "ST-13", "ST-14", "ST-15", "ST-16"];
  // 换媒介家族：帧 → 漫画页 → 插画 → 海报（每种媒介自带风格/版式/画幅配套）
  var MEDIA_FAMILY = ["MD-01", "MD-04", "MD-06", "MD-12"];
  var MEDIA_KIT = {
    "MD-01": { style: null, layout: "LO-01", size: "SZ-03", decor: null },
    "MD-04": { style: "ST-07", layout: "LO-05", size: "SZ-02", decor: "DC-01" },
    "MD-06": { style: null, layout: "LO-01", size: "SZ-02", decor: null },
    "MD-12": { style: null, layout: "LO-01", size: "SZ-05", decor: null }
  };
  // 换年代：按地区内年代链推进
  var ERA_CHAINS = {
    JP: ["RG-01", "RG-02", "RG-03", "RG-04", "RG-05", "RG-06"],
    US: ["RG-07", "RG-08", "RG-09", "RG-10"],
    CN: ["RG-11", "RG-12", "RG-13", "RG-14"],
    OTHER: ["RG-15", "RG-16", "RG-17", "RG-18"]
  };
  var REGION_CHAIN = { "RG-01": "JP", "RG-02": "JP", "RG-03": "JP", "RG-04": "JP", "RG-05": "JP", "RG-06": "JP",
    "RG-07": "US", "RG-08": "US", "RG-09": "US", "RG-10": "US",
    "RG-11": "CN", "RG-12": "CN", "RG-13": "CN", "RG-14": "CN",
    "RG-15": "OTHER", "RG-16": "OTHER", "RG-17": "OTHER", "RG-18": "OTHER" };
  var SHOT_CHAIN = ["SH-01", "SH-02", "SH-03", "SH-04", "SH-05", "SH-06", "SH-07", "SH-08", "SH-09", "SH-10", "SH-11", "SH-12"];
  var SIZE_CHAIN = ["SZ-01", "SZ-02", "SZ-03", "SZ-04", "SZ-05", "SZ-06"];

  var OPERATORS = {
    "time-shift": {
      zh: "换时段",
      desc: "把画面推到另一个时间段：晨光→正午→黄金→蓝调→霓虹夜→回到晨雾",
      preserve: ["media", "subjects", "characters", "worlds", "styles", "regions", "layouts", "sizes"],
      change: ["lights"],
      forbid: ["舞台聚光/烛火/逆光/体积光不参与时段循环"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        if (s.lights && !STAGE_LIGHTS[s.lights]) s.lights = nextInChain(LIGHT_CYCLE, s.lights);
        else if (!s.lights) s.lights = "LT-01";
        return s;
      }
    },
    "style-flip": {
      zh: "换画风",
      desc: "沿画风链换一级完成效果，角色、世界、载体都不动",
      preserve: ["media", "subjects", "characters", "worlds", "regions", "layouts", "sizes"],
      change: ["styles"],
      forbid: ["漫画页只能是墨线语言（CF-03）", "水墨传统不混搭霓虹/三维（CF-06）"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        var cur = s.styles || "ST-01";
        for (var t = 0; t < STYLE_CHAIN.length; t++) {
          var cand = nextInChain(STYLE_CHAIN, cur);
          cur = cand;
          var probe = Object.assign({}, s, { styles: cand });
          if (conflicts(probe).length === 0) { s.styles = cand; return s; }
        }
        return s; // 全链都雷（理论不存在）：保持原样
      }
    },
    "chibi-fy": {
      zh: "Q版化",
      desc: "整体转为二头身Q版，题材与世界不变",
      preserve: ["media", "subjects", "characters", "worlds", "regions", "shots", "sizes"],
      change: ["styles"],
      forbid: ["道具图标不Q版化（MD-08 已是符号层）"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        if (s.media === "MD-08") return s;
        s.styles = "ST-06";
        return s;
      }
    },
    "medium-flip": {
      zh: "换媒介",
      desc: "同一内容换载体：关键帧→漫画页→轻插画→海报，每种媒介自带配套",
      preserve: ["subjects", "characters", "worlds", "styles", "regions", "shots"],
      change: ["media", "layouts", "sizes", "decors"],
      forbid: ["画幅铁律优先（CF-01）"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        var cur = s.media || "MD-01";
        var i = MEDIA_FAMILY.indexOf(cur);
        var target = MEDIA_FAMILY[(i + 1) % MEDIA_FAMILY.length];
        var kit = MEDIA_KIT[target];
        s.media = target;
        s.layouts = kit.layout;
        s.sizes = kit.size;
        if (kit.decor) s.decors = kit.decor;
        if (kit.style) s.styles = kit.style;
        else delete s.decors;
        return s;
      }
    },
    "lens-shift": {
      zh: "换机位",
      desc: "沿机位链走一格：仰拍→俯拍→特写→全景→过肩→斜角→POV→背影→冲刺→对称→微距→摇镜",
      preserve: ["media", "subjects", "characters", "worlds", "styles", "regions", "layouts", "sizes"],
      change: ["shots"],
      forbid: ["微距不接群像版式（CF-08）"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        var cur = s.shots || "SH-01";
        for (var t = 0; t < SHOT_CHAIN.length; t++) {
          var cand = nextInChain(SHOT_CHAIN, cur);
          cur = cand;
          var probe = Object.assign({}, s, { shots: cand });
          if (conflicts(probe).length === 0) { s.shots = cand; return s; }
        }
        return s;
      }
    },
    "era-shift": {
      zh: "换年代",
      desc: "在同一地区的年代链里推进一步：70年代机器人→80黄金→90OVA→00数码→新番",
      preserve: ["media", "subjects", "characters", "worlds", "styles", "layouts", "sizes"],
      change: ["regions", "styles"],
      forbid: ["水墨传统年代不混搭霓虹/三维风格（CF-06）"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        var cur = s.regions || "RG-05";
        var chain = ERA_CHAINS[REGION_CHAIN[cur] || "JP"];
        s.regions = nextInChain(chain, cur);
        // CF-06 守卫：进水墨传统年代时，霓虹/三维风格回落水墨
        if (s.regions === "RG-11" && (s.styles === "ST-14" || s.styles === "ST-11")) s.styles = "ST-08";
        return s;
      }
    },
    "dark-variant": {
      zh: "暗黑变体",
      desc: "压成夜戏：蓝调月光 + 胶片颗粒，构图与角色不动",
      preserve: ["media", "subjects", "characters", "worlds", "styles", "regions", "layouts", "sizes"],
      change: ["lights", "decors"],
      forbid: [],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        if (!STAGE_LIGHTS[s.lights]) s.lights = "LT-08";
        s.decors = "DC-04";
        return s;
      }
    },
    "manga-page": {
      zh: "漫画页化",
      desc: "一键落成黑白漫画页：墨线 + 网点 + 三格过场 + 对话框预留",
      preserve: ["subjects", "characters", "worlds", "shots", "lights"],
      change: ["media", "styles", "layouts", "sizes", "decors"],
      forbid: [],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        s.media = "MD-04"; s.styles = "ST-07"; s.layouts = "LO-05"; s.sizes = "SZ-02"; s.decors = "DC-01";
        return s;
      }
    },
    "detail-zoom": {
      zh: "细节特写",
      desc: "推到微距：单物件 + 平铺构图，群像与叙事版式退场",
      preserve: ["subjects", "characters", "worlds", "styles", "regions", "lights"],
      change: ["shots", "layouts", "media"],
      forbid: ["微距不接群像版式（CF-08）"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        s.shots = "SH-11"; s.layouts = "LO-11"; s.media = "MD-08";
        return s;
      }
    },
    "frame-shift": {
      zh: "换画幅",
      desc: "沿画幅链走一格：方→3:4→16:9→9:16→2:3→21:9",
      preserve: ["media", "subjects", "characters", "worlds", "styles", "regions", "shots", "lights"],
      change: ["sizes", "layouts"],
      forbid: ["9:16 全屏竖不接宽画幅版式（CF-01）"],
      apply: function (sel) {
        var s = Object.assign({}, sel);
        var cur = s.sizes || "SZ-02";
        for (var t = 0; t < SIZE_CHAIN.length; t++) {
          var cand = nextInChain(SIZE_CHAIN, cur);
          cur = cand;
          var probe = Object.assign({}, s, { sizes: cand });
          if (conflicts(probe).length === 0) {
            s.sizes = cand;
            // 宽画幅配宽版式、全屏竖配竖版式，避免比例与版式互斥
            if (cand === "SZ-04" && (s.layouts === "LO-08" || s.layouts === "LO-06")) s.layouts = "LO-09";
            if ((cand === "SZ-03" || cand === "SZ-06") && s.layouts === "LO-09") s.layouts = "LO-08";
            return s;
          }
        }
        return s;
      }
    }
  };
  function applyOperator(sel, opId) {
    var op = OPERATORS[opId];
    if (!op) return null;
    return op.apply(normalize(sel));
  }

  /* ---------- 系列出图 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickFrom(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }
  /* 冲突感知抽签：在候选池里按随机序试抽，第一个不触雷的入选；
   * 全池都雷时退回随机值（调用方会显示警告，不静默）。 */
  function pickClean(pool, sel, rnd) {
    var order = pool.slice();
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (var k = 0; k < order.length; k++) {
      var probe = Object.assign({}, sel);
      var d = dimOf(order[k]);
      if (!d) continue;
      probe[d] = order[k];
      if (conflicts(probe).length === 0) return order[k];
    }
    return pickFrom(pool, rnd);
  }
  function seriesRoleById(id) {
    for (var i = 0; i < data.series.roles.length; i++) if (data.series.roles[i].id === id) return data.series.roles[i];
    return null;
  }
  function themeById(id) {
    for (var i = 0; i < data.series.themes.length; i++) if (data.series.themes[i].id === id) return data.series.themes[i];
    return null;
  }
  function paletteOf(styleId) {
    if (!data.palettes || !data.palettes.items) return null;
    for (var i = 0; i < data.palettes.items.length; i++) {
      if (data.palettes.items[i].style === styleId) return data.palettes.items[i];
    }
    return null;
  }
  /* buildSeries(theme, count, opts)：
   * theme 可以是 TH-xx 主题 id、任意中文/英文字符串（原文注入）。
   * 全组统一：风格（主题指定或用户锁）、配色卡（由风格派生）、题材/角色/世界/地区（一次抽定，系列内复用）。
   * 每张卡 = 一个角色的分工（主视觉/角色卡/场景卡/道具卡/情节帧/徽标收尾）+ 角色范围内的随机配套。 */
  function buildSeries(theme, count, opts) {
    var o = opts || {};
    var rnd = mulberry32(o.seed == null ? 20261022 : o.seed);
    var th = (typeof theme === "string" && /^TH-\d\d$/.test(theme)) ? themeById(theme) : null;
    var themeZh = th ? th.zh : String(theme || "").trim();
    var themeEn = th ? th.en : (themeZh ? themeZh : "original theme");
    // 关键词锁定：只锁用户点名过的维度，其余照常抽
    var lock = o.keywords ? matchKeywords(o.keywords) : {};
    var styleId = o.style || (th ? th.style : (lock.styles ? lock.styles.id : "ST-01"));
    var subjectId = o.subject || (th ? th.subject : (lock.subjects ? lock.subjects.id : pickFrom(data.subjects.items, rnd).id));
    var characterId = o.character || (th ? pickFrom(th.characters, rnd).id : (lock.characters ? lock.characters.id : pickFrom(data.characters.items, rnd).id));
    var worldId = o.world || (th ? pickFrom(th.worlds, rnd).id : (lock.worlds ? lock.worlds.id : pickFrom(data.worlds.items, rnd).id));
    // 地区一次抽定（CF-06 守卫：水墨传统年代不配霓虹/三维）
    var regionId = o.region || pickFrom(data.regions.items.filter(function (r) {
      return !(r.id === "RG-11" && (styleId === "ST-14" || styleId === "ST-11"));
    }), rnd).id;
    var pal = paletteOf(styleId);
    var roleIds = data.series.sets[String(count)] || data.series.sets["4"];
    // 张数夹紧：低于最小回落 3 张，高于最大回落 6 张
    var counts = data.series.counts || [3, 4, 5, 6];
    var minC = Math.min.apply(null, counts), maxC = Math.max.apply(null, counts);
    if (count < minC) count = minC;
    if (count > maxC) count = maxC;
    roleIds = data.series.sets[String(count)] || data.series.sets["4"];
    var cards = roleIds.map(function (rid) {
      var role = seriesRoleById(rid);
      var sel = {
        sizes: pickFrom(role.sizes, rnd),
        media: pickFrom(role.media, rnd),
        subjects: subjectId, characters: characterId, worlds: worldId,
        shots: pickFrom(role.shots, rnd),
        lights: pickFrom(role.lights, rnd),
        styles: styleId, regions: regionId,
        layouts: pickFrom(role.layouts, rnd)
      };
      // 逐位冲突感知重抽：风格/地区/题材已定，role 池里挑不触雷的配套
      ["sizes", "shots", "lights", "layouts"].forEach(function (d) {
        var pool = role[d];
        if (pool && pool.length > 1) sel[d] = pickClean(pool, sel, rnd);
      });
      var r = compose(sel, { theme: themeEn });
      var title = role.titleFormula.indexOf("{theme}") !== -1
        ? role.titleFormula.replace(/\{theme\}/g, themeZh)
        : themeZh + " · " + role.titleFormula;
      return {
        role: role.id, zh: role.zh, job: role.job,
        title: title,
        copyGuide: role.copyGuide, why: role.why,
        sel: r.sel, prompt: r.prompt, zhList: r.zh, warnings: r.warnings
      };
    });
    return {
      theme: themeZh, themeEn: themeEn, count: cards.length,
      style: { id: styleId, zh: index.styles[styleId] ? index.styles[styleId].zh : styleId },
      palette: pal, region: { id: regionId, zh: index.regions[regionId] ? index.regions[regionId].zh : regionId },
      subject: { id: subjectId, zh: index.subjects[subjectId] ? index.subjects[subjectId].zh : subjectId },
      character: { id: characterId, zh: index.characters[characterId] ? index.characters[characterId].zh : characterId },
      world: { id: worldId, zh: index.worlds[worldId] ? index.worlds[worldId].zh : worldId },
      cards: cards
    };
  }

  /* ---------- 文本拆解与语义匹配 ----------
   * 三件事：
   *   parseScript(text)  短剧/文案 → 段落块（有空行按段，无空行按句）
   *   matchKeywords(kw)  关键词串 → 维度锁定（短词，查询覆盖为主）
   *   matchText(text)    任意文本 → 维度建议（长文本，条目覆盖为主）
   * 匹配原理：中文 2-gram 双边归一化打分（查询覆盖率 × 条目覆盖率）+ 英文整词交集。
   * 条目核心 gram 只取 zh（短且准），note 只用于整串包含判断——否则长 note 稀释覆盖率。 */
  var STOP_CH = "的了是在有和就都而及与也很不我你他她它们个么什么可以能会要想说去来被把让给对从向到过吗呢吧啊哦嗯很更最又再才只都";
  function cnGrams(s) {
    var out = [], m, re = /[\u4e00-\u9fff]+/g, run, i;
    while ((m = re.exec(String(s || "")))) {
      run = m[0];
      for (i = 0; i + 2 <= run.length; i++) {
        var g = run.slice(i, i + 2);
        if (STOP_CH.indexOf(g.charAt(0)) !== -1 || STOP_CH.indexOf(g.charAt(1)) !== -1) continue;
        out.push(g);
      }
    }
    return out;
  }
  var STOP_EN = { the: 1, a: 1, an: 1, of: 1, with: 1, and: 1, in: 1, on: 1, at: 1, to: 1, for: 1, no: 1, its: 1, it: 1, is: 1, as: 1, by: 1, from: 1, that: 1, this: 1, be: 1, are: 1, was: 1 };
  function enWords(s) {
    var out = [], m, re = /[A-Za-z][A-Za-z'-]{2,}/g, w;
    while ((m = re.exec(String(s || "")))) {
      w = m[0].toLowerCase();
      if (!STOP_EN[w]) out.push(w);
    }
    return out;
  }
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  // 匹配索引：每个维度每个条目一份核心 gram + 别名 gram + 英文词 + 整串文本
  var MATCH_INDEX = null;
  function matchIndex() {
    if (MATCH_INDEX) return MATCH_INDEX;
    MATCH_INDEX = {};
    DIM_KEYS.forEach(function (d) {
      var rows = [];
      data[d].items.forEach(function (it) {
        var kwGrams = [];
        (it.kw || []).forEach(function (w) { kwGrams = kwGrams.concat(cnGrams(w)); });
        kwGrams = uniq(kwGrams);
        var core = uniq(cnGrams(it.zh).concat(cnGrams(it.kw || "")));
        rows.push({
          id: it.id, zh: it.zh,
          core: core, coreSet: core.reduce(function (m, g) { m[g] = 1; return m; }, {}),
          kwSet: kwGrams.reduce(function (m, g) { m[g] = 1; return m; }, {}),
          text: String(it.zh || "") + " " + String(it.note || ""),
          words: enWords(String(it.en || "") + " " + String(it.prompt || "")).reduce(function (m, w) { m[w] = 1; return m; }, {})
        });
      });
      MATCH_INDEX[d] = rows;
    });
    return MATCH_INDEX;
  }
  function scoreItem(row, qSet, qG, qWords, text, strict) {
    if (text && row.text && text.indexOf(row.zh) !== -1) return 1.2; // 整串命中：最强信号
    var hit = 0;
    for (var i = 0; i < row.core.length; i++) if (qSet[row.core[i]]) hit++;
    // 别名强信号：用户口语词命中 kw 声明的词，比 zh 拆出来的 gram 可信得多
    // （"机甲少女"要落到机甲题材而不是魔法少女，靠的就是这一条）
    var kwHit = 0;
    for (var k in row.kwSet) if (qSet[k]) kwHit++;
    var enHit = false;
    for (var j = 0; j < qWords.length; j++) if (row.words[qWords[j]]) { enHit = true; break; }
    if (!hit) return (kwHit || enHit) ? 0.9 + Math.min(0.2, kwHit * 0.1) : 0;
    var iCov = hit / row.core.length;
    var qCov = hit / Math.max(1, qG.length);
    var s;
    if (hit === 1) {
      // 单个 gram 命中：短词靠查询覆盖背书（"机甲"→机甲题材），长句靠条目够短背书
      if (strict) s = qCov * 0.9 + iCov * 0.1;
      else {
        if (row.core.length > 4) return (kwHit || enHit) ? 0.9 : 0;
        s = iCov * 0.85 + qCov * 0.15;
      }
    } else {
      s = strict ? (qCov * 0.65 + iCov * 0.35) : (iCov * 0.7 + qCov * 0.3);
    }
    if (kwHit) s += kwHit >= 2 ? 0.7 : 0.5;
    if (enHit) s += 0.15;
    return s;
  }
  /* matchText(text, opts)
   * opts.mode: "strict" 短词（查询覆盖为主，阈值 0.5）| "loose" 长文本（条目覆盖为主，阈值 0.42）
   * 返回 {dim: {id, score, zh}}，每个维度最多一个命中。 */
  function matchText(text, opts) {
    var o = opts || {};
    var t = String(text || "").trim();
    if (!t) return {};
    var strict = o.mode !== "loose";
    var qG = uniq(cnGrams(t));
    var qWords = uniq(enWords(t));
    if (!qG.length && !qWords.length) return {};
    var qSet = qG.reduce(function (m, g) { m[g] = 1; return m; }, {});
    var idx = matchIndex(), out = {};
    DIM_KEYS.forEach(function (d) {
      var best = null;
      idx[d].forEach(function (row) {
        var s = scoreItem(row, qSet, qG, qWords, t, strict);
        if (s <= 0) return;
        if (!best || s > best.score + 1e-9) best = { id: row.id, score: s, zh: row.zh };
      });
      if (best && best.score >= (strict ? 0.5 : 0.42)) out[d] = best;
    });
    return out;
  }
  /* matchKeywords(kw)：关键词串（逗号/顿号/分号/空格/换行分隔）→ 维度锁定。
   * 每个词独立打分，某维度取所有词里的最高分。 */
  function matchKeywords(kw) {
    var words = String(kw || "").split(/[,，、;；\s]+/).map(function (w) { return w.trim(); }).filter(Boolean);
    if (!words.length) return {};
    var perWord = words.map(function (w) { return matchText(w, { mode: "strict" }); });
    var out = {};
    perWord.forEach(function (m) {
      Object.keys(m).forEach(function (d) {
        if (!out[d] || m[d].score > out[d].score) out[d] = m[d];
      });
    });
    return out;
  }

  /* parseScript(text, opts)：短剧/文案 → 段落块
   * opts.mode: "auto"（默认，有空行按段、无空行按句）| "para" 强制按段 | "sent" 强制按句 */
  function splitSentences(t) {
    var lines = String(t || "").split(/[\n\r]+/).map(function (l) { return l.trim(); }).filter(Boolean);
    var out = [];
    lines.forEach(function (line) {
      var raw = line.split(/([。！？!?…；;])/);
      for (var i = 0; i < raw.length; i += 2) {
        var s = ((raw[i] || "") + (raw[i + 1] || "")).trim();
        if (s) out.push(s);
      }
    });
    return out;
  }
  function parseScript(text, opts) {
    var o = opts || {};
    var mode = o.mode || "auto";
    var t = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!t) return [];
    var hasBlank = /\n[ \t]*\n/.test(t);
    var blocks, kind;
    if (mode === "sent" || (mode === "auto" && !hasBlank)) { blocks = splitSentences(t); kind = "sent"; }
    else { blocks = t.split(/\n[ \t]*\n+/).map(function (b) { return b.trim(); }).filter(Boolean); kind = "para"; }
    return blocks.map(function (b, i) { return { index: i, text: b, kind: kind }; });
  }
  function scriptRoleById(id) {
    var roles = data.series.scriptRoles || [];
    for (var i = 0; i < roles.length; i++) if (roles[i].id === id) return roles[i];
    return null;
  }
  /* 幕次分配：段数 → 叙事顺序的幕次角色序列（建立→亮相→推进→高潮→收尾） */
  function pickActs(n) {
    var order = data.series.actOrder || {};
    if (n <= 5) return (order[String(n)] || ["SR-S1"]).slice(0, n);
    var mid = [];
    for (var i = 0; i < n - 4; i++) mid.push("SR-S3");
    return ["SR-S1", "SR-S2"].concat(mid, ["SR-S4", "SR-S5"]);
  }
  /* scriptToSeries(theme, keywords, script, opts)
   * 主题定基调（可用 TH-xx 预设或自由文本），关键词锁维度，文案拆段一段一张。
   * 全组统一：风格 / 配色 / 地区；段落里明确提到的场景·角色·光影可逐段覆盖。
   * opts.locks：逐段预锁（数组，按段落序）。抽卡场景用——生成器本来就知道每段配了谁，
   * 不该指望从文本反推（story 词是短词，反推会与别的条目打架）。 */
  function scriptToSeries(theme, keywords, script, opts) {
    var o = opts || {};
    var blocks = parseScript(script, { mode: o.mode || "auto" });
    if (!blocks.length) return null;
    var rnd = mulberry32(o.seed == null ? 20261022 : o.seed);
    var th = (typeof theme === "string" && /^TH-\d\d$/.test(theme)) ? themeById(theme) : null;
    var themeZh = th ? th.zh : String(theme || "").trim();
    var themeEn = o.themeEn || (th ? th.en : (themeZh || "original theme"));
    var lock = matchKeywords(keywords);
    var styleId = o.style || (th ? th.style : (lock.styles ? lock.styles.id : pickFrom(data.styles.items, rnd).id));
    var subjectId = o.subject || (th ? th.subject : (lock.subjects ? lock.subjects.id : pickFrom(data.subjects.items, rnd).id));
    var characterId = o.character || (th ? pickFrom(th.characters, rnd).id : (lock.characters ? lock.characters.id : pickFrom(data.characters.items, rnd).id));
    var worldId = o.world || (th ? pickFrom(th.worlds, rnd).id : (lock.worlds ? lock.worlds.id : pickFrom(data.worlds.items, rnd).id));
    var regionId = o.region || pickFrom(data.regions.items.filter(function (r) {
      return !(r.id === "RG-11" && (styleId === "ST-14" || styleId === "ST-11"));
    }), rnd).id;
    var pal = paletteOf(styleId);
    var actIds = pickActs(blocks.length);
    // 叙事继承：段落没明说的角色/场景/光影沿用上一段，短剧才像一部片子而不是一组散图
    var carry = { subjects: null, characters: null, worlds: null, lights: null };
    var preLocks = o.locks || [];
    var cards = blocks.map(function (b, i) {
      var role = scriptRoleById(actIds[i]) || scriptRoleById("SR-S1");
      var local = matchText(b.text, { mode: "loose" });
      // 逐段预锁（抽卡用）：生成器知道每段配了谁，比文本反推可靠
      var pre = preLocks[i] || {};
      var subjects = pre.subjects || (local.subjects || lock.subjects || { id: subjectId }).id;
      var characters = pre.characters || (local.characters || lock.characters || { id: carry.characters || characterId }).id;
      var worlds = pre.worlds || (local.worlds || lock.worlds || { id: carry.worlds || worldId }).id;
      var lights = pre.lights || (local.lights ? local.lights.id
        : (lock.lights ? lock.lights.id : (carry.lights || pickFrom(role.lights, rnd))));
      var sel = {
        sizes: pickFrom(role.sizes, rnd),
        media: pickFrom(role.media, rnd),
        subjects: subjects, characters: characters, worlds: worlds,
        shots: pre.shots || (local.shots ? local.shots.id : pickFrom(role.shots, rnd)),
        lights: lights,
        styles: styleId, regions: regionId,
        layouts: pickFrom(role.layouts, rnd)
      };
      carry.subjects = subjects; carry.characters = characters;
      carry.worlds = worlds; carry.lights = lights;
      // 逐位冲突感知重抽：只动幕次池维度。
      // 已被段落明确指定、被关键词锁定、被预锁、或从上一段继承来的维度不再重抽（重抽会覆盖用户意图）
      var lockedDims = {};
      ["subjects", "characters", "worlds", "lights", "shots"].forEach(function (d) {
        if (local[d] || lock[d] || pre[d] || carry[d]) lockedDims[d] = true;
      });
      ["sizes", "shots", "lights", "layouts"].forEach(function (d) {
        if (lockedDims[d]) return;
        var pool = role[d];
        if (pool && pool.length > 1) sel[d] = pickClean(pool, sel, rnd);
      });
      var r = compose(sel, { theme: themeEn, freeText: b.text ? "scene: " + b.text : "" });
      var title = role.titleFormula.indexOf("{theme}") !== -1
        ? role.titleFormula.replace(/\{theme\}/g, themeZh)
        : themeZh + " · " + role.titleFormula;
      return {
        role: role.id, zh: role.zh, job: role.job,
        title: title + " · 第" + (i + 1) + "段",
        copyGuide: role.copyGuide, why: role.why,
        text: b.text, kind: b.kind,
        sel: r.sel, prompt: r.prompt, zhList: r.zh, warnings: r.warnings
      };
    });
    return {
      theme: themeZh, themeEn: themeEn, count: cards.length,
      mode: blocks[0].kind,
      style: { id: styleId, zh: index.styles[styleId] ? index.styles[styleId].zh : styleId },
      palette: pal, region: { id: regionId, zh: index.regions[regionId] ? index.regions[regionId].zh : regionId },
      subject: { id: subjectId, zh: index.subjects[subjectId] ? index.subjects[subjectId].zh : subjectId },
      character: { id: characterId, zh: index.characters[characterId] ? index.characters[characterId].zh : characterId },
      world: { id: worldId, zh: index.worlds[worldId] ? index.worlds[worldId].zh : worldId },
      cards: cards
    };
  }

  /* ---------- 短剧抽卡（随机生成一部短剧文案） ----------
   * 从 data/scripts.json 的剧本骨架池里抽一条，把角色/场景/光影用维度词条的中文名填进去。
   * 关键是填维度词条的**原名**：生成出来的文案天然带着可识别的维度线索，
   * scriptToSeries 匹配时能直接锁住，抽出来的分镜才是一套而不是散图。 */
  var VILLAIN_POOL = ["CH-06", "CH-16", "CH-10", "CH-13"];
  function fillTemplate(tpl, vars) {
    // 占位符名是中文（{主角}/{场景}…），不能用 \w——JS 的 \w 只认 ASCII 字母数字下划线
    return String(tpl).replace(/\{([^}]+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }
  function randomScript(opts) {
    var o = opts || {};
    var sc = data.scripts;
    if (!sc || !sc.premises || !sc.premises.length) return null;
    var rnd = mulberry32(o.seed == null ? 20261022 : o.seed);
    var premise = pickFrom(sc.premises, rnd);
    // 关键词锁定：用户点名过的维度优先（抽卡也尊重用户意图）
    var lock = o.keywords ? matchKeywords(o.keywords) : {};
    var chars = data.characters.items;
    var hero = (lock.characters && index.characters[lock.characters.id])
      ? index.characters[lock.characters.id]
      : pickFrom(chars, rnd);
    var rest = chars.filter(function (c) { return c.id !== hero.id; });
    var villainPool = rest.filter(function (c) { return VILLAIN_POOL.indexOf(c.id) !== -1; });
    var villain = (villainPool.length && rnd() < 0.7) ? pickFrom(villainPool, rnd) : pickFrom(rest, rnd);
    var ally = pickFrom(rest.filter(function (c) { return c.id !== villain.id; }), rnd);
    var worlds = data.worlds.items;
    var w1 = (lock.worlds && index.worlds[lock.worlds.id])
      ? index.worlds[lock.worlds.id]
      : pickFrom(worlds, rnd);
    var w2 = pickFrom(worlds.filter(function (w) { return w.id !== w1.id; }), rnd);
    var lights = data.lights.items;
    var l1 = (lock.lights && index.lights[lock.lights.id])
      ? index.lights[lock.lights.id]
      : pickFrom(lights, rnd);
    var l2 = pickFrom(lights.filter(function (l) { return l.id !== l1.id; }), rnd);
    var l3 = pickFrom(lights.filter(function (l) { return l.id !== l1.id && l.id !== l2.id; }), rnd);
    var nouns = sc.nouns || {};
    // story：该词条在中文叙事句里最自然的说法（词源限定在 zh/kw 内，匹配器照样锁得住）
    // 关键词命中的维度用关键词原词（"魔法少女"比"少女"信息更多），其余用 story
    var kwHit = lock;
    var say = function (dim, id) {
      var it = index[dim][id];
      if (!it) return id;
      var h = kwHit && kwHit[dim] && kwHit[dim].id === id ? kwHit[dim] : null;
      if (h && h.zh) return h.zh;
      return it.story || it.zh;
    };
    var vars = {
      "主角": say("characters", hero.id), "配角": say("characters", ally.id), "对手": say("characters", villain.id),
      "场景": say("worlds", w1.id), "场景2": say("worlds", w2.id),
      "光影": say("lights", l1.id), "光影2": say("lights", l2.id), "光影3": say("lights", l3.id),
      "道具": pickFrom(nouns.props || ["一件旧物"], rnd),
      "时间": pickFrom(nouns.times || ["黄昏"], rnd),
      "天气": pickFrom(nouns.weathers || ["细雨"], rnd),
      "声音": pickFrom(nouns.sounds || ["远处的声响"], rnd)
    };
    var text = premise.beats.map(function (b) { return fillTemplate(b, vars); }).join("\n\n");
    // 全组统一项：风格与题材一次抽定，分镜整套一个调子
    var style = (lock.styles && index.styles[lock.styles.id])
      ? index.styles[lock.styles.id]
      : pickFrom(data.styles.items, rnd);
    var subject = (lock.subjects && index.subjects[lock.subjects.id])
      ? index.subjects[lock.subjects.id]
      : pickFrom(data.subjects.items, rnd);
    /* 逐段锁：生成器本来就知道每段配了谁/在哪/什么光。
     * 不靠文本反推——story 是短词（「面具客」「逆光」），反推会和别的条目打架。 */
    var actPlan = [
      { characters: hero.id, worlds: w1.id, lights: l1.id },
      { characters: ally.id, worlds: w1.id, lights: l1.id },
      { characters: hero.id, worlds: w2.id, lights: l2.id },
      { characters: villain.id, worlds: w2.id, lights: l2.id },
      { characters: hero.id, worlds: w2.id, lights: l3.id }
    ];
    return {
      premise: premise.id, title: premise.zh, logline: premise.logline,
      theme: premise.zh, themeEn: premise.en,
      text: text, locks: actPlan,
      cast: { hero: hero.id, ally: ally.id, villain: villain.id },
      scenes: { a: w1.id, b: w2.id },
      lights: { a: l1.id, b: l2.id, c: l3.id },
      style: style.id, subject: subject.id
    };
  }

  /* ---------- 约束随机 ---------- */
  function random(lock) {
    var l = normalize(lock), s = {}, i, n;
    for (var t = 0; t < 40; t++) {
      DIM_KEYS.forEach(function (d) {
        var items = data[d].items;
        s[d] = items[Math.floor(Math.random() * items.length)].id;
      });
      Object.keys(l).forEach(function (k) { s[k] = l[k]; });
      if (conflicts(s).length === 0) return s;
    }
    Object.keys(l).forEach(function (k) { s[k] = l[k]; });
    return s; // 40 次仍冲突：返回最后一次（调用方会显示警告）
  }

  /* ---------- 盘点与缺口 ---------- */
  function stats() {
    var total = 0, combos = 1, per = {};
    DIM_KEYS.forEach(function (d) {
      var n = data[d].items.length; total += n; combos *= n;
      per[d] = { zh: data[d].zh, n: n };
    });
    return { entries: total, combos: combos, per: per,
      cases: data.cases.items.length, templates: data.templates.items.length,
      conflicts: data.conflicts.conflicts.length,
      palettes: data.palettes && data.palettes.items ? data.palettes.items.length : 0,
      seriesRoles: data.series.roles.length, seriesThemes: data.series.themes.length,
      entities: data.entities.entities.length, relations: data.entities.relations.length,
      gallerySlots: data.gallery && data.gallery.slots ? data.gallery.slots.length : 0 };
  }
  function gaps() {
    var used = {}, list = [];
    function mark(id) { used[id] = (used[id] || 0) + 1; }
    data.cases.items.forEach(function (cs) {
      Object.keys(cs.recipe).forEach(function (k) {
        var v = cs.recipe[k];
        (Array.isArray(v) ? v : [v]).forEach(mark);
      });
    });
    data.templates.items.forEach(function (tp) {
      Object.keys(tp.fills || {}).forEach(function (k) { mark(tp.fills[k]); });
    });
    // 画廊预留位自带完整配方，同样算「被引用」（不认它会虚报缺口）
    var gal = data.gallery && data.gallery.slots ? data.gallery.slots : [];
    gal.forEach(function (sl) {
      if (!sl.recipe) return;
      Object.keys(sl.recipe).forEach(function (k) { mark(sl.recipe[k]); });
    });
    DIM_KEYS.forEach(function (d) {
      var unused = data[d].items.filter(function (it) { return !used[it.id]; })
        .map(function (it) { return it.id; });
      if (unused.length) list.push({ dim: d, zh: data[d].zh, unused: unused });
    });
    var untested = data.cases.items.filter(function (cs) { return cs.tested === false; }).length;
    var slotsFilled = 0;
    return { unusedByCaseOrTpl: list, untestedCases: untested,
      gallerySlots: gal.length, gallerySlotFilled: slotsFilled,
      testedCases: data.cases.items.length - untested };
  }

  /* ---------- 分享码（AVX1.） ---------- */
  var SHARE_PREFIX = "AVX1.";
  function b64enc(str) {
    if (typeof TextEncoder !== "undefined") {
      var bytes = new TextEncoder().encode(str), bin = "";
      bytes.forEach(function (b) { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    return Buffer.from(str, "utf8").toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64dec(code) {
    var s = String(code).replace(/-/g, "+").replace(/_/g, "/");
    if (typeof TextDecoder !== "undefined") {
      var bin = atob(s), bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(s, "base64").toString("utf8");
  }
  function encodeShare(state) {
    var s = normalize(state.sel || {});
    var payload = { v: 1, sel: s };
    if (state.freeText && String(state.freeText).trim()) payload.freeText = String(state.freeText).trim();
    return SHARE_PREFIX + b64enc(JSON.stringify(payload));
  }
  function decodeShare(code) {
    var c = String(code || "").trim();
    if (c.indexOf(SHARE_PREFIX) !== 0) throw new Error("不是有效的 AVX1. 分享码");
    var payload = JSON.parse(b64dec(c.slice(SHARE_PREFIX.length)));
    if (!payload || typeof payload !== "object" || !payload.sel) throw new Error("分享码内容不完整");
    return { sel: normalize(payload.sel), freeText: payload.freeText || "" };
  }

  /* ---------- 实体参考层（全球地图页） ---------- */
  function entityById(id) {
    for (var i = 0; i < data.entities.entities.length; i++) {
      if (data.entities.entities[i].id === id) return data.entities.entities[i];
    }
    return null;
  }
  function relationsOf(id) {
    return data.entities.relations.filter(function (r) { return r.from === id || r.to === id; })
      .map(function (r) { return r; });
  }
  var REL_ZH = { influenced: "受影响于", student_of: "师承", style_origin: "风格源头", rival: "对手", successor: "继承者" };

  return {
    data: data, DIM_KEYS: DIM_KEYS, ASM_ORDER: ASM_ORDER, FOOTER: FOOTER,
    KEY2DIM: KEY2DIM, index: index, byId: byId, dimOf: dimOf,
    compose: compose, conflicts: conflicts, changesList: changesList,
    OPERATORS: OPERATORS, applyOperator: applyOperator,
    buildSeries: buildSeries, seriesRoleById: seriesRoleById, themeById: themeById, paletteOf: paletteOf,
    parseScript: parseScript, matchText: matchText, matchKeywords: matchKeywords,
    scriptToSeries: scriptToSeries, scriptRoleById: scriptRoleById, pickActs: pickActs,
    randomScript: randomScript,
    random: random, stats: stats, gaps: gaps,
    SHARE_PREFIX: SHARE_PREFIX, encodeShare: encodeShare, decodeShare: decodeShare,
    entityById: entityById, relationsOf: relationsOf, REL_ZH: REL_ZH
  };
});
