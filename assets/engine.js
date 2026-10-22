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
    DIM_KEYS.concat(["series", "cases", "conflicts", "templates", "palettes", "entities"]).forEach(function (n) {
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
    var styleId = o.style || (th ? th.style : "ST-01");
    var subjectId = o.subject || (th ? th.subject : pickFrom(data.subjects.items, rnd).id);
    var characterId = o.character || (th ? pickFrom(th.characters, rnd) : pickFrom(data.characters.items, rnd).id);
    var worldId = o.world || (th ? pickFrom(th.worlds, rnd) : pickFrom(data.worlds.items, rnd).id);
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
      entities: data.entities.entities.length, relations: data.entities.relations.length };
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
    DIM_KEYS.forEach(function (d) {
      var unused = data[d].items.filter(function (it) { return !used[it.id]; })
        .map(function (it) { return it.id; });
      if (unused.length) list.push({ dim: d, zh: data[d].zh, unused: unused });
    });
    var untested = data.cases.items.filter(function (cs) { return cs.tested === false; }).length;
    return { unusedByCaseOrTpl: list, untestedCases: untested,
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
    random: random, stats: stats, gaps: gaps,
    SHARE_PREFIX: SHARE_PREFIX, encodeShare: encodeShare, decodeShare: decodeShare,
    entityById: entityById, relationsOf: relationsOf, REL_ZH: REL_ZH
  };
});
