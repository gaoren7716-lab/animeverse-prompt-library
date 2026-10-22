#!/usr/bin/env node
/* 案例体检：引用完整性 + 11 维覆盖矩阵 + 实测进度。
 * 与 check_fields 分工：那个查字，这个查引用与覆盖。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIMS = ["regions", "styles", "media", "subjects", "characters",
  "worlds", "shots", "lights", "layouts", "sizes", "decors"];
const SINGULAR = { region: "regions", style: "styles", media: "media", subject: "subjects",
  character: "characters", world: "worlds", shot: "shots", light: "lights",
  layout: "layouts", size: "sizes", decor: "decors" };

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", name + ".json"), "utf8"));
}
const data = {};
DIMS.concat(["cases", "templates", "series", "gallery"]).forEach(d => { data[d] = load(d); });

const errors = [];
const knownIds = {};
DIMS.forEach(d => data[d].items.forEach(it => { knownIds[it.id] = d; }));

// 1. 引用完整性（cases.recipe / templates.fills / series pools）
data.cases.items.forEach(cs => {
  Object.keys(cs.recipe).forEach(k => {
    var d = SINGULAR[k];
    if (!d) { errors.push(cs.id + " recipe 键非法：" + k); return; }
    if (knownIds[cs.recipe[k]] !== d) errors.push(cs.id + " recipe." + k + " 引用悬空：" + cs.recipe[k]);
  });
});
data.templates.items.forEach(tp => {
  Object.keys(tp.fills).forEach(k => {
    var d = SINGULAR[k];
    if (!d) { errors.push(tp.id + " fills 键非法：" + k); return; }
    if (knownIds[tp.fills[k]] !== d) errors.push(tp.id + " fills." + k + " 引用悬空：" + tp.fills[k]);
  });
});
data.series.roles.forEach(r => {
  ["media", "shots", "layouts", "sizes", "lights"].forEach(f => {
    (r[f] || []).forEach(id => {
      if (knownIds[id] !== f) errors.push(r.id + " 池 " + f + " 引用悬空：" + id);
    });
  });
});
data.series.themes.forEach(t => {
  if (knownIds[t.style] !== "styles") errors.push(t.id + " style 悬空：" + t.style);
  if (knownIds[t.subject] !== "subjects") errors.push(t.id + " subject 悬空：" + t.subject);
  (t.characters || []).forEach(id => { if (knownIds[id] !== "characters") errors.push(t.id + " characters 悬空：" + id); });
  (t.worlds || []).forEach(id => { if (knownIds[id] !== "worlds") errors.push(t.id + " worlds 悬空：" + id); });
});

// 2. 覆盖矩阵：11 维 × 案例
var cover = {};
DIMS.forEach(d => { cover[d] = {}; });
function mark(recipe) {
  Object.keys(recipe).forEach(function (k) {
    var d = SINGULAR[k];
    if (d) cover[d][recipe[k]] = (cover[d][recipe[k]] || 0) + 1;
  });
}
data.cases.items.forEach(cs => mark(cs.recipe));
data.templates.items.forEach(tp => mark(tp.fills));
// 画廊预留位自带完整配方，同样是有效引用（覆盖矩阵要反映真实状态）
data.gallery.slots.forEach(sl => { if (sl.recipe) mark(sl.recipe); });

var totalEntries = 0, covered = 0, gaps = [];
DIMS.forEach(d => {
  var ids = data[d].items.map(it => it.id);
  totalEntries += ids.length;
  var cov = ids.filter(id => cover[d][id]).length;
  covered += cov;
  if (cov < ids.length) gaps.push(d + "(" + cov + "/" + ids.length + ")");
});

// 3. 案例多样性：题材/载体/地区不重复堆在同一格
var mediaSet = {}, subjectSet = {}, regionSet = {};
data.cases.items.forEach(cs => {
  mediaSet[cs.recipe.media] = (mediaSet[cs.recipe.media] || 0) + 1;
  subjectSet[cs.recipe.subject] = (subjectSet[cs.recipe.subject] || 0) + 1;
  regionSet[cs.recipe.region] = (regionSet[cs.recipe.region] || 0) + 1;
});
["media", "subject", "region"].forEach(function (k) {
  var set = k === "media" ? mediaSet : k === "subject" ? subjectSet : regionSet;
  var dup = Object.keys(set).filter(id => set[id] > 3);
  if (dup.length) errors.push("案例在 " + k + " 上堆得太狠：" + dup.join(","));
});

// 4. 实测进度
var untested = data.cases.items.filter(cs => cs.tested === false);
if (untested.length) {
  console.log("ℹ 未实测案例 " + untested.length + " 个（tested=false，文档不得宣称有效）：" +
    untested.map(c => c.id).join(", "));
}

console.log("覆盖矩阵：" + covered + "/" + totalEntries + " 条目被案例或模板引用");
if (gaps.length) console.log("  未全覆盖维度：" + gaps.join(" "));

if (errors.length) {
  errors.forEach(e => console.log("✗ " + e));
  console.log("案例体检失败：" + errors.length + " 个问题");
  process.exit(1);
}
console.log("✓ 案例体检通过：引用完整、无同维度堆料、覆盖矩阵如上（缺口属计划内，见 FRAMEWORK 路线图）。");
