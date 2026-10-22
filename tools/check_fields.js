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
DIMS.concat(["series", "cases", "conflicts", "templates", "palettes", "entities"]).forEach(d => { data[d] = load(d); });

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
    // 中文名混英文单词（中英串味），专有名词白名单除外
    var WHITELIST = /\bQ\b|CG|VTuber|Live2D|OVA|VHS|ins|IP/gi;
    var rest = it.zh.replace(WHITELIST, "");
    if (/[A-Za-z]{3,}/.test(rest)) errors.push(it.id + " 中文名混入英文单词（中英串味）：" + it.zh);
    (it.children || []).forEach(function (ch, i) {
      var restC = String(ch).replace(WHITELIST, "");
      if (/[A-Za-z]{3,}/.test(restC)) errors.push(it.id + " children[" + i + "] 混入英文单词：" + ch);
    });
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

if (errors.length) {
  errors.forEach(e => console.log("✗ " + e));
  console.log("字段体检失败：" + errors.length + " 个问题");
  process.exit(1);
}
console.log("✓ 字段体检通过：id 格式与唯一性、字段非空、prompt 无中文、中文名无串味、无坏字符、配色卡 16/16、系列池引用、冲突三件套、实体授权分级。");
