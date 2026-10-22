# AGENTS · 给后续维护者（人或 AI）的工程约定

这个项目的工程纪律。改任何东西之前先读这里；跑回归的命令在 README「数据与代码」节。

## 0. 一句话架构

```
data/*.json ──build_web.js──→ assets/data-bundle.js（window.AV_DATA）
tools/compose.js ──build_web.js──→ assets/engine.js（副本，勿手改）
index.html + assets/app.js（原生 JS 十一页单页应用，零依赖，顶部横排导航）
gallery/（文件名主干 = 案例 id）──gallery_sync.js──→ assets/gallery-imgs.js（派生物，勿手改）
```

**引擎单一真源是 tools/compose.js**：UMD 双跑，Node CLI（`require`）与浏览器（`window.AV`）共用同一份装配逻辑。改引擎逻辑只改 compose.js，然后重跑 build_web.js 同步副本。**不要手改 assets/engine.js 或 assets/data-bundle.js。**

## 1. 数据层约定（data/*.json，17 个文件）

### id 与编码

- **id 不可改**：RG/ST/MD/SU/CH/WD/SH/LT/LO/SZ/DC/TH/SR/CS/CF/TP/PL/EN 前缀 + 两位数字（O 段无此类）。已发布的编号被分享码、画廊文件名、案例 validates 引用，改了就是断链。
- **新增只追加**：新条目拿下一个空号，不插队、不重排。
- **prompt 字段恒英文**：维度条目的 prompt 是出图模型的输入，禁中文（check_fields 有检测）。
- **中文名字段禁串味**：白名单外文缩写只有 Q / CG / VTuber / Live2D / OVA / VHS / ins / IP（check_fields 有检测）。

### 单复数两套键

- 维度文件（regions.json 等）用**复数键**（`items` 数组，每文件一个数组字段）
- 案例 recipe 与模板 fills 用**单数键**（`region` / `style` / `media`…）
- KEY2DIM 映射表真源在 compose.js；新增维度必须同时登记两处

### 各文件三件套/五件套

| 文件 | 必填字段 | 体检工具 |
|---|---|---|
| 维度 11 文件 | id / zh / prompt（+ media 的 children/suggest） | check_fields |
| conflicts | when / notWith / verdict / why 四件套 | check_fields |
| cases | recipe + validates + tested | check_cases |
| templates | fills + protect + checklist | check_fields |
| series | themes 绑定 subject/characters/worlds/style；roles 各自带池子与 titleFormula/copyGuide；scriptRoles 五个幕次 + actOrder 分配表 | check_fields |
| palettes | 每风格一张卡，4-6 个合法 hex + note/avoid/suits/scenes/lights | check_fields |
| entities | rights 分级 R0-R3；R2/R3 必须带 deid 视觉等价描述 | check_fields |
| 维度 11 文件 | 每条须带 **kw 检索别名**（口语词入口，≥2 中文字或 ≥3 英文字母） | check_fields + apply_alias.js |

### 元层不进词面

实体、配色卡、冲突、模板都是**参考层/元层**：它们参与检索、裁决、展示，但 compose() 的输出只含 11 维 prompt + theme + FOOTER。往引擎里塞元数据前想清楚——元层泄漏进词面会污染组合空间的纯度。

## 2. 引擎约定（tools/compose.js）

- **ASM_ORDER 固定**：sizes → media → subjects → characters → worlds → shots → lights → styles → regions → layouts → decors；theme 注入在 media 之后；FOOTER 恒在末尾
- **apply 是纯函数**：算子不改传入的 sel（深拷贝后再动），返回新 sel
- **抽签必走 pickClean**：系列与随机的任何抽签都必须冲突感知（重试上限 40 次），不允许裸随机
- **张数夹紧**：buildSeries 的 count 参数夹在 [minC, maxC]，非法值回落边界而不是抛错
- **分享码 AVX1.**：encodeShare/decodeShare 成对维护，改编码格式必须同时改 smoke.js 的往返断言
- **重抽不得覆盖已定值**（2026-10-22 实测坑）：冲突感知重抽只动「幕次池维度」，但凡被**段落明说 / 关键词锁定 / 上一段继承**任一确定的维度，必须跳过重抽，否则用户意图会被随机值覆盖（症状：明明锁了「雨夜→霓虹夜光」，出来却变成月光蓝调）
- **匹配优先级不可颠倒**：段落明说 > 关键词锁定 > 上一段继承 > 全组基准。改任一层的取值顺序都要同步 smoke.js 的继承断言
- **匹配器改算法必须同步两处**：compose.js 的 scoreItem/matchText 分数与阈值；check_fields 的 kw 词长校验（短词永远匹配不上，属于静默失败）

## 3. 界面约定（index.html + assets/app.js）

### 视图显隐铁律（最重要，没有之一）

- 显隐**只走** `.view` / `.view.on`（CSS：`.view{display:none}` `.view.on{display:block}`）
- **布局类（grid/row/ops/wrap/dimgroup/outbox/ser-wrap）不得挂在 .view 元素上**——同特异性下布局类的 display 会覆盖 .view 的关闭态，七页全拖着配方盘泄露（2026-10-14 电商库事故形态）
- 任何布局类元素如果确实需要默认 display，必须显式写关闭态
- smoke-web.js 有 CSS 绊线静态检查（源文本 + DOM 双重），别绕

### DOM 与事件

- 列表渲染一律 innerHTML 重建 + 事件委托挂容器（`$("gGrid").addEventListener`），**不要**给重建后消失的节点挂 listener
- `$` = getElementById（只吃裸 id），`$$` = querySelectorAll。**测试代码里给 CSS 选择器用 `$$`**（2026-10-22 smoke-web 教训：`$("#id .cls")` 恒 null）
- `esc()` 包所有用户内容再进 innerHTML
- 复制走 copyText()，jsdom 无剪贴板时 toast 兜底，**不许**因复制失败抛异常中断交互
- **导航在顶部横排**（2026-10-22 用户改版）：#side 是 54px 高的 sticky 横栏，logo 左 + nav 横滚中 + slogan 右；`.nav button.on` 指示条是 `inset 0 -2px 0`（底部）。body 不再是 flex，#main 不再有 flex:1
- **textarea 必须显式 width:100%**：默认 cols 宽度会缩成一条窄柱（2026-10-22 短剧页实测）
- 本机存储用 localStorage（键 `av_userthemes` 存「我的主题」），读写都要 try/catch 兜底

### 画廊

- `gallery/` 文件名主干 = 案例 id（CS-01.jpg），母版/临时文件用 `_` 前缀（不进清单）
- **新图管线**：ImageGen 出图 → 立刻改名成案例 id（并行出图会撞名！提示词首句唯一可避免）→ `gallery_compress.js`（1200px JPEG q88）→ `gallery_sync.js` 重建清单
- `assets/gallery-imgs.js` 是派生物，改它无效，真动作是动 gallery/ 目录再 sync
- **出图后必须目检**：对照案例 validates 逐条核。不符就改配方（或补冲突规则）再重出，不许留着不符的图挂 `tested=true`

## 4. 回归清单（按序跑，全绿才算完）

```bash
NODE_PATH=<jsdom workspace>/node_modules node tools/build_web.js   # ① 先同步派生物
node tools/check_fields.js      # ② 字段体检
node tools/check_cases.js       # ③ 引用完整 + 覆盖矩阵
node tools/smoke.js             # ④ 引擎冒烟 97 项
NODE_PATH=... node tools/smoke-web.js  # ⑤ 界面冒烟 77 项（jsdom）
node tools/gallery_sync.js --check     # ⑥ 画廊清单与目录一致
node tools/inventory.js         # ⑦ 盘点数字喂文档
node tools/apply_alias.js --check      # ⑧ 别名表体检（数据缺 kw 时改本脚本再重跑写入）
```

改了 `data/cases.json` 的 tested 或 recipe → 画廊图可能过期，回第 3 节管线。
改了 index.html 的显隐相关 CSS → ⑤ 之外加跑真实 Chrome（playwright-core，**必须 file:// URL**，本机 localhost http 服务被坏代理拦死）。
界面显隐类 bug jsdom 查不出 CSS 级联问题的一切嫌疑，都用真实 Chrome 逐页签断言 computed display。

## 5. 实测与文档的诚实纪律

- **cases.tested=false 的案例，任何文档不许宣称有效**。出图目检通过才翻 true，翻之前对照 validates 逐条核
- 实测暴露的冲突当天补进 conflicts.json（when/notWith/verdict/why 四件套），并在 why 里记明出处（哪天哪个案例撞的）
- README 与 FRAMEWORK 引用的数字（150 条、1.87 万亿、97/77 项冒烟）以 inventory.js 和 smoke 实跑为准，**手改数字前先重跑**
- 本项目无 build_md.js，**三份文档全手维护**（别套 art-forge 的生成链）

## 6. 本机环境坑（跨项目通用，2026-10 实测）

- bash 里 `env -u XXX cmd` 会吞 node 的 stdout——清代理变量在脚本里 `delete process.env.X`，别在命令行用 `env -u`
- gh 在 bash 下 stdout 恒空，取 token/建仓库走 PowerShell；git https 通道在坏代理下必卡死，走 Git Data API 推送（见各库 .workbuddy/push_api.cjs）
- `.bat` 必须纯 ASCII（cmd 按 GBK 逐行解析，UTF-8 中文会破坏行结构）
- jsdom 冒烟需要 NODE_PATH 指向托管 node workspace 的 node_modules
- playwright-core + 真实 Chrome 走 `file://` 最稳

## 7. 发布

- 仓库：github.com/gaoren7716-lab/animeverse-prompt-library（public）
- Pages：main 根目录静态托管，含画廊图共约 3.3MB，构建约 1-2 分钟
- 推送前确认：远端树 sha == `git rev-parse HEAD^{tree}`（API 建的 commit 本地无对象，以树一致为准）
