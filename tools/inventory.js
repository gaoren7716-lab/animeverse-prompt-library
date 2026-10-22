#!/usr/bin/env node
/* 盘点 + 覆盖缺口。数字现算，README 引用它——别把数字写死在文档里。 */
"use strict";
var AV = require("./compose.js");

var s = AV.stats();
console.log("== 维度条目（11 维共 " + s.entries + " 条）==");
Object.keys(s.per).forEach(function (d) {
  console.log("  " + d + " " + s.per[d].zh + "：" + s.per[d].n);
});
console.log("组合空间（连乘）：" + s.combos.toLocaleString("en-US"));
console.log("== 非维度资产 ==");
console.log("  配色卡：" + s.palettes + "（每风格一张）");
console.log("  验证案例：" + s.cases + "（tested=false 表示未实测）");
console.log("  任务模板：" + s.templates);
console.log("  冲突规则：" + s.conflicts);
console.log("  系列角色：" + s.seriesRoles + " · 系列主题：" + s.seriesThemes);
console.log("  参考实体：" + s.entities + " · 关系边：" + s.relations);
console.log("  画廊槽位：" + s.gallerySlots + "（含已出图与预留位）");

var g = AV.gaps();
console.log("== 覆盖缺口 ==");
if (!g.unusedByCaseOrTpl.length) console.log("  全部条目都被案例、模板或画廊槽位引用");
else g.unusedByCaseOrTpl.forEach(function (x) {
  console.log("  " + x.zh + "（" + x.dim + "）未被引用：" + x.unused.join(", "));
});
console.log("== 实测进度 ==");
console.log("  已实测：" + g.testedCases + " / " + (g.testedCases + g.untestedCases));
