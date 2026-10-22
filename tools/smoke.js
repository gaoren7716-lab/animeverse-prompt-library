/* 引擎冒烟：装配 / 冲突 / 算子 / 系列 / 随机 / 盘点 / 分享码 / 实体 */
"use strict";
var AV = require("./compose.js");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("✗ " + name + (extra ? " | " + extra : "")); }
}

/* 1. 盘点 */
var s = AV.stats();
ok(s.entries === 150, "盘点：11 维共 150 条", "entries=" + s.entries);
ok(s.combos > 1e12, "盘点：组合空间超万亿", "combos=" + s.combos);
ok(s.cases === 10 && s.templates === 6 && s.conflicts === 10, "盘点：案例/模板/冲突数", JSON.stringify(s));
ok(s.seriesRoles === 6 && s.seriesThemes === 16, "盘点：系列角色/主题数");
ok(s.entities === 28 && s.relations === 23, "盘点：实体/关系数");

/* 2. 装配 */
var r = AV.compose({ size: "SZ-03", media: "MD-01", subject: "SU-05", character: "CH-01", world: "WD-03", shot: "SH-01", light: "LT-02", style: "ST-14", region: "RG-05", layout: "LO-01", decor: "DC-08" }, { theme: "rain-soaked alley at night" });
ok(r.prompt.indexOf("theme: rain-soaked alley at night") !== -1, "装配：主题注入在 media 之后");
ok(r.prompt.indexOf("no watermark") !== -1, "装配：末尾硬约束");
ok(r.prompt.indexOf("square 1:1") === -1, "装配：未选项不进词面");
ok(r.zh.length === 12, "装配：中文配方 12 行（含主题）", "zh=" + r.zh.length);
ok(r.warnings.length === 0, "装配：本配方无冲突");

/* 3. 冲突 */
var c1 = AV.compose({ size: "SZ-04", media: "MD-05", layout: "LO-08", region: "RG-15" });
ok(c1.warnings.length === 1 && c1.warnings[0].verdict.indexOf("SZ-04") !== -1, "冲突：CF-01 竖屏×宽画幅", JSON.stringify(c1.warnings));
var c2 = AV.compose({ media: "MD-04", style: "ST-04", region: "RG-02" });
ok(c2.warnings.length === 1, "冲突：CF-03 漫画页×水彩");
var c3 = AV.compose({ media: "MD-11", decor: "DC-05" });
ok(c3.warnings.length === 1, "冲突：CF-05 周边×噪波");

/* 4. 算子（受控变形） */
var base = { media: "MD-01", style: "ST-01", light: "LT-01", region: "RG-05", shot: "SH-01", layout: "LO-01", size: "SZ-03" };
var t1 = AV.applyOperator(base, "time-shift");
ok(t1.lights === "LT-08" && t1.styles === "ST-01", "算子 time-shift：只动光（黄金→蓝调）", JSON.stringify(t1));
var t2 = AV.applyOperator(base, "style-flip");
ok(t2.styles === "ST-02" && t2.media === "MD-01", "算子 style-flip：只动风格");
var t3 = AV.applyOperator(base, "era-shift");
ok(t3.regions === "RG-06" && t3.styles === "ST-01", "算子 era-shift：RG-05→RG-06（JP 链）", JSON.stringify(t3));
var t3b = AV.applyOperator({ style: "ST-14", region: "RG-11", light: "LT-01" }, "era-shift");
ok(t3b.regions === "RG-12" && t3b.styles === "ST-14", "算子 era-shift：RG-11→RG-12（CN 链）", JSON.stringify(t3b));
var t3c = AV.applyOperator({ style: "ST-14", region: "RG-14", light: "LT-01" }, "era-shift");
ok(t3c.regions === "RG-11" && t3c.styles === "ST-08", "算子 era-shift：进水墨年代回落风格（CF-06 守卫）", JSON.stringify(t3c));
var t4 = AV.applyOperator({ media: "MD-01", style: "ST-01", layout: "LO-01", size: "SZ-03" }, "medium-flip");
ok(t4.media === "MD-04" && t4.styles === "ST-07" && t4.layouts === "LO-05" && t4.sizes === "SZ-02" && t4.decors === "DC-01", "算子 medium-flip：帧→漫画页配套", JSON.stringify(t4));
var t5 = AV.applyOperator({ media: "MD-08", style: "ST-10" }, "chibi-fy");
ok(t5.styles === "ST-10", "算子 chibi-fy：道具图标不 Q 化（forbid 生效）", JSON.stringify(t5));
var t6 = AV.applyOperator({ layout: "LO-02", shot: "SH-04", media: "MD-12" }, "detail-zoom");
ok(t6.shots === "SH-11" && t6.layouts === "LO-11" && t6.media === "MD-08", "算子 detail-zoom：细节特写三件套", JSON.stringify(t6));
var t7 = AV.applyOperator({ layout: "LO-09", size: "SZ-04" }, "frame-shift");
ok(t7.sizes === "SZ-05" && t7.layouts === "LO-09", "算子 frame-shift：SZ-04→SZ-05", JSON.stringify(t7));
var t8 = AV.applyOperator({ layout: "LO-08", size: "SZ-04" }, "frame-shift");
ok(t8.sizes === "SZ-05" && t8.layouts === "LO-08", "算子 frame-shift：脱离雷区到 SZ-05", JSON.stringify(t8));
var t9 = AV.applyOperator({ light: "LT-01", media: "MD-01" }, "dark-variant");
ok(t9.lights === "LT-08" && t9.decors === "DC-04", "算子 dark-variant：蓝调+颗粒", JSON.stringify(t9));
var t10 = AV.applyOperator({ light: "LT-04", media: "MD-09" }, "dark-variant");
ok(t10.lights === "LT-04", "算子 dark-variant：舞台光不参与", JSON.stringify(t10));
var t11 = AV.applyOperator({ shot: "SH-11", layout: "LO-02" }, "lens-shift");
ok(t11.shots === "SH-12", "算子 lens-shift：微距后移", JSON.stringify(t11));
var t12 = AV.applyOperator(base, "manga-page");
ok(t12.media === "MD-04" && t12.styles === "ST-07", "算子 manga-page：一键漫画页", JSON.stringify(t12));
ok(AV.applyOperator(base, "no-such-op") === null, "算子：未知 id 返回 null");
ok(Object.keys(AV.OPERATORS).length === 10, "算子：共 10 个");
// 算子 preserve/change/forbid 元数据齐全
Object.keys(AV.OPERATORS).forEach(function (k) {
  var op = AV.OPERATORS[k];
  ok(Array.isArray(op.preserve) && Array.isArray(op.change) && Array.isArray(op.forbid) && op.zh && op.desc,
    "算子元数据齐全：" + k);
});

/* 5. 系列出图 */
var ser = AV.buildSeries("TH-07", 6, { seed: 42 });
ok(ser.theme === "赛博都市" && ser.cards.length === 6, "系列：TH-07 六张");
ok(ser.style.id === "ST-14", "系列：主题绑定风格");
ok(ser.palette && ser.palette.style === "ST-14", "系列：配色卡由风格派生");
ser.cards.forEach(function (c) {
  ok(c.prompt.indexOf("theme: cyberpunk megacity") !== -1, "系列：每张注入主题词 " + c.role);
  ok(c.title.indexOf("赛博都市") !== -1, "系列：标题带主题 " + c.role, c.title);
  ok(c.warnings.length === 0, "系列：卡片无冲突 " + c.role, JSON.stringify(c.warnings));
});
// 全组统一性：风格/题材/角色/世界/地区六张一致
var unify = ser.cards.every(function (c) {
  return c.sel.styles === ser.style.id && c.sel.subjects === ser.subject.id &&
    c.sel.characters === ser.character.id && c.sel.worlds === ser.world.id && c.sel.regions === ser.region.id;
});
ok(unify, "系列：风格/题材/角色/世界/地区全组统一");
// 角色分工：主视觉与角色卡各有其载体族
var roleMedias = ser.cards.map(function (c) { return c.sel.media; });
ok((roleMedias[0] === "MD-12" || roleMedias[0] === "MD-01") && (roleMedias[1] === "MD-02" || roleMedias[1] === "MD-06"), "系列：主视觉与角色卡分工", roleMedias.join(","));
// 确定性：同 seed 同结果
var ser2 = AV.buildSeries("TH-07", 6, { seed: 42 });
ok(JSON.stringify(ser2.cards) === JSON.stringify(ser.cards), "系列：同 seed 完全可复现");
// 未知主题：原文注入
var ser3 = AV.buildSeries("雨天便利店", 3, { seed: 7 });
ok(ser3.cards.length === 3 && ser3.cards[0].prompt.indexOf("theme: 雨天便利店") !== -1, "系列：未收录主题原文注入");
ok(ser3.style.id === "ST-01" && ser3.palette.style === "ST-01", "系列：未知主题回落默认风格+配色");
// count 边界
var ser4 = AV.buildSeries("TH-01", 3, { seed: 1 });
ok(ser4.cards.length === 3, "系列：3 张档");
ok(AV.buildSeries("TH-01", 9, { seed: 1 }).cards.length === 6, "系列：非法档位回落 6 张");

/* 6. 随机 */
var rnd1 = AV.random();
ok(Object.keys(rnd1).length === 11, "随机：11 维全填");
var rnd2 = AV.random({ styles: "ST-14" });
ok(rnd2.styles === "ST-14", "随机：锁定维度保留");

/* 7. 分享码 */
var code = AV.encodeShare({ sel: base, freeText: "雨天" });
ok(code.indexOf("AVX1.") === 0, "分享码：前缀");
var dec = AV.decodeShare(code);
ok(dec.sel.media === "MD-01" && dec.freeText === "雨天", "分享码：往返一致");

/* 8. 实体参考层 */
var en = AV.entityById("EN-02");
ok(en && en.zh === "吉卜力工作室" && en.rights === "R2", "实体：按 id 查");
var rel = AV.relationsOf("EN-14");
ok(rel.length >= 2, "实体：关系反查", "n=" + rel.length);
ok(AV.REL_ZH.student_of === "师承", "实体：关系中文名");

console.log("\n冒烟结果：通过 " + pass + " / 失败 " + fail);
process.exit(fail ? 1 : 0);
