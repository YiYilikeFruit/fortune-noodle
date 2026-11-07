# 幸运饭桶大转盘 项目方案报告

> 方案日期：2026-08-26（小红书小工具技术规范定稿后首版）
> 项目定位：小红书「小工具」——把"今天吃什么"这一日常决策包装成"大转盘 + 压筹码下注 + 多轮权重极化收敛"的趣味决策小游戏
> 平台：小红书 App WebView 沙箱（Chromium ≥ 93），纯 HTML5 单页应用（HTML + CSS + JS），无后端、无构建
> 技术约束：见 AGENTS.md 运行与验证（可用 CSS3 动画/过渡、Canvas 2D、SVG、fetch/localStorage、触摸/手势；禁用 WebGL/WASM/Workers/eval/new Function/document.write/内联事件/外链 JS）
> 参考基准：AGENTS.md 结构（通用工具 → 配置 → 业务核心{旋转/下注/收敛/候选集管理} → 界面 → 静态数据）与代码规范；错误策略主线（不崩溃/不阻塞/有提示/能自愈）
> 实施状态：✅ **PL001 完整 MVP 已实施（V0.1.0.0，2026-08-26）+ PL002 赌场轮盘式玩法重构已实施（V0.1.1.0，2026-08-27：珠子式转盘 + 赌桌下注 + 拟物化 + 单屏自适应；无头回归 + 浏览器端到端全通）+ PL003 UI 可读性与布局治理已实施（V0.1.2.0，2026-11-07：盘面撤菜名 / 容器 480px / 状态行分层 / emoji 替换 / 落格反馈；taste-skill 复检非豁免 FAIL 清零）**

---

## 观察项豁免定案清单（历轮汇总）

_（内容暂空——永久豁免 / 条件豁免 / 价值权衡三级清单待后续归档）_

---

## 一、项目目标

在小红书小工具（WebView 沙箱，Chromium ≥ 93）内实现一个纯 HTML5 单页决策小游戏：用户面对一组"想吃的选项"（菜品 / 餐厅类别），通过大转盘旋转与压筹码下注的组合玩法，经若干轮博弈与概率事件收敛到"今天就吃这个"的唯一结果。交互趣味化优先，逻辑可解释（展示收敛轨迹）、结果可复现（seed 明确）。

核心能力：

1. 候选集管理（config 驱动，键名导入期校验）
2. 大转盘旋转（CSS3 transform: rotate，按权重概率停止）
3. 压筹码下注（预算内对各选项下注，影响权重）
4. 多轮权重极化收敛（末轮锁定唯一结果）
5. 随机源可复现（mulberry32 + seed + config 版本记录）
6. 无头验证（`.temp/verify_*`，不拉起浏览器）

---

## 二、技术选型

| 项     | 选型                                       | 理由                               |
| ------ | ------------------------------------------ | ---------------------------------- |
| 语言   | 原生 JavaScript（ES Module）               | 纯前端 / 无构建 / 契合 WebView     |
| 结构   | index.html + css/ + js/ + config/          | AGENTS.md 单向分层；离线包即整目录 |
| 动画   | CSS3 `transform: rotate` + `transition`    | 平台首选；Canvas 2D 兜底           |
| 配置   | config/candidates.json + config/rules.json | 可调参数外置（AGENTS.md 参数约定） |
| 随机源 | mulberry32（seed 可复现）                  | 小、确定性；结果可解释可复现       |
| 存储   | localStorage（`#seed=` 或记忆 seed）       | 平台可用；无后端                   |
| 框架   | 无（不引任何第三方框架/库）                | 依赖内嵌离线包、减体量、KISS       |

---

## 三、核心玩法与算法（权重极化式）

- 候选集 C = {选项}，各选项初始等权 `w_i = 1`（可被 `rules.json` 覆盖）。
- 每轮：用户对各选项压筹码 `c_i`（≥0，受 `budget` 限制）。极化更新：
  `w_i ← w_i × (1 + k·c_i / B)`，其中 `B = Σc_i`（本轮总注）；`B=0` 时权重不变。
- 旋转：用 RNG 在 `[0, Σw)` 取落点，按累计权重定位 `stopIndex`（权重大者更易停）。
- 收敛：重复 `rules.rounds` 轮（默认 3）；末轮锁定 `argmax(w_i)` 为最终结果；并列由 seed 决出（确定性）。
- 可复现：整局使用同一派生 seed 序列，记录 `{seed, configVersion}`，展示收敛轨迹。

---

## 四、目标项目结构

```text
fortune-noodle/
├── index.html              入口：挂载 UI + 引入模块（珠子层/赌桌/浮层/抽屉）
├── package.json            node ESM 声明（type: module）
├── css/wheel.css           拟物化转盘/筹码/赌桌样式 + 单屏自适应布局
├── js/
│   ├── random.js           可复现随机源（mulberry32 + seed 管理）
│   ├── candidates.js       候选集加载 + number 契约校验 + buildNumberMap
│   ├── weights.js          权重状态 + 升降权更新（命中升/未命中降）
│   ├── converge.js         多轮收敛编排（bets 下注 + 37 格定位 + 0 号随机菜）
│   ├── wheel.js            红黑布局表 + 37 扇区 + 珠子/盘面动画封装
│   ├── bet.js              下注类型枚举 + 号码集合映射 + 校验
│   ├── rules.js            规则配置契约（rounds/budget/k/payouts/zeroWeight/spin）
│   ├── ui.js               DOM 构建 / 刷新 / 赌桌面板 / 浮层 / 抽屉
│   └── main.js             启动装配与对局状态机
├── config/
│   ├── candidates.json     候选集（36 项菜品，number 1-36 全覆盖）
│   ├── rules.json          轮数 / 预算 / k / 赔率 / 0号权重 / 面额 / 动画参数
│   └── version.json        版本号单一来源（V0.1.2.0）
├── .temp/                  无头验证资产
│   ├── verify_layout.js / verify_candidates.js / verify_rules.js
│   ├── verify_wheel.js / verify_bet.js / verify_weights.js / verify_converge.js
│   ├── probe_pl002_core.js / probe_pl002_smoke.js / probe_pl002_ui.js
│   └── run_all.py          全量回归总入口
├── .opencode/              opencode 项目配置（skills）
└── AGENTS.md / README.md / z.plan.md / x.progress.md / w.study.md / y.problem.md
```

依赖方向：`ui → 业务核心 → 通用工具/配置 → 标准库`；无后端。

---

## 五、无头验证（`.temp/verify_*`，不拉起浏览器）

- `verify_random.js`：同 seed → 同序列；`[0,1)` 分布粗均匀性。
- `verify_candidates.js`：候选集键名校验（缺失/重复 → fail-fast）。
- `verify_weights.js`：`applyBet` 极化方向正确（高注选项权重单调上升）；零注不变。
- `verify_converge.js`：`runGame` 给定 seed 产出确定 `finalResult`；空候选/单候选/零注边界不崩、有确定输出。
- `verify_wheel.js`：`angleForIndex` 与 `stopIndex` 一致（不依赖动画）；累计权重定位正确。
- `verify_bet.js`：`validateChips` 预算校验（超预算拦截）。
- 全量回归 = 跑全部 `verify_*`；校验**不变量**（版本号正则、不写死值），行为断言为主。
- UI 层单独验证（截图/手动），核心逻辑已无头覆盖。

---

## 六、部署（离线包）

- 整目录（index.html + css/ + js/ + config/）作为资源包上传小红书创作者中心 → Builder Hub；依赖已内嵌，无外部 CDN。
- 纯前端改动重传即生效；仅当新增/移除 JS API 才需 iOS 8.27+ / Android 8.37+ 发版。
- 版本号单点导出（AGENTS.md「版本号唯一来源」）；README 徽章 / 进度文档同步。

---

## PL001. 大转盘小工具完整 MVP 实施方案（2026-08-26）

> 来源：小红书小工具技术规范（reference/redbooksmalltools.pdf）+ AGENTS.md/README.md 平台与架构定稿后立项；多轮对齐拍板（2026-08-26）
> 状态：📌 方案已确认，待实施

### 目标形态

| 区域   | 目标                                                                 |
| ------ | -------------------------------------------------------------------- |
| 候选集 | config 驱动加载并校验，键名导入期契约                                |
| 大转盘 | 按权重分布旋转，CSS3 动画，落点 = 计算结果（不弄虚作假）             |
| 压筹码 | 每轮预算内下注，筹码按比例极化对应选项权重                           |
| 收敛   | 多轮后锁定唯一结果，展示收敛轨迹（可解释）                           |
| 可复现 | seed + config 版本记录；URL `#seed=` / localStorage / 随机生成并记录 |

### 任务分解

- `PL001.1` 随机源 `js/random.js`（createRNG / next / int）—— 验证：verify_random
- `PL001.2` 候选集 `js/candidates.js`（loadCandidates + 键名校验）—— 验证：verify_candidates
- `PL001.3` 权重极化 `js/weights.js`（initWeights / applyBet）—— 验证：verify_weights
- `PL001.4` 收敛 `js/converge.js`（runGame 纯函数）—— 验证：verify_converge
- `PL001.5` 转盘 `js/wheel.js`（angleForIndex / spinTo）—— 验证：verify_wheel
- `PL001.6` 下注 `js/bet.js`（validateChips）—— 验证：verify_bet
- `PL001.7` 配置 `config/candidates.json` + `config/rules.json` —— 验证：契约校验
- `PL001.8` UI `index.html` + `css/wheel.css` + `js/ui.js` + `js/main.js` —— 验证：UI 单独（截图/手动）
- `PL001.9` 无头回归 `run_all.py` + 全量回归 —— 验证：全部 verify\_\* 0 失败
- `PL001.10` 文档同步（AGENTS.md/README/z.plan/进度）+ 版本号单点 —— 验证：版本三处一致

### 技术要点与硬限制

- WebView 禁用 WebGL / WASM / Workers / eval；旋转只用 CSS3 `transform` + `transition`；Canvas 2D 仅性能兜底。
- 依赖全部内嵌离线包；无外部 CDN；无构建步骤（纯静态 ES Module）。
- 全部业务核心为纯函数、无 DOM 依赖 → 无头可测。
- 结果先由 `Converge` 计算，旋转动画只是落点表现，不伪随机、不弄虚作假。
- 候选集空 / 单候选 / 全程零注 / 超预算等边界 fail-fast 或明确回落，不崩溃（AGENTS.md 错误策略主线）。
- 随机源 seed 与 config 版本必须记录，保证可复现。

### 工作量估算

| 部分          | 内容                          | 估算            |
| ------------- | ----------------------------- | --------------- |
| 核心逻辑      | PL001.1-4 随机/候选/权重/收敛 | 半天            |
| 界面与动画    | PL001.5-8 转盘/下注/UI/配置   | 半天            |
| 无头验证+收尾 | PL001.9-10                    | 2 小时          |
| 合计          |                               | **约 1~1.5 天** |

### 已拍板决策（2026-08-26 记录在案）

1. 范围？- 完整 MVP（全部核心逻辑 + UI + 配置 + 离线包）
2. 收敛机制？- 权重极化式（`w_i ← w_i×(1+k·c_i/B)`，末轮 argmax + seed 决并列）
3. 验证？- 含无头验证（`.temp/verify_*`，纯逻辑不拉起浏览器）
4. 随机源？- mulberry32（seed 可复现）
5. 默认参数？- `rounds=3`、`budget=100`、`k=0.5`、初始等权（rules.json 可调）
6. seed 来源？- URL `#seed=` → localStorage → 随机生成并记录

---

## PL002. 赌场轮盘式玩法重构（2026-08-26 定案）

> 来源：V0.1 MVP 完成后用户复盘——当前玩法是"菜品扇区转盘 + 直接对菜品下注"，与用户设想的赌场轮盘形态不符；多轮对齐拍板（2026-08-26）
> 状态：📌 方案已确认，待实施
> 目标版本：V0.1.1.0（version.json 单点 + README 徽章 + x.progress 版本行 + z.plan 状态行同步；四段式格式不变，历史 verify 中版本格式快照断言需排查）

### 背景

现有实现（PL001 权重极化式）：转盘扇区 = 10 个菜品，用户直接对菜品压筹码，`w_i ← w_i×(1+k·c_i/B)` 极化 3 轮收敛。用户期望的形态：**赌场轮盘**——转盘是 0-36 点数 + 红/黑颜色的标准 Roulette，下注压黑/红/大小/单个数字。

### 决策结论（2026-08-26 拍板）

1. **转盘形态**：标准欧洲轮盘 37 格（0 绿 + 1-36，红黑固定布局），不再是菜品扇区；呈现为**现实赌场轮盘式**——无指针，盘面旋转 + 一颗珠子沿盘缘轨道滚动减速落格，**落格数字 = 结果**
2. **数字映射**：36 个号码 = 36 个候选菜品（**一个号码一个菜**），红黑由号码固定布局自动决定
3. **0 号语义**：转中 0 号 = 随机神秘菜（从 36 菜均匀随机抽 1 个，权重直接升至当前最大，保留悬念可复现）
4. **下注类型**：红 / 黑 / 小(1-18) / 大(19-36) / 单个数字；**暂不做**奇偶 / 列注 / 打线（KISS，核心赌场感已足）
5. **胜负影响**：命中集合菜品权重升、未命中集合降（对称幅度），**降权不淘汰**；3 轮后 argmax 锁定（延续收敛机制）
6. **收敛**：延续 PL001 的 `rounds=3` + 末轮 argmax + seed 决并列；随机源 mulberry32 不变，0 号随机菜同样走 seed 派生可复现

### 设计要点与具体修改方案

#### 数据与配置

- `config/candidates.json`：10 项 → **36 项**；每项显式声明 `number` 字段（1-36），导入期契约校验：**1-36 全覆盖、号码唯一无重复、无超界**
- 颜色**不存**菜品上（号码→颜色由标准轮盘布局表决定，代码内声明——契约层定案：维度枚举不外置）
- `config/rules.json`：保留 `rounds/budget/k/chipDenominations/spin`；新增 `payouts`（红黑/大小 1:1、单号 1:35，纯展示用赔率）；升降权幅度复用 `k`（对称）

#### 红黑布局表（代码内声明）

- 欧洲轮盘标准布局落表：`[0:'green', 1:'red', 2:'black', ..., 36]`，共 37 格，红 18 / 黑 18 / 绿 1
- 位置：`js/wheel.js` 模块级常量（维度枚举代码内显式声明，对齐 P23 契约定案）

#### 珠子式转盘表现（2026-08-27 补充）

> 定案（2026-08-27）：呈现改为**现实赌场轮盘式**——无指针，盘面旋转 + 珠子沿盘缘轨道反向滚动、减速落格，落格数字 = 结果；落点仍由收敛逻辑先算出，动画只做落点表现（不弄虚作假、seed 可复现）

- **视觉模型**：内盘（37 格数字碗）旋转 + 一颗珠子沿盘缘轨道滚动，珠子减速后掉入格内
- **运动分解**：珠子 = 沿圆形轨道做圆周运动的元素（外层 `transform: rotate(θ_ball)` 驱动角位移 + 内层固定半径 translate）；盘面 = `transform: rotate(θ_disc)`；θ_ball 与 θ_disc **反向叠加**（仿真荷官抛珠 + 盘面旋转）
- **落点对齐**：收敛逻辑先算 `stopIndex` → 落点角 → **反向可逆推导**珠子与盘面的终止角（纯函数）；动画仅表现该终止状态，不产生新随机
- **减速曲线**：珠子与盘面用不同缓动（盘面先快后慢、珠子减速滑入落格），CSS `transition` 分两段或 WAAPI keyframes 控制
- **落格表现**：珠子落格瞬间位置切入扇区格内 + 轻微弹跳（WAAPI，`transform`/`opacity` 合成器友好）
- **实现约束**：全程只动 `transform`/`opacity`（守性能红线，不引库）；珠子/盘面终止角由 stopIndex 可逆推导 → 无头可测
- **无头验证**：`stopIndex ↔ 落点角 ↔ 号码` 双向一致；终止角推导为纯函数可断言

#### 模块改造（依赖方向不变：ui → 业务核心 → 配置）

| 文件               | 改动                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/candidates.js` | 契约新增 `number` 字段校验（全覆盖/唯一/超界）                                                                                                                                                 |
| `js/bet.js`        | 下注类型枚举 `red/black/low/high/single`；`betTypeToNumbers(type, n)` → 号码集合；`validateBets` 校验类型合法性 + 单号越界(0-36) + 预算；chips 向量改为下注描述 `[{type, amount}]`             |
| `js/weights.js`    | `applyBet(weights, bets, k)` 重构：命中集合 H（bets 展开的号码对应菜品）升权、未命中集合 M 降权，对称幅度，权重保底 > 0；0 号不参与升降                                                        |
| `js/wheel.js`      | 37 扇区（扇区角 = 360/37）；扇区颜色 = 布局表；扇区标签 = 号码（内圈）+ 极简菜名（外圈双环布局，字号 CSS 调）；**珠子轨道运动**：`ballEndAngles(stopIndex)` 可逆推导珠子/盘面终止角 + 落格位移 |
| `js/converge.js`   | 基本不动；`runGame` 签名微调（bets 描述替代 chips 向量）；0 号落点路径（随机神秘菜权重拉满）                                                                                                   |
| `js/ui.js`         | 下注面板改赌桌样式：红 / 黑 / 大 / 小四格 + 单号选择（点轮盘扇区或数字网格）；选中下注列表 / 余额 / 本轮总注；每轮结果展示落点号码 + 颜色 + 对应菜 + 命中/未命中清单                           |
| `js/main.js`       | 装配层适配新下注流；0 号结果展示"天降神秘菜"                                                                                                                                                   |
| `css/wheel.css`    | 轮盘红黑绿配色、赌桌下注区样式（红/黑/大/小大格）                                                                                                                                              |
| `index.html`       | 结构基本不变（下注区容器内改）                                                                                                                                                                 |

#### 拟物化 UI 设计要点（2026-08-26 补充）

> 定案：PL002 视觉走**拟物化（skeuomorphism）**风格——转盘/筹码/赌桌呈现真实材质立体感；全部用 CSS3 渐变 + 阴影 + 内嵌 SVG/data URI 实现，零外部资源、零 UI 库（KISS + WebView 约束下不引依赖）

- **转盘**：木质盘面（`conic-gradient` 木纹层 + `radial-gradient` 高光）+ 金属外环（多层 `box-shadow` 内阴影/描边）；盘面轻微 3D 倾斜（`perspective` + `rotateX`，属 CSS3 变换不触禁用清单）；**珠子**（金属质感小球，径向渐变 + 高光点）拟物化；**无指针**
- **筹码**：径向渐变圆环 + 侧壁阴影 + 描边，模拟真实筹码厚度；不同面额不同配色/纹路
- **赌桌**：绿色毛毡底（CSS 渐变 + 内嵌毛毡纹理 data URI）；红/黑/大/小下注格做凹陷立体感（`inset` 阴影 + 描边），单号数字网格同风格
- **性能红线（WebView 渲染弱）**：禁止大面积 `filter: blur`/`backdrop-filter`；静态质感随意，动效克制（旋转动画复用现有 CSS3 `transition`，不叠加复杂滤镜/多层动画）
- 拟物化参数（阴影色/渐变断点/纹理）走 `:root` CSS 变量集中管理，不散落

#### 动效选型（2026-08-26 补充）

> 定案：**默认零库**——CSS3 `transition`（转盘旋转，沿用 PL001）+ Web Animations API（`Element.animate()`，Chromium 93 原生支持）；仅当拟物手感（筹码弹性落入、珠子落格回弹）需要时可选引入，且必须内嵌离线包、无 CDN 动态加载

- **默认**：转盘旋转 = CSS3 `transform` + `transition`（已有）；筹码飞入 / 结果弹出 / 落点回弹 = Web Animations API（零依赖）
- **可选 Animate.css**：纯 CSS 入场动画类库，内嵌单个 `.css` 文件即可，合规性最干净（无 JS 无 eval）
- **可选 GSAP**：单文件 `.min.js`（约 70KB）内嵌；无依赖、生产构建不用 eval/new Function，不触禁用清单；弹性缓动（Back/Elastic/Bounce）用于拟物弹跳质感
- **不采用**：Lottie（预制作动画播放器，无法程序化对齐转盘计算结果——"落点 = 计算结果"底线；库 + AE 工具链 + json 资源体积重）、PixiJS（WebGL 系，禁用）、任何依赖 eval/new Function 或运行时外链 CDN 的库
- 所有动效仍守性能红线：静态质感随意、动效克制、禁大面积 blur/滤镜、不叠加多层复杂动画

#### 自适应布局设计要点（2026-08-27 补充）

> 定案（2026-08-27）：**强制单屏**——手机（320-430px）一屏内完整容纳转盘 + 轮次进度 + 赌桌下注区（无/极少滚动）；结果卡用覆盖式浮层、收敛轨迹用可折叠抽屉，均不占常驻布局。**仅手机宽度自适应**，宽屏（PC 预览/平板）保持居中单列即可（不做并排）。

- **视口驱动**：滚动容器用 `100dvh`（动态视口高度，适配手机地址栏收展）；转盘直径为布局主导：`min(88vw, calc(100dvh - 下注区高 - 头部高 - 安全区))`，`clamp()` 定上下限
- **常驻区固定**：赌桌下注区固定底部常驻（高度受控），转盘区 flex 吸收剩余空间；不滚动
- **结构重构（index.html）**：header 压缩（标题 + 轮次进度细条合并）；结果卡改覆盖式遮罩浮层（复用 pop-in 动画）；收敛轨迹改底部可折叠抽屉；seed/状态信息并入头部或下注区顶部细条，不再占独立 footer 高度
- **自适应手法**：盘径/字号/间距/阴影全部 `:root` CSS 变量集中，媒体查询（320 / 375 / 430 三段）+ `clamp()`/`min()`/`max()` 尺寸函数微调，禁写死 px；字体走系统栈
- **触摸与安全区**：下注按钮最小点击区 ≥ 44px；全区域补 `env(safe-area-inset-*)`（刘海 / 底部横条）
- **性能**：布局纯 CSS 为主，盘径等尺寸仅在视口变化时计算（ResizeObserver 兜底），不逐帧计算；不动滚动布局下的常量计算
- **验证**：无头覆盖布局不变量（媒体查询断点存在、关键区 display 规则）+ 浏览器冒烟（320/375/430 三档视口截图目检单屏无滚动溢出）

#### 无头验证适配（`.temp/verify_*`）

- `verify_candidates.js`：36 项 + number 契约（全覆盖/唯一/超界断言）
- `verify_layout.js`（新增）：布局表不变量——红 18 / 黑 18 / 绿 1、相邻扇区异色抽查、0 号绿色
- `verify_bet.js`：类型→号码集合映射（red=18 号 / black=18 号 / low=18 号 / high=18 号 / single=n）、越界拦截、预算校验
- `verify_weights.js`：命中升权 / 未命中降权方向断言、对称性、0 号不参与、权重保底
- `verify_wheel.js`：37 扇区、角度↔号码一致、落点定位
- `verify_converge.js`：3 轮收敛确定性、0 号随机菜路径（seed 可复现）

#### 版本与文档

- 版本号 → `V0.1.1.0`（version.json 单点 + README 徽章 + x.progress 版本行 + z.plan 状态行四处同步）
- 排查历史 verify 中版本号格式快照断言（四段式格式不变，重点查 `startswith("ver ")` 式写法）
- 结构树 / 契约说明 / 阶段验证命令速查同步更新（AGENTS.md 不维护速查，归 x.progress）

### 风险与取舍

- 36 菜候选集维护成本：菜名清单一次性写入 config，后续可在工具内调整（待定，不在本方案）
- 37 格扇区文字可读性：号码 + 菜名双环布局，字号/间距 CSS 参数走 `:root` 变量可调
- 0 号"随机神秘菜"可复现性：随机源走 seed 派生，结果可复现（可解释底线不破）
- 奇偶 / 列注 / 打线等赌法暂不实现：KISS 原则，核心红黑大小单号已满足赌场感；后续需要再加

### 关联

- 版本：V0.1.1.0（对应 PL002 全部改动一次提交）
- 涉及模块：config/candidates.json、config/rules.json、js/candidates.js、js/bet.js、js/weights.js、js/wheel.js、js/converge.js、js/ui.js、js/main.js、css/wheel.css、.temp/verify_*（新增 verify_layout.js）
- 不涉及：js/random.js（随机源不变）、js/rules.js（契约键增补 payouts）

## PL003. UI 可读性与布局治理（2026-11-07 定案）

> 来源：PL002 收尾后以 taste-skill（本项目 .agents/skills/taste-skill）对 UI 做真实浏览器检测——lint.mjs --app（11 文件）+ inspect.mjs --app（1440/768/390 三档实测截图）+ critique.md 评审；甄别拟物化豁免项后余 6 项真问题，总评 6.0（tiny-text FAIL 触发上限帽）；检测产物留档 .taste-skill/before/
> 状态：✅ **已实施（2026-11-07：7 组 15 条全完成；taste-skill 复检非豁免 FAIL 清零（tiny-text/edge-text/emoji/contrast 摘帽），余 4 FAIL 全为拟物化豁免项；probe_pl003_ui 15/15、probe_pl002_ui 10/10、run_all 7/7、反向验收 8/8 ACCEPT）**
> 目标版本：V0.1.2.0（已定版：version.json 单点 + README 徽章 + x.progress 版本行 + z.plan 状态行四处同步）

### 背景

PL002 拟物化赌场轮盘 UI 完成后做一轮 UI 检测找优化点。检测口径：拟物化渐变/阴影/浓彩为题材定案，豁免 taste-skill house rules（赌场拟物非模板风），只计可用性与布局真问题。实测 FAIL：盘面菜名 8px 不可读（22 处 <11px 文本块）、seed/提示文本贴视口边 12px、顶部状态行三段信息挤一行且引导提示被截断为"再点…"；WARN：对比度 4.3:1 不足（"收敛轨迹"）、数字无 tabular-nums；另桌面 1440 无容器约束全面崩坏（两侧各约 500px 空白、赌桌按钮拉满全宽）。单屏无滚动约束达成、safe-area 已处理、触控目标达标——底盘合格，治理集中在可读性与容器两件事。

### 决策结论（2026-11-07 拍板）

1. **盘面撤菜名、只留号码**：菜名在内缘（--label-radius 0.36em，内缘周长约 384px），37 个标签每个仅分到约 10px，而 4 字菜名需 32px+，挤压 4 倍且径向排布下半球文字永远倒置——几何不可行；菜名展示职责移交已有的结果浮层 + 轨迹抽屉；0 号扇区显示纯"0"，"神秘菜"由结果浮层揭晓
2. **根容器 max-width 480px 居中**：一条规则修复桌面档全部布局问题（seed/提示贴视口边、赌桌按钮拉满 1440 全宽、两侧空白）；与"强制单屏手机宽度"定位自洽，桌面预览 = 手机镜像；手机档（≤480px）视觉零变化
3. **顶部状态行分层**：seed/rules 为溯源元数据，移入轨迹抽屉头部；首屏只留"第 X/3 轮" + 引导提示（≥12px 完整显示、左右边距 ≥16px、禁止 ellipsis 截断）
4. **拟物化风格定案不动**：渐变/阴影/浓彩豁免 taste-skill house rules；复检基线以此口径记录（lint 的 gradient/shadow 项为豁免项不计 FAIL）
5. **emoji 3 处替换**：index.html 标题 🍜 → 内嵌 SVG 碗；ui.js 开转按钮 🎯 → 内嵌 SVG 或纯文字；main.js 轨迹文案 🎲 → 纯文字（拟物体系内自洽）
6. **可用性底线**：全部文字对比度 ≥4.5:1；数字 font-variant-numeric: tabular-nums；22 处 <11px 文本随决策 1/3 一并消化

### 设计要点与具体修改方案

#### 盘面文字治理（css/wheel.css + js/ui.js）

- 删除扇区菜名标签层（现 0.018em ≈ 6-8px）；号码字号由 0.032em（≈11px）放大到扇区可容纳的合理占比（外缘周长约 1000px+，1-2 位数字空间充足）
- 0 号绿色扇区保留纯"0"；结果揭晓走已有结果浮层不改动
- 仅存盘面标签相关 CSS 变量（--label-radius 等）按需保留或删除，不留死变量

#### 根容器约束（index.html + css/wheel.css）

- 根容器（.app 或等效）max-width: 480px + margin: 0 auto；body 暗色地面使桌面两侧呈现统一底色
- 手机档视觉零变化（容器即满宽），before/after 截图对比确认

#### 状态行分层（js/ui.js + js/main.js + index.html）

- seed/rules 移入轨迹抽屉头部（溯源元数据区）；首屏状态行只留轮次 + 引导提示
- 引导提示完整显示：≥12px、边距 ≥16px、文案长度控制在一行可容纳范围

#### 对比度与数字排版（css/wheel.css）

- 全部文字对比度 ≥4.5:1（"收敛轨迹" 4.3:1 等逐项提档）
- 预算余额 / 筹码数字 / seed 加 font-variant-numeric: tabular-nums

#### emoji 替换（index.html + js/ui.js + js/main.js）

- 🍜 标题：内嵌 SVG 小碗（延续拟物内嵌 SVG 能力）；🎯 开转按钮：内嵌 SVG 旋转箭头或纯文字"开转"；🎲 轨迹文案：纯文字

#### 落格反馈强化（css/wheel.css + js/ui.js）

- 珠子落定后命中格金色高亮 ring + 约 300ms 脉冲（WAAPI，只动 transform/opacity 守性能红线）
- 筹码/下注按钮 :active 按压态（scale 0.96 + 亮度变化）补齐

#### 验证与基线（.temp/ + .gitignore + 文档）

- 复检：inspect.mjs --app 重跑，目标非豁免 FAIL = 0（tiny-text/edge-text 摘帽、contrast/tabular 摘 WARN）+ critique 复评总分记录
- 回归：run_all.py 全量 0 失败（UI 改动不碰核心层，回归保底）
- before/after：inspect 输出 .taste-skill/after 与 before 并排；.gitignore 补 .taste-skill/（检测产物本地留档不入库）

### 关联

- 版本：V0.1.2.0（对应 PL003 全部改动一次提交）
- 涉及模块：css/wheel.css、js/ui.js、js/main.js、index.html、.gitignore（补 .taste-skill/）、README/z.plan/x.progress（定版同步）
- 不涉及：js/random.js、js/candidates.js、js/rules.js、js/bet.js、js/weights.js、js/wheel.js、js/converge.js（核心逻辑零改动）、config/（配置零改动）
