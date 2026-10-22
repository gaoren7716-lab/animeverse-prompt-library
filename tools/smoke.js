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

/* 9. 文本拆解与语义匹配 */
var pPara = AV.parseScript("第一段第一句。\n第一段第二句。\n\n第二段。");
ok(pPara.length === 2 && pPara[0].kind === "para", "拆解：有空行按段", JSON.stringify(pPara.map(function (b) { return b.text; })));
ok(pPara[0].text.indexOf("第一段第二句") !== -1, "拆解：段内换行保留");
var pSent = AV.parseScript("第一句。第二句。第三句。");
ok(pSent.length === 3 && pSent[0].kind === "sent", "拆解：无空行按句", "n=" + pSent.length);
ok(AV.parseScript("第一句。\n\n第二句。", { mode: "sent" }).length === 2, "拆解：强制按句");
ok(AV.parseScript("").length === 0, "拆解：空文本不炸");

var mk = AV.matchKeywords("机甲少女");
ok(mk.subjects && mk.subjects.id === "SU-02", "匹配：机甲少女→机甲题材", JSON.stringify(mk.subjects));
ok(mk.characters && mk.characters.id === "CH-02", "匹配：机甲少女→少女主角");
var mk2 = AV.matchKeywords("雨夜, 神社");
ok(mk2.lights && mk2.lights.id === "LT-02", "匹配：雨夜→霓虹夜光");
ok(mk2.worlds && mk2.worlds.id === "WD-02", "匹配：神社→日式神社");
ok(Object.keys(AV.matchKeywords("")).length === 0, "匹配：空关键词不炸");
ok(AV.matchKeywords("齐白石").subjects === undefined, "匹配：无关词不乱锁");

/* 10. 短剧分镜 */
var acts5 = AV.pickActs(5);
ok(acts5.length === 5 && acts5[0] === "SR-S1" && acts5[4] === "SR-S5", "幕次：5 段对应五幕", acts5.join(","));
ok(AV.pickActs(2).length === 2 && AV.pickActs(2)[1] === "SR-S5", "幕次：2 段为建立+收尾");
ok(AV.pickActs(8).length === 8 && AV.pickActs(8)[0] === "SR-S1" && AV.pickActs(8)[7] === "SR-S5", "幕次：超 5 段首尾不变");
var scr = AV.scriptToSeries("雨夜信", "赛博朋克, 霓虹",
  "雨夜的霓虹都市，少年主角站在便利店门口。\n\n他抬起头，远处传来爆炸声。\n\n神秘面具客从阴影里走出。",
  { seed: 20261022 });
ok(scr && scr.cards.length === 3, "分镜：3 段出 3 张", scr ? String(scr.cards.length) : "null");
ok(scr.cards[0].sel.styles === scr.cards[2].sel.styles, "分镜：全组统一风格");
ok(scr.cards[0].sel.characters === "CH-01", "分镜：段落点名的角色被识别", scr.cards[0].sel.characters);
ok(scr.cards[1].sel.characters === "CH-01", "分镜：未点名角色跨段继承", scr.cards[1].sel.characters);
ok(scr.cards[2].sel.characters === "CH-16", "分镜：段落点名的面具客覆盖继承", scr.cards[2].sel.characters);
ok(scr.cards[0].sel.worlds === "WD-03", "分镜：场景被识别", scr.cards[0].sel.worlds);
ok(scr.cards[0].prompt.indexOf("scene:") !== -1, "分镜：原文进入词面");
ok(scr.cards.every(function (c) { return c.warnings.length === 0; }), "分镜：无冲突告警");
ok(AV.scriptToSeries("t", "k", "   ", {}) === null, "分镜：空文案返回 null");

/* 10b. 短剧抽卡（没想法就抽一部） */
var rs = AV.randomScript({ seed: 20261022 });
ok(!!rs, "抽卡：返回剧本");
ok(/^SP-\d{2}$/.test(rs.premise), "抽卡：剧本 id 格式", rs.premise);
ok(rs.text.length > 60, "抽卡：文案有内容", String(rs.text.length));
ok(rs.text.indexOf("{") === -1, "抽卡：占位符全部替换", rs.text.slice(0, 80));
ok(rs.text.split("\n\n").length === 5, "抽卡：五段文案", String(rs.text.split("\n\n").length));
ok(!!rs.cast.hero && !!rs.cast.villain && rs.cast.hero !== rs.cast.villain, "抽卡：主角与对手不同人", JSON.stringify(rs.cast));
ok(rs.scenes.a !== rs.scenes.b, "抽卡：两个场景不同", JSON.stringify(rs.scenes));
ok(rs.lights.a !== rs.lights.b && rs.lights.b !== rs.lights.c && rs.lights.a !== rs.lights.c, "抽卡：三处光影互不相同", JSON.stringify(rs.lights));
ok(!!rs.style && !!rs.subject, "抽卡：带全组统一风格与题材");
var rs2 = AV.randomScript({ seed: 20261022 });
ok(JSON.stringify(rs2.text) === JSON.stringify(rs.text), "抽卡：同 seed 完全可复现");
ok(AV.randomScript({ seed: 777 }).text !== rs.text, "抽卡：不同 seed 出不同剧本");
ok(AV.randomScript({ seed: 1, keywords: "机甲" }) !== null, "抽卡：接受关键词");
var rsKw = AV.randomScript({ seed: 1, keywords: "魔法" });
ok(rsKw.text.indexOf("魔法") !== -1, "抽卡：关键词锁进文案", rsKw.text.slice(0, 60));
// 关键词锁住的维度，抽出来的剧本必须用它（题材用 SU-04 魔法少女，story 落在「魔法」上）
ok(rsKw.subject === "SU-04", "抽卡：关键词锁住题材", rsKw.subject);
var rsKw2 = AV.randomScript({ seed: 1, keywords: "魔法少女" });
ok(rsKw2.subject === "SU-04" && rsKw2.cast.hero === "CH-02", "抽卡：魔法少女锁到题材+角色",
  rsKw2.subject + "/" + rsKw2.cast.hero);
// 抽卡文案能直接进分镜：段落识别得到角色/场景
var rsSer = AV.scriptToSeries(rs.theme, "", rs.text, { seed: 5, themeEn: rs.themeEn, style: rs.style, subject: rs.subject, locks: rs.locks });
ok(rsSer && rsSer.cards.length === 5, "抽卡：文案直接出 5 张分镜", rsSer ? String(rsSer.cards.length) : "null");
ok(rsSer.cards.every(function (c) { return c.sel.styles === rs.style; }), "抽卡：分镜全组统一风格");
ok(rsSer.cards.every(function (c) { return c.sel.subjects === rs.subject; }), "抽卡：分镜全组统一题材");
// 叙事骨架：建立=主角 → 亮相=配角 → 推进=主角 → 高潮=对手 → 收尾=主角
ok(rsSer.cards[0].sel.characters === rs.cast.hero, "抽卡：建立幕是主角", rsSer.cards[0].sel.characters);
ok(rsSer.cards[1].sel.characters === rs.cast.ally, "抽卡：亮相幕是配角", rsSer.cards[1].sel.characters);
ok(rsSer.cards[2].sel.characters === rs.cast.hero, "抽卡：推进幕回到主角", rsSer.cards[2].sel.characters);
ok(rsSer.cards[3].sel.characters === rs.cast.villain, "抽卡：高潮幕是对手", rsSer.cards[3].sel.characters);
ok(rsSer.cards[4].sel.characters === rs.cast.hero, "抽卡：收尾幕是主角", rsSer.cards[4].sel.characters);
ok(rsSer.cards[0].sel.worlds === rs.scenes.a && rsSer.cards[2].sel.worlds === rs.scenes.b, "抽卡：场景按段落切换");
ok(rsSer.cards[0].sel.lights === rs.lights.a && rsSer.cards[2].sel.lights === rs.lights.b && rsSer.cards[4].sel.lights === rs.lights.c,
  "抽卡：三段光影各自到位");
ok(rsSer.cards.every(function (c) { return c.warnings.length === 0; }), "抽卡：分镜无冲突告警",
  JSON.stringify(rsSer.cards.map(function (c) { return c.warnings.length; })));
// 逐段锁是硬保证：40 个 seed × 5 段全部按剧本骨架落位
// （story 是短词，文本反推会与别的条目打架——必须靠生成器的逐段锁）
var lockBad = 0, lockTot = 0;
for (var si = 1; si <= 40; si++) {
  var rr = AV.randomScript({ seed: si });
  var ss = AV.scriptToSeries(rr.theme, "", rr.text, { seed: si, themeEn: rr.themeEn, style: rr.style, subject: rr.subject, locks: rr.locks });
  var plan = [rr.cast.hero, rr.cast.ally, rr.cast.hero, rr.cast.villain, rr.cast.hero];
  var lplan = [rr.lights.a, rr.lights.a, rr.lights.b, rr.lights.b, rr.lights.c];
  ss.cards.forEach(function (c, i) {
    lockTot++;
    if (c.sel.characters !== plan[i]) lockBad++;
    if (c.sel.worlds !== (i < 2 ? rr.scenes.a : rr.scenes.b)) lockBad++;
    if (c.sel.lights !== lplan[i]) lockBad++;
  });
}
ok(lockBad === 0, "抽卡：40 seed × 5 段逐段锁全部落位", "失败 " + lockBad + "/" + lockTot);

/* 11. 画廊槽位（50 位） */
var gslots = AV.data && AV.data.gallery ? AV.data.gallery.slots : [];
ok(gslots.length === 50, "画廊：50 个槽位", String(gslots.length));
var glOwn = gslots.filter(function (s) { return !!s.recipe; });
ok(glOwn.length === 40, "画廊：40 个预留位自带配方", String(glOwn.length));
ok(gslots.filter(function (s) { return !!s.case; }).length === 10, "画廊：10 位复用验证案例");
ok(gslots.every(function (s) { return !s.recipe || AV.conflicts(s.recipe).length === 0; }), "画廊：全部预留位配方无冲突");
ok(gslots.every(function (s) { return !s.recipe || AV.compose(s.recipe).prompt.length > 80; }), "画廊：全部预留位可装配出词面");
var gids = gslots.map(function (s) { return s.id; });
ok(new Set(gids).size === gids.length, "画廊：槽位 id 无重复");

console.log("\n冒烟结果：通过 " + pass + " / 失败 " + fail);
process.exit(fail ? 1 : 0);
