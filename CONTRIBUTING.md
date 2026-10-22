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

跑一遍完整回归（见 README「回归清单」），十层全绿再提。

## 不要做的事

- 不要手改 `assets/data-bundle.js` / `assets/engine.js` / `assets/gallery-imgs.js`——都是派生物
- 不要在 README / FRAMEWORK 里手改生成的数字（数据变了要重跑 `tools/inventory.js` 再同步）
- 不要把 `.workbuddy/` 目录、访问令牌、`first_push.cjs` 提交进仓库（已在 `.gitignore`）
