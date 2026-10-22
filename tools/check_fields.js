#!/usr/bin/env node
/* 字段体检：查条目质量（与 check_cases 分工——那个查引用与覆盖，这个查字）。
 * 查什么：id 格式/重复、空字段、prompt 混中文、中文名混英文单词（中英串味）、
 *          坏字符、配色卡字段、系列池引用、模板 fills、冲突三件套、实体授权。
 * 不保证什么：提示词出图效果。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIMS = ["regions", "styles", "media", "subjects", "characters",
  "worlds", "shots", "lights", "layouts", "sizes", "decors"];
const errors = [];

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", name + ".json"), "utf8"));
}
const data = {};
DIMS.concat(["series", "cases", "conflicts", "templates", "palettes", "entities", "gallery", "scripts"]).forEach(d => { data[d] = load(d); });

// 坏字符：西里尔、零宽、BOM、非 ASCII 控制符
function badChars(s) {
  const hits = [];
  if (/[\u0400-\u04FF]/.test(s)) hits.push("西里尔字母");
  if (/[\u200B-\u200F\uFEFF]/.test(s)) hits.push("零宽字符");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) hits.push("控制符");
  return hits;
}

const knownIds = {};
const idOwner = {};
// 有 story 字段的维度：中文叙事句里要用的自然说法（短剧抽卡填文案靠它）
// 注意：角色不用 story——「少年主角」这类名字本身读得通，削成「少年」反而丢信息
const STORY_DIMS = ["worlds", "lights"];
// 2-gram 切分（含停用字过滤，与引擎 matchIndex 的 cnGrams 同规则）
const STOP_CH = "的了是在有和就都而及与也很不我你他她它们个么什么可以能会要想说去来被把让给对从向到过吗呢吧啊哦嗯很更最又再才只都";
function cnGrams2(s) {
  const out = [];
  const runs = String(s || "").match(/[\u4e00-\u9fff]+/g) || [];
  runs.forEach(function (run) {
    for (let i = 0; i + 2 <= run.length; i++) {
      const g = run.slice(i, i + 2);
      if (STOP_CH.indexOf(g[0]) !== -1 || STOP_CH.indexOf(g[1]) !== -1) continue;
      out.push(g);
    }
  });
  return out;
}
DIMS.forEach(d => {
  data[d].items.forEach(it => {
    if (knownIds[it.id]) { errors.push(it.id + " id 跨维度重复（已有 " + idOwner[it.id] + "）"); return; }
    knownIds[it.id] = true; idOwner[it.id] = d;
    if (!/^[A-Z]{2}-\d{2}$/.test(it.id)) errors.push(it.id + " id 格式非法（应为两位字母-两位数字）");
    ["zh", "prompt"].forEach(f => {
      if (!it[f] || !it[f].trim()) errors.push(it.id + " 字段 " + f + " 为空");
      else badChars(it[f]).forEach(h => errors.push(it.id + " 字段 " + f + " 含" + h));
    });
    if (/[\u4e00-\u9fff]/.test(it.prompt)) errors.push(it.id + " prompt 混入中文（prompt 必须是英文视觉指令）");
    if (it.prompt && it.prompt !== it.prompt.trim()) errors.push(it.id + " prompt 首尾有空白");
    // 词面层禁真实品牌/作品/角色名——这一层会直接送进出图模型。
    // R2/R3 实体只许待在参考层（entities.json），且要先做 deid 视觉等价替换。
    // 注意：kw 检索别名不受此限（kw 只做匹配，绝不进词面），品牌名当检索入口是合理的。
    var BRAND_IN_PROMPT = /disney|disney|pixar|ghibli|miyazaki|toei|warn\s+bros|universal\s+pictures|dreamworks|marvel|bandai|ghibli|nintendo|sega|akira|totoro|howl|spirited|evangelion|naruto|one\s+piece|detective\s+conan|pokemon|pok[eé]mon|final\s+fantasy|pokemon|\bGundam\b|\bGhibli\b|\bNezuko\b|\bNaruto\b|\bLuffy\b|\bSonic\s+the\s+Hedgehog\b|\bMario\b|\bZelda\b|\bPokemon\b/i;
    var brandHit = (it.prompt || "").match(BRAND_IN_PROMPT);
    if (brandHit) errors.push(it.id + " prompt 含真实品牌/作品名（词面层禁入，须先 deid）：" + brandHit[0]);
    // 中文名混英文单词（中英串味），专有名词白名单除外
    var WHITELIST = /\bQ\b|CG|VTuber|Live2D|OVA|VHS|ins|IP/gi;
    var rest = it.zh.replace(WHITELIST, "");
    if (/[A-Za-z]{3,}/.test(rest)) errors.push(it.id + " 中文名混入英文单词（中英串味）：" + it.zh);
    (it.children || []).forEach(function (ch, i) {
      var restC = String(ch).replace(WHITELIST, "");
      if (/[A-Za-z]{3,}/.test(restC)) errors.push(it.id + " children[" + i + "] 混入英文单词：" + ch);
    });
    // 检索别名：口语词入口，匹配器靠它区分同粒度候选（"机甲少女"要落到机甲而不是魔法）
    if (!Array.isArray(it.kw) || !it.kw.length) errors.push(it.id + " 缺 kw 检索别名");
    else {
      it.kw.forEach(function (w) {
        if (!String(w).trim()) errors.push(it.id + " kw 含空词");
        // 匹配索引只吃 2 字以上的中文词或 3 字母以上的英文词，短词永远匹配不上
        var cn = (String(w).match(/[\u4e00-\u9fff]/g) || []).length;
        var en = (String(w).match(/[A-Za-z]/g) || []).length;
        if (cn < 2 && en < 3) errors.push(it.id + " kw 词过短（匹配不到）：" + w);
      });
    }
    // story：中文叙事句里最自然的说法（短剧抽卡填文案用）。
    // 硬规则——story 的每个有效 2-gram 必须落在本条目的 zh 或 kw 里：
    // 否则匹配器锁不住这个维度，抽卡出来的分镜就散了。
    if (STORY_DIMS.indexOf(d) !== -1) {
      if (!it.story) errors.push(it.id + " 缺 story（中文叙事用词）");
      else {
        var srcGrams = {};
        cnGrams2(it.zh + " " + (it.kw || []).join(" ")).forEach(function (g) { srcGrams[g] = 1; });
        var miss = cnGrams2(it.story).filter(function (g) { return !srcGrams[g]; });
        if (miss.length) errors.push(it.id + " story「" + it.story + "」含本条目 zh/kw 之外的词：" + miss.join(","));
      }
    }
  });
});

// series：结构 + 池引用
var SER = data.series;
(SER.counts || []).forEach(function (n) {
  if (!SER.sets[String(n)]) errors.push("series.counts 含 " + n + " 但 sets 缺该档");
});
Object.keys(SER.sets).forEach(function (k) {
  SER.sets[k].forEach(function (rid) {
    if (!SER.roles.some(r => r.id === rid)) errors.push("series.sets[" + k + "] 引用不存在角色：" + rid);
  });
});
SER.roles.forEach(function (r) {
  if (!/^SR-\d{2}$/.test(r.id)) errors.push(r.id + " 角色 id 格式非法");
  if (!r.zh || !r.job || !r.why) errors.push(r.id + " 缺 zh/job/why");
  if (!r.titleFormula || !r.copyGuide) errors.push(r.id + " 缺 titleFormula/copyGuide");
  ["media", "shots", "layouts", "sizes", "lights"].forEach(function (f) {
    (r[f] || []).forEach(function (id) {
      if (!knownIds[id]) errors.push(r.id + " 池 " + f + " 引用不存在：" + id);
      else {
        var expect = { media: "media", shots: "shots", layouts: "layouts", sizes: "sizes", lights: "lights" }[f];
        if (idOwner[id] !== expect) errors.push(r.id + " 池 " + f + " 引用错维度：" + id + "（属于 " + idOwner[id] + "）");
      }
    });
  });
});
// series：幕次角色（短剧分镜用）+ 幕次分配表
var SCR = SER.scriptRoles || [];
if (SCR.length !== 5) errors.push("series.scriptRoles 应为 5 个幕次角色，实为 " + SCR.length);
SCR.forEach(function (r) {
  if (!/^SR-S\d$/.test(r.id)) errors.push(r.id + " 幕次角色 id 格式非法");
  if (!r.zh || !r.job || !r.why) errors.push(r.id + " 缺 zh/job/why");
  if (!r.titleFormula || !r.copyGuide) errors.push(r.id + " 缺 titleFormula/copyGuide");
  ["media", "shots", "layouts", "sizes", "lights"].forEach(function (f) {
    if (!(r[f] || []).length) errors.push(r.id + " 池 " + f + " 为空");
    (r[f] || []).forEach(function (id) {
      if (!knownIds[id]) errors.push(r.id + " 池 " + f + " 引用不存在：" + id);
      else {
        var expect = { media: "media", shots: "shots", layouts: "layouts", sizes: "sizes", lights: "lights" }[f];
        if (idOwner[id] !== expect) errors.push(r.id + " 池 " + f + " 引用错维度：" + id + "（属于 " + idOwner[id] + "）");
      }
    });
  });
});
Object.keys(SER.actOrder || {}).forEach(function (k) {
  (SER.actOrder[k] || []).forEach(function (rid) {
    if (!SCR.some(function (r) { return r.id === rid; })) errors.push("series.actOrder[" + k + "] 引用不存在幕次：" + rid);
  });
});
SER.themes.forEach(function (t) {
  if (!/^TH-\d{2}$/.test(t.id)) errors.push(t.id + " 主题 id 格式非法");
  if (!t.zh || !t.en) errors.push(t.id + " 缺 zh/en");
  if (/[\u4e00-\u9fff]/.test(t.en)) errors.push(t.id + " en 字段混入中文");
  if (!knownIds[t.style] || idOwner[t.style] !== "styles") errors.push(t.id + " style 引用不存在或错维度：" + t.style);
  if (!knownIds[t.subject] || idOwner[t.subject] !== "subjects") errors.push(t.id + " subject 引用不存在或错维度：" + t.subject);
  (t.characters || []).forEach(function (id) {
    if (!knownIds[id] || idOwner[id] !== "characters") errors.push(t.id + " characters 引用不存在或错维度：" + id);
  });
  (t.worlds || []).forEach(function (id) {
    if (!knownIds[id] || idOwner[id] !== "worlds") errors.push(t.id + " worlds 引用不存在或错维度：" + id);
  });
  (t.hooks || []).forEach(function (h, i) {
    if (/[\u4e00-\u9fff]/.test(h) === false) errors.push(t.id + " hooks[" + i + "] 不是中文：" + h);
  });
});

// cases：id / recipe 键值 / validates / tested
data.cases.items.forEach(cs => {
  if (!/^CS-\d{2}$/.test(cs.id)) errors.push(cs.id + " 案例 id 格式非法");
  if (!cs.zh || !cs.validates) errors.push(cs.id + " 缺 zh/validates");
  if (typeof cs.tested !== "boolean") errors.push(cs.id + " tested 必须是 boolean");
  var single = { region: "regions", style: "styles", media: "media", subject: "subjects", character: "characters", world: "worlds", shot: "shots", light: "lights", layout: "layouts", size: "sizes", decor: "decors" };
  Object.keys(cs.recipe || {}).forEach(k => {
    var d = single[k];
    if (!d) { errors.push(cs.id + " recipe 键非法：" + k); return; }
    if (!knownIds[cs.recipe[k]] || idOwner[cs.recipe[k]] !== d) {
      errors.push(cs.id + " recipe." + k + " 引用不存在或错维度：" + cs.recipe[k]);
    }
  });
});

// gallery：槽位 id / 配方引用 / 与案例的一致性
data.gallery.slots.forEach(sl => {
  if (!/^(CS|GL)-\d{2}$/.test(sl.id)) errors.push(sl.id + " 画廊槽位 id 格式非法（应为 CS-xx 或 GL-xx）");
  if (sl.case) {
    // 复用案例：必须真的存在该案例，且不自带 recipe（避免两处配方漂移）
    if (!data.cases.items.some(c => c.id === sl.case)) errors.push(sl.id + " 引用的案例不存在：" + sl.case);
    if (sl.recipe) errors.push(sl.id + " 复用了案例却自带 recipe（两处配方会漂移）");
    return;
  }
  if (!sl.zh || !sl.desc || !sl.validates) errors.push(sl.id + " 缺 zh/desc/validates");
  if (!sl.recipe) errors.push(sl.id + " 缺 recipe");
  // 槽位中文说明禁英文串味（与维度条目同一把尺）
  var wl = /\bQ\b|CG|VTuber|Live2D|OVA|VHS|ins|IP/gi;
  ["zh", "desc", "validates"].forEach(function (k) {
    var rest = String(sl[k] || "").replace(wl, "");
    if (/[A-Za-z]{3,}/.test(rest)) errors.push(sl.id + " " + k + " 混入英文单词（中英串味）：" + sl[k]);
  });
  var single = { region: "regions", style: "styles", media: "media", subject: "subjects", character: "characters", world: "worlds", shot: "shots", light: "lights", layout: "layouts", size: "sizes", decor: "decors" };
  Object.keys(sl.recipe || {}).forEach(k => {
    var d = single[k];
    if (!d) { errors.push(sl.id + " recipe 键非法：" + k); return; }
    if (!knownIds[sl.recipe[k]] || idOwner[sl.recipe[k]] !== d) {
      errors.push(sl.id + " recipe." + k + " 引用不存在或错维度：" + sl.recipe[k]);
    }
  });
});

// templates：fills 引用 + protect/checklist
data.templates.items.forEach(tp => {
  if (!/^TP-\d{2}$/.test(tp.id)) errors.push(tp.id + " 模板 id 格式非法");
  if (!tp.zh || !tp.desc) errors.push(tp.id + " 缺 zh/desc");
  if (!Array.isArray(tp.protect) || !tp.protect.length) errors.push(tp.id + " protect 为空（保护规则不可省）");
  if (!Array.isArray(tp.checklist) || !tp.checklist.length) errors.push(tp.id + " checklist 为空（检查清单不可省）");
  var single = { region: "regions", style: "styles", media: "media", subject: "subjects", character: "characters", world: "worlds", shot: "shots", light: "lights", layout: "layouts", size: "sizes", decor: "decors" };
  Object.keys(tp.fills || {}).forEach(k => {
    var d = single[k];
    if (!d) { errors.push(tp.id + " fills 键非法：" + k); return; }
    if (!knownIds[tp.fills[k]] || idOwner[tp.fills[k]] !== d) {
      errors.push(tp.id + " fills." + k + " 引用不存在或错维度：" + tp.fills[k]);
    }
  });
});

// palettes：style 必须存在、色值合法、引用链存在、每风格恰好一张
const styleIds = {};
data.styles.items.forEach(s => { styleIds[s.id] = true; });
data.palettes.items.forEach(pl => {
  if (!/^PL-\d{2}$/.test(pl.id)) errors.push(pl.id + " id 格式非法（应为 PL-两位数字）");
  if (!styleIds[pl.style]) errors.push(pl.id + " 指向不存在的风格：" + pl.style);
  if (!pl.styleZh || !pl.note || !pl.avoid) errors.push(pl.id + " 缺 styleZh / note / avoid");
  if (!Array.isArray(pl.swatches) || pl.swatches.length < 4 || pl.swatches.length > 6) {
    errors.push(pl.id + " 色卡应 4-6 色（收到 " + (pl.swatches || []).length + "）");
  }
  (pl.swatches || []).forEach(sw => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(sw.hex || "")) errors.push(pl.id + " 色值非法：" + sw.hex);
    if (!sw.name) errors.push(pl.id + " 色块缺名称");
  });
  (pl.suits || []).forEach(id => { if (!knownIds[id] || idOwner[id] !== "media") errors.push(pl.id + " suits 引用不存在或错维度：" + id); });
  (pl.scenes || []).forEach(id => { if (!knownIds[id] || idOwner[id] !== "worlds") errors.push(pl.id + " scenes 引用不存在或错维度：" + id); });
  (pl.lights || []).forEach(id => { if (!knownIds[id] || idOwner[id] !== "lights") errors.push(pl.id + " lights 引用不存在或错维度：" + id); });
});
data.styles.items.forEach(s => {
  var n = data.palettes.items.filter(pl => pl.style === s.id).length;
  if (n !== 1) errors.push(s.id + " " + s.zh + " 配色卡数量=" + n + "（每个风格都要有且只有一张）");
});

// conflicts：三件套 + 引用 + 同维不内战
data.conflicts.conflicts.forEach(r => {
  if (!/^CF-\d{2}$/.test(r.id)) errors.push(r.id + " 冲突 id 格式非法");
  if (!Array.isArray(r.when) || !r.when.length) errors.push(r.id + " 缺 when");
  if (!Array.isArray(r.notWith) || !r.notWith.length) errors.push(r.id + " 缺 notWith");
  if (!r.verdict || !r.why) errors.push(r.id + " 缺 verdict/why（冲突三件套缺一不可）");
  r.when.concat(r.notWith || []).forEach(id => {
    if (!knownIds[id]) errors.push(r.id + " 引用不存在：" + id);
  });
  (r.when || []).forEach(function (a) {
    (r.notWith || []).forEach(function (b) {
      if (idOwner[a] && idOwner[a] === idOwner[b]) errors.push(r.id + " 同维度内战无意义：" + a + " vs " + b);
    });
  });
});

// entities：授权分级 + 关系
const REL_TYPES = ["influenced", "student_of", "style_origin", "rival", "successor"];
data.entities.entities.forEach(e => {
  if (!/^EN-\d{2}$/.test(e.id)) errors.push(e.id + " 实体 id 格式非法");
  if (!e.zh || !e.kind || !e.desc) errors.push(e.id + " 缺 zh/kind/desc");
  if (["R0", "R1", "R2", "R3"].indexOf(e.rights) === -1) errors.push(e.id + " rights 非法：" + e.rights);
  if (!e.deid) errors.push(e.id + " 缺 deid（去标识化视觉描述，商业出图前的替换面）");
  if (/[\u4e00-\u9fff]/.test(e.deid)) errors.push(e.id + " deid 应英文");
});
const entIds = {};
data.entities.entities.forEach(e => { entIds[e.id] = true; });
data.entities.relations.forEach(r => {
  if (!entIds[r.from]) errors.push("关系 from 不存在：" + r.from);
  if (!entIds[r.to]) errors.push("关系 to 不存在：" + r.to);
  if (r.from === r.to) errors.push("关系自指：" + r.from);
  if (REL_TYPES.indexOf(r.type) === -1) errors.push("关系类型非法：" + r.type);
  if (!r.note) errors.push("关系缺 note：" + r.from + "→" + r.to);
});

// scripts：短剧剧本种子（抽卡素材）
var SCRIPTS = data.scripts;
if (!Array.isArray(SCRIPTS.premises) || !SCRIPTS.premises.length) errors.push("scripts.premises 为空（短剧抽卡没有素材）");
var ALLOWED_SLOTS = ["主角", "配角", "对手", "场景", "场景2", "光影", "光影2", "光影3", "道具", "时间", "天气", "声音"];
var NOUN_SLOTS = ["道具", "时间", "天气", "声音"];
SCRIPTS.premises.forEach(function (p) {
  if (!/^SP-\d{2}$/.test(p.id)) errors.push(p.id + " 剧本 id 格式非法（应为 SP-两位数字）");
  if (!p.zh || !p.en || !p.logline) errors.push(p.id + " 缺 zh/en/logline");
  if (/[\u4e00-\u9fff]/.test(p.en)) errors.push(p.id + " en 字段混入中文");
  if (!Array.isArray(p.beats) || p.beats.length < 3) errors.push(p.id + " beats 至少 3 段");
  (p.beats || []).forEach(function (b, i) {
    // 占位符名是中文，\w 只认 ASCII——必须用 [^}]+ 才能抓到（用 \w 等于没检查）
    var slots = b.match(/\{([^}]+)\}/g) || [];
    slots.forEach(function (s) {
      var k = s.slice(1, -1);
      if (ALLOWED_SLOTS.indexOf(k) === -1) errors.push(p.id + " beats[" + i + "] 占位符非法：" + s);
    });
    // 一段只能点一个角色：匹配器同维度只留一个命中，多点谁胜出取决于词条顺序，不确定
    var chSlots = slots.filter(function (s) {
      return ["主角", "配角", "对手"].indexOf(s.slice(1, -1)) !== -1;
    });
    if (chSlots.length > 1) errors.push(p.id + " beats[" + i + "] 点了多个角色（" + chSlots.join(" ") + "），应只点一个");
  });
  // 每条剧本至少要有一个维度槽（角色/场景/光影），否则抽出来锁不住维度
  var dimSlots = ["主角", "配角", "对手", "场景", "场景2", "光影", "光影2", "光影3"];
  var hasDim = (p.beats || []).some(function (b) {
    return dimSlots.some(function (k) { return b.indexOf("{" + k + "}") !== -1; });
  });
  if (!hasDim) errors.push(p.id + " beats 里没有维度槽（角色/场景/光影），抽卡会锁不住视觉一致性");
});
["props", "times", "weathers", "sounds"].forEach(function (k) {
  if (!Array.isArray(SCRIPTS.nouns && SCRIPTS.nouns[k]) || !SCRIPTS.nouns[k].length) errors.push("scripts.nouns." + k + " 为空");
});

if (errors.length) {
  errors.forEach(e => console.log("✗ " + e));
  console.log("字段体检失败：" + errors.length + " 个问题");
  process.exit(1);
}
console.log("✓ 字段体检通过：id 格式与唯一性、字段非空、prompt 无中文、中文名无串味、无坏字符、配色卡 16/16、系列池引用、冲突三件套、实体授权分级。");
