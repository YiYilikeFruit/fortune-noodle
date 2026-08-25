# 幸运饭桶大转盘 项目方案报告

> 方案日期：2026-08-26（小红书小工具技术规范定稿后首版）
> 项目定位：小红书「小工具」——把"今天吃什么"这一日常决策包装成"大转盘 + 压筹码下注 + 多轮权重极化收敛"的趣味决策小游戏
> 平台：小红书 App WebView 沙箱（Chromium ≥ 93），纯 HTML5 单页应用（HTML + CSS + JS），无后端、无构建
> 技术约束：见 AGENTS.md 运行与验证（可用 CSS3 动画/过渡、Canvas 2D、SVG、fetch/localStorage、触摸/手势；禁用 WebGL/WASM/Workers/eval/new Function/document.write/内联事件/外链 JS）
> 参考基准：AGENTS.md 结构（通用工具 → 配置 → 业务核心{旋转/下注/收敛/候选集管理} → 界面 → 静态数据）与代码规范；错误策略主线（不崩溃/不阻塞/有提示/能自愈）
> 实施状态：✅ **PL001 完整 MVP 已实施（V0.1.0.0，2026-08-26；权重极化式 + 无头验证 + 浏览器冒烟全通）**

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
├── index.html              入口：挂载 UI + 引入模块
├── package.json            node ESM 声明（type: module）
├── css/wheel.css           转盘 / 筹码面板 / 结果区样式
├── js/
│   ├── random.js           可复现随机源（mulberry32 + seed 管理）
│   ├── candidates.js       候选集加载 + 键名导入期校验（契约层）
│   ├── weights.js          权重状态 + 极化更新
│   ├── converge.js         多轮收敛编排（createGame 两段式 + runGame 包装）
│   ├── wheel.js            累计权重定位 + 扇区角换算 + CSS3 旋转动画
│   ├── bet.js              压筹码输入校验 + 面额配置契约 + 向量转换
│   ├── rules.js            规则配置契约（rounds/budget/k/chipDenominations/spin 校验）
│   ├── ui.js               DOM 构建 / 刷新 / resolveSeedSource 纯函数
│   └── main.js             启动装配与对局状态机
├── config/
│   ├── candidates.json     候选集（10 项菜品/餐厅，键名与规则声明）
│   ├── rules.json          轮数 / 筹码预算 / 极化系数 k / 面额 / 动画参数
│   └── version.json        版本号单一来源（V0.1.0.0）
├── .temp/                  无头验证资产
│   ├── verify_random.js / verify_candidates.js / verify_weights.js
│   ├── verify_converge.js / verify_wheel.js / verify_bet.js
│   ├── verify_config.js / verify_ui.js / assert_lite.mjs
│   ├── probe_pl001_core.js / probe_pl001_456.js / probe_pl001_789.js
│   ├── probe_pl001_789.py / run_all.py
│   └── ui_smoke_result.png / ui_smoke_wheel.png（冒烟截图）
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
