# 贡献指南

感谢你愿意动手改这个库。这个库是**开放式词库**——你加的一条词条，可能就是别人缺的那一条。

## 五条不可让步的规矩

这五条是库的地基，改动时必须守住：

1. **信息四类不许混**——`fact`（客观事实）/ `seen`（我见过）/ `read`（我读过）/ `test`（我实测过）分开标注。实测结论只对被测模型有效，换模型要重测。
2. **授权分级独立成线**——参考实体层分 R0-R3：R0 自由 / R1 署名 / R2 仅参考（在世创作者与品牌名）/ R3 禁止直接商用（作品名与角色名）。**R2/R3 实体不进词面**，送进商业出图前先做 deid 视觉等价替换。
3. **词面层禁真实品牌/作品名**——`prompt` 字段会直接送进出图模型，不得含 disney / pixar / ghibli 等专名（`tools/check_fields.js` 会拦）。`kw` 检索别名不受限，它只做匹配、绝不进词面。
4. **id 不改**——`XX-数字` 格式的 id 一旦发布就是对外契约，被别人引用过就不能改。新增只追加。
5. **中文不进 prompt**——`prompt` 必须是英文视觉指令；中文只放在 `zh` / `note` / `story`。

## 加一条词条

1. 找到对应维度的 `data/*.json`，在 `items` 数组**末尾**追加
2. id 按该维度现有序号往下排（不填补空号）
3. 必填：`id` / `zh` / `prompt` / `kw`；`story` 仅 `worlds` / `lights` 需要
4. `kw` 至少 2 个中文词或 3 个英文字母的词——太短的词匹配器抓不到
5. 跑体检，全绿才能提交：

```bash
node tools/check_fields.js    # 字段质量
node tools/check_cases.js     # 引用完整 + 覆盖矩阵
node tools/smoke.js           # 引擎冒烟
```

## 改引擎（tools/compose.js）

- `tools/compose.js` 是**单一真源**，`assets/engine.js` 是它的派生物副本——改完跑 `node tools/build_web.js` 同步，**不要手改 engine.js**
- `ASM_ORDER` 是固定装配顺序，改它会改变所有历史配方的产物；要加维度就追加到末尾
- `FOOTER`（负面词硬约束）恒在末尾，不要动
- 改完跑 `node tools/smoke.js` + `NODE_PATH=... node tools/smoke-web.js`

## 改界面

- 改了显隐 / 尺寸 / 配色，**必须**加跑真实 Chrome：`NODE_PATH=... node tools/verify_chrome.js`
  （jsdom 查不出 CSS 级联和图片加载问题，这是本库踩过最多的坑）
- 画廊加图：把图存成 `gallery/<卡号>.jpg` 或 `gallery/<卡号>.png`（两种都认），
  重跑 `node tools/gallery_sync.js` 即可挂上；母版文件用 `_` 前缀不进清单

## 提 PR 前

跑一遍完整回归，十层全绿再提：

```bash
NODE_PATH=<jsdom 所在 node workspace>/node_modules node tools/build_web.js
node tools/check_fields.js        # 字段体检（id 格式/prompt 禁中文/三件套/授权分级/kw 别名/story 词源）
node tools/check_cases.js         # 引用完整 + 覆盖矩阵 + 同维度堆料
node tools/smoke.js               # 引擎冒烟 130 项
NODE_PATH=... node tools/smoke-web.js   # 界面冒烟 112 项（jsdom，含 CSS 绊线）
node tools/gallery_sync.js --check       # 画廊清单与目录一致
node tools/gallery_multiformat_test.js  # 画廊多格式专项 19 项（jpg/png 混排、同 id 多文件取舍）
node tools/inventory.js           # 盘点 + 覆盖缺口
node tools/apply_alias.js --check # 别名表体检
NODE_PATH=... node tools/verify_chrome.js  # 真实 Chrome 验证 29 项（改了显隐/尺寸/配色必跑）
node tools/verify_live_api.js    # 线上产物验收 15 项（发布后跑：清单/图片字节/文案/Pages 状态）
```

**改了画廊图片，还要多跑一步** `node tools/embed_gallery.js`——README 里的画廊展示是它生成的
（`assets/gallery-thumbs/` 缩略图也是），不重跑 README 会停在旧清单上。

## 品牌 LOGO

- `assets/logo.svg` —— 图形标（正方形，透明通道）：动漫眼 + 轨道 + 星点，深色底
- `assets/logo-lockup.svg` —— 横版组合（图形 + 「动漫宇宙」+ ANIMEVERSE PROMPT LIBRARY）
- PNG 派生物：`assets/logo.png`（512）、`assets/logo-lockup.png`（1240×256）、`assets/favicon.png`（32）

**SVG 是唯一真源**，改型只改 SVG，然后重跑 `node tools/logo_export.js` 重新导出 PNG（不要手改 PNG）。

## 目录结构

```
data/*.json      19 个数据文件（11 维 + series/cases/conflicts/templates/palettes/entities/gallery/scripts）
tools/compose.js 引擎单一真源（UMD 双跑：Node CLI 与浏览器共用）
tools/build_web.js  data → assets/data-bundle.js + compose.js → assets/engine.js
index.html + assets/app.js  十一页单页应用（原生 JS，零依赖）
gallery/         实测出图（文件名主干 = 画廊槽位 id）
assets/gallery-thumbs/  README 用的缩略图（embed_gallery.js 生成的派生物）
tools/gallery_sync.js / gallery_compress.js  画廊清单与压缩（派生物勿手改）
tools/apply_alias.js  检索别名维护脚本（写 kw 字段，幂等可重跑）
tools/logo_export.js  LOGO 导出（SVG → PNG，改型后重跑）
```

`data/scripts.json` 是短剧抽卡的剧本种子池（10 条骨架 × 5 段 beats + 道具/时间/天气/声音词表）。
`data/{worlds,lights}.json` 里的 `story` 字段是**中文叙事用词**（场景写「霓虹都市」、光影写「夜色」），
词源必须落在该条目的 `zh`/`kw` 内——`check_fields` 强制这条，否则匹配器锁不住，抽出来的分镜就散了。

## 短剧抽卡的三条设计纪律

改动短剧抽卡（`randomScript`）时守住：

1. **逐段硬锁**——生成器知道每段配了谁、什么场景、什么光，逐段传给分镜构建器（`opts.locks`）。
   不从文案反推：反推时同维度多候选靠词序定胜负（「面具客」是 CH-16 还是 CH-12 说不准），
   实测 40 seed × 5 段有 6 段锁错；改硬传后 300 段零失败。
2. **占位符正则用 `/\{([^}]+)\}/`**——JS 的 `\w` 只认 ASCII，中文占位符（`{主角}`）永远匹配不上。
3. **一致性靠生成器，不靠后置校验**——用户手改文案后要清掉 `themeEn` 与 `locks`
   （按段数对应的锁会错位）。

## 不要做的事

- 不要手改 `assets/data-bundle.js` / `assets/engine.js` / `assets/gallery-imgs.js`——都是派生物
- 不要在 README / FRAMEWORK 里手改生成的数字（数据变了要重跑 `tools/inventory.js` 再同步）
- 不要把 `.workbuddy/` 目录、访问令牌、`first_push.cjs` 提交进仓库（已在 `.gitignore`）
