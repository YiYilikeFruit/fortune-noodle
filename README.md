# 幸运饭桶大转盘

> **V0.1.0.0** · 版本号唯一来源：[`config/version.json`](config/version.json)

用大转盘 + 压筹码的趣味游戏，帮你决定今天吃什么。

## 项目简介

小红书「小工具」。利用大转盘结合压筹码的形式，通过复杂的游戏形式，获得用户想吃什么的简单小工具。

把"今天吃什么"这一日常决策包装成一场趣味小游戏：用户面对一组"想吃的选项"（菜品 / 餐厅类别），通过大转盘旋转与压筹码下注的组合玩法，经过若干轮博弈与概率事件，最终收敛到"今天就吃这个"的结果。本质是一个决策辅助小工具，交互趣味化优先，逻辑可解释、结果可复现。

## 技术平台

小红书「小工具」——运行在小红书 App 的 WebView 沙箱内，纯 HTML5 单页应用。

| 项       | 说明                                                |
| -------- | --------------------------------------------------- |
| 平台     | 小红书（Xiaohongshu / RedBook）                     |
| 容器     | WebView（Chromium ≥ 93），独立 iframe 沙箱          |
| 技术栈   | HTML + CSS + JavaScript（无后端）                   |
| 部署方式 | PC 上传（创作者中心 → Builder Hub）或移动端笔记挂载 |
| 更新方式 | 纯前端改动无需客户端发版（新增/移除 JS API 除外）   |

### 能力边界（来源：`reference/redbooksmalltools.pdf`）

**可用：** CSS3 动画/过渡（转盘旋转首选）、Canvas 2D（性能兜底）、SVG、fetch/XHR/WebSocket、localStorage/sessionStorage、触摸/手势事件、传感器、位置信息（需授权）

**禁用：** WebGL、WebAssembly、Web Workers（离线包模式）、eval()/new Function()、document.write()、内联事件处理、动态加载外部 JS（白名单外）、WebRTC 等

## 目录

- [项目简介](#项目简介)
- [技术平台](#技术平台)
- [项目展示](#项目展示)
- [特性](#特性)
- [快速开始](#快速开始)
- [使用说明](#使用说明)
- [项目结构](#项目结构)
- [依赖](#依赖)
- [常见问题](#常见问题)
- [维护者](#维护者)
- [许可证](#许可证)

## 项目展示

<!-- 待补充：上线后补充界面截图 / 玩法示意 -->

## 特性

- 🎡 **大转盘旋转**：CSS3 动画驱动的流畅转盘旋转
- 💰 **压筹码博弈**：每轮对不同选项下注，筹码影响最终结果
- 🎯 **多轮收敛**：经过若干轮博弈与概率事件，收敛到唯一结果
- 🔄 **可解释可复现**：随机源与种子明确，结果可复现
- 📱 **移动端优先**：适配小红书 App 内嵌场景，触摸交互友好

## 快速开始

### 环境要求

- 现代浏览器（Chromium ≥ 93）或小红书 App
- 任意文本编辑器 + 浏览器开发者工具

### 开发

<!-- 待补充：本地开发启动命令 -->

### 部署（小红书小工具）

1. 进入 [小红书创作者中心](https://creator.xiaohongshu.com)
2. 左侧菜单 → Builder Hub → 小工具
3. 点击「创建小工具」，填写名称/简介/图标
4. 上传小工具资源包（HTML/CSS/JS，依赖须内嵌）
5. 提交审核，通过后即可在笔记中挂载使用

## 使用说明

1. 选择想吃的选项（菜品 / 餐厅类别）
2. 旋转大转盘，查看指针指向
3. 根据结果决定是否压筹码（可影响后续轮次权重）
4. 经过多轮博弈，最终收敛到"今天就吃这个"

## 项目结构

```text
fortune-noodle/
├── index.html              # 入口：挂载 UI + 引入模块
├── package.json            # node ESM 声明（type: module）
├── css/wheel.css           # 转盘 / 筹码面板 / 结果区样式
├── js/
│   ├── random.js           # 可复现随机源（mulberry32 + seed 管理）
│   ├── candidates.js       # 候选集加载 + 键名导入期校验（契约层）
│   ├── weights.js          # 权重状态 + 极化更新
│   ├── converge.js         # 多轮收敛编排（createGame 两段式 + runGame 包装）
│   ├── wheel.js            # 累计权重定位 + 扇区角换算 + CSS3 旋转动画
│   ├── bet.js              # 压筹码输入校验 + 面额配置契约 + 向量转换
│   ├── rules.js            # 规则配置契约（rounds/budget/k/chipDenominations/spin 校验）
│   ├── ui.js               # DOM 构建 / 刷新 / resolveSeedSource 纯函数
│   └── main.js             # 启动装配与对局状态机
├── config/
│   ├── candidates.json     # 候选集（10 项菜品/餐厅，键名与规则声明）
│   ├── rules.json          # 轮数 / 筹码预算 / 极化系数 k / 面额 / 动画参数
│   └── version.json        # 版本号单一来源（V0.1.0.0）
├── .temp/                  # 无头验证资产（gitignore）
├── .pi/                    # pi 项目配置（skills/tasks，gitignore）
├── .reference/             # 参考文档（含技术规范 PDF，gitignore）
├── AGENTS.md               # 项目说明（AI 工作约定）
├── README.md               # 本文件
├── z.plan.md               # 项目规划与方案文档
├── x.progress.md           # 进度清单
├── w.study.md              # 技术研究笔记
└── y.problem.md            # 问题记录
```

## 依赖

<!-- 待补充：前端资源包（HTML/CSS/JS）依赖随技术栈确定后填写 -->

## 常见问题

### 为什么不用 WebGL？

小红书小工具容器出于安全考虑禁用了 WebGL。转盘旋转动画通过 CSS3 `transform: rotate()` + `transition` 实现，性能和流畅度完全够用。

### 离线包是什么？

小红书会将小工具的前端资源（HTML/CSS/JS）通过 CDN 加速并缓存到本地。离线时静态资源仍可用，但网络请求（fetch/XHR/WebSocket）需要网络。

### 如何更新小工具？

纯前端改动（不涉及新增/移除 JS API）无需客户端发版，重新上传资源包即可生效。

## 维护者

<!-- 待补充 -->

## 许可证

<!-- 待补充 -->
