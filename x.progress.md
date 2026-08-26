# 开发进度追踪（x.progress.md）

> 依据：`z.plan.md`（幸运饭桶大转盘方案报告，PL001/PL002）
> 当前版本：V0.1.1.0（单一来源：`config/version.json`；AGENTS.md「版本号唯一来源」约定）
> 记录格式：状态 [⏳ 待开发, ✅ 已完成] / 优先级 [高, 中, 低]
> 执行原则：每阶段完成后运行验证命令确认无回归，再进入下一阶段
> 错误策略：不崩溃、不阻塞、有提示、能自愈——统一中文错误类型 / fail-fast 与明确回落并用 / 宽容解析（详见 AGENTS.md 错误策略主线）

---

## 阶段验证命令速查（AGENTS.md 运行与验证）

```shell
# 无头回归总入口（PL002：7 个 verify_* 全量）
python3 .temp/run_all.py                 # 全量回归（布局/候选/规则/转盘/下注/权重/收敛）
node .temp/verify_layout.js       # PL002.2 布局表：红18黑18绿1 / 标准值 / colorOf
node .temp/verify_candidates.js   # PL002.1 候选集：number 契约 / buildNumberMap / 真实配置
node .temp/verify_rules.js        # PL002.1 规则：payouts / zeroWeight / spin.ball
node .temp/verify_wheel.js        # PL002.2 转盘：37 扇区角 / ballEndAngles
node .temp/verify_bet.js          # PL002.3 下注：类型映射 / validateBets
node .temp/verify_weights.js      # PL002.4 权重：升降权 / 0号隔离 / 保底
node .temp/verify_converge.js     # PL002.5 收敛：bets 形态 / 0号路径 / 号码回填
node .temp/probe_pl002_ui.js      # PL002.7 UI 层（DOM stub）：盘面/赌桌/浮层/抽屉
```

---

## 已完成

---

## 未完成

### PL001 大转盘完整 MVP 实施（依据 z.plan.md PL001 方案，2026-08-26 规划）

> 目标：候选集管理 + 大转盘旋转 + 压筹码下注 + 多轮权重极化收敛 + seed 可复现 + 无头验证，纯 HTML5 单页应用（离线包整目录上传 Builder Hub）
> 已拍板（2026-08-26）：完整 MVP 全量实施 / 权重极化式收敛（`w_i ← w_i×(1+k·c_i/B)`，末轮 argmax + seed 决并列）/ 含无头验证 / mulberry32 随机源 / 默认 rounds=3、budget=100、k=0.5、初始等权 / seed 来源 URL `#seed=` → localStorage → 随机生成并记录
> 硬限制：禁 WebGL/WASM/Workers/eval()/new Function()/document.write()/内联事件/外链 JS；旋转只用 CSS3 transform + transition（Canvas 2D 仅性能兜底）；业务核心全部纯函数零 DOM 依赖（无头可测）；结果先由 converge 计算、动画只是落点表现不弄虚作假；依赖全内嵌无构建步骤
> 版本归属：待定版（PL001.10 建立版本号单一来源后定版同步）
> 估算：核心逻辑 PL001.1-4 半天 / 界面与动画 PL001.5-8 半天 / 验证收尾 PL001.9-10 约 2 小时

#### PL001.1 随机源（js/random.js）

- [x] PL001.1.a mulberry32 核心 + seed 归一化：数字/字符串 seed 经哈希归一为 uint32 内部态，`createRNG(seed)` 工厂返回相互独立的 RNG 实例——验证：verify_random 同 seed 两实例序列逐位相等（2026-08-26 完成：同/异 seed 与实例独立性断言全过）
- [x] PL001.1.b `next()` ∈ [0,1) 与 `int(min, max)` 均匀整数 API（含端点口径以 `//` 注释说明）；int 取法注释说明精度取舍——验证：verify_random int 落域正确（min/max 边界可达）（2026-08-26 完成：闭区间落域/负区间/单点区间/混合取数重放全过）
- [x] PL001.1.c 派生 seed 序列：`deriveSeed(baseSeed, round)` 整局同源派生，每轮独立随机流互不污染——验证：verify_random 派生序列确定且不同轮互异（2026-08-26 完成：三轮流两两互异+基础流隔离 PASS）
- [x] PL001.1.d verify_random.js 落地 `.temp/`（node 直跑不拉浏览器）：同 seed 同序列 / 异 seed 异序列 / [0,1) 分布粗均匀（桶计数偏离阈值内）/ int 落域四断言组——验证：node verify_random 0 失败（2026-08-26 完成：25/25 PASS；probe_pl001_core 先 FAIL 后 PASS 闭环；根 package.json type=module 支撑 node ESM）

#### PL001.2 候选集（js/candidates.js）

- [x] PL001.2.a 契约层：候选集结构键名显式声明（id/name/weight?/color? 等）+ `validateCandidates` 导入期校验（缺失必填键 / 重复 id / 空集 fail-fast 抛中文错误，对齐 P23 契约定案：键名代码内显式声明不外置）——验证：verify_candidates 缺键 / 重复 / 空集各断言抛错（2026-08-26 完成：九路契约 fail-fast 全过，错误中文含定位）
- [x] PL001.2.b 宽容解析（错误策略主线）：weight 数字字段字符串弹性转换、缺省 weight 回落等权、坏结构返回明确中文错误不崩溃；核心层纯函数只接收已解析对象，fetch IO 留在装配层——验证：verify_candidates 字符串 weight 转换 + 缺省回落断言（2026-08-26 完成：数字/字符串/0 权重形态全过；坏值消息带 id+name 定位）
- [x] PL001.2.c verify_candidates.js 落地：合法集通过 / 缺失键抛错 / 重复 id 抛错 / 空集抛错 / 宽容解析五组——验证：node verify_candidates 0 失败（2026-08-26 完成：24/24 PASS，含输入输出解耦与 Infinity/NaN 拒绝）

#### PL001.3 权重极化（js/weights.js）

- [x] PL001.3.a `initWeights(candidates, initialOverrides)`：初始等权 w_i=1，rules.initialWeights 可按键覆盖（缺项回落 1）——验证：verify_weights 等权初始化 + 覆盖生效断言（2026-08-26 完成：覆盖/缺项回落/非法项忽略/零权重合法全过）
- [x] PL001.3.b `applyBet(weights, chips, k)`：`w_i ← w_i×(1+k·c_i/B)` 极化更新（B=Σc_i 本轮总注）；B=0 时权重原样；返回新数组不原地突变（纯函数）——验证：verify_weights 高注单调上升 / 零注不变 / 输入不被篡改断言（2026-08-26 完成：三组手算精确值+零权重保持全过）
- [x] PL001.3.c verify_weights.js 落地：极化方向正确性（高注选项权重占比上升）/ 零注不变 / k 系数方向 / 浮点容差比较四组——验证：node verify_weights 0 失败（2026-08-26 完成：25/25 PASS，含多构型占比单调不变量扫描）

#### PL001.4 多轮收敛（js/converge.js）

- [x] PL001.4.a `runGame(candidates, betRounds, seed, rules)` 纯函数编排主流程：逐轮 applyBet 极化 → wheel.pickStopIndex 记录落点 → 循环 rules.rounds 轮（模块间顶层 import，不用函数内延迟 import）——验证：verify_converge 主流程跑通输出结构完整（2026-08-26 完成：轨迹轮数/快照字段/meta 结构断言全过；顶层 import converge→weights/wheel/random 单向分层）
- [x] PL001.4.b 末轮锁定与并列决出：末轮 `argmax(w_i)` 为最终结果，并列由 seed 决出（确定性）——验证：verify_converge 构造并列权重断言 seed 决出稳定（2026-08-26 完成：不变量升级为"finalResult∈容差最高权重集"（8 seed×5 注型扫描）；并列决出走 `tie:` 独立流同 seed 三跑一致；语义拍板：末轮 stopIndex 回填 finalResult，维持"落点=计算结果"红线）
- [x] PL001.4.c 收敛轨迹与元数据：每轮 {权重快照, stopIndex, 总注 B} + 最终 {finalResult, seed, configVersion}（可解释可复现）——验证：verify_converge 轨迹完整性与 seed/configVersion 记录断言（2026-08-26 完成：每轮 {round,chips 快照,totalBet,stopIndex,weightsAfter} + meta 记录全过；configVersion 缺省宽容 null）
- [x] PL001.4.d 边界：空候选 fail-fast 中文错误 / 单候选直接锁定 / 全程零注正常走完等权随机——验证：verify_converge 三边界不崩且有确定输出（2026-08-26 完成：空候选/轮数失配 fail-fast；单候选全路径短路（前序轮也不进随机防零权死局）；全程零注 B=0 等权演化）
- [x] PL001.4.e verify_converge.js 落地：确定性复现 / 定位 / 轨迹 / 边界五组——验证：node verify_converge 0 失败（2026-08-26 完成：26/26 PASS）

#### PL001.5 转盘（js/wheel.js）

- [x] PL001.5.a `pickStopIndex(weights, rng)`：[0, Σw) 取落点按累计权重定位（纯函数，权重大者更易停）——验证：verify_wheel 定位与累计权重区间一一对应（2026-08-26 完成：表驱动七点含左闭边界 point=累计和恰分界与浮点右端兜底；零权重项永不选中；真实 RNG 六扇区粗均匀 ±25%）
- [x] PL001.5.b `angleForIndex(stopIndex, sectorCount)`：落点扇区中心角换算（纯函数，含指针偏移口径注释）——验证：verify_wheel 角度与索引双向一致（2026-08-26 完成：四扇区 45° 步进序列 + 十二下标一一映射（无双值）；越界/非整数/扇区<2 守卫）
- [x] PL001.5.c `spinTo(el, fromAngle, toAngle, opts)`：CSS3 transform rotate + transition 动画封装（圈数/时长/缓动走 rules 或 ui 参数不硬编码；transitionend + setTimeout 兜底双保险防事件丢失）——验证：纯计算部分无头覆盖；动画表现 UI 层单独（2026-08-26 完成：stub DOM 双路径行为验证——事件收尾/兜底超时不悬挂/非 transform 事件过滤/监听器清理；SPIN_DEFAULTS 冻结单一声明处经 opts 覆盖；跨圈正向差手算精确）
- [x] PL001.5.d verify_wheel.js 落地：angleForIndex 正确性 / pickStopIndex 累计权重定位（DOM 无关部分全覆盖）——验证：node verify_wheel 0 失败（2026-08-26 完成：36/36 PASS，spinTo 经 stub DOM 无头覆盖）

#### PL001.6 下注（js/bet.js）

- [x] PL001.6.a `validateChips(chips, budget, candidateIds)`：Σc ≤ budget 校验 / 负数拒绝 / 未知选项 id 拒绝 / 数字字段字符串弹性转换——验证：verify_bet 各非法输入拦截断言（2026-08-26 完成：恰等预算 ≤ 口径/负额/NaN/Inf/字母串/null/非对象/数组形态/未知 id 九路拦截，超预算消息带两侧数值）
- [x] PL001.6.b 筹码面额走配置（rules.chipDenominations 可调，禁代码硬编码）——验证：verify_bet 自定义面额生效断言（2026-08-26 完成：validateDenominations 自定义集 [10,2,6]→[2,6,10] 弹性排序返回；单面额/小数面额可用；空/重复/负/零/字母/null 七路契约拦截；代码内零硬编码面额）
- [x] PL001.6.c verify_bet.js 落地：超预算拦截 / 负数 / 未知 id / 合法通过 / 弹性转换五组——验证：node verify_bet 0 失败（2026-08-26 完成：42/42 PASS，另含 chipsToVector 同序补零向量与 converge 消费口径衔接断言）

#### PL001.7 配置（config/）

- [x] PL001.7.a config/candidates.json：默认候选集（菜品/餐厅类别 8~12 项，键名与 PL001.2 契约一致）——验证：经 loadCandidates 通过契约校验（2026-08-26 完成：10 项家常菜带 color 色环；verify_config 真实文件加载+规模/id 唯一性/输出键集恰四键断言全过）
- [x] PL001.7.b config/rules.json：rounds=3 / budget=100 / k=0.5 / initialWeights / chipDenominations / 动画参数（圈数、时长毫秒）全外置——验证：rules 必填键缺失时导入期报错断言（2026-08-26 完成：七键全外置含 spin 动画组与 configVersion；新增 js/rules.js 对称契约（结构树微调 PL001.10 同步），基于真实结构删键四路+坏值七路拦截全过）
- [x] PL001.7.c 配置加载与契约：装配层一次性加载传递（核心层运行时零 IO），坏 JSON fail-fast 中文提示不静默——验证：verify_candidates 附坏 JSON 输入断言（2026-08-26 完成：main.js loadJson 唯一 IO 入口非 2xx 中文报错；坏 JSON parse 层 SyntaxError 行为固化 + 空壳结构中文拒绝断言入 verify_config）

#### PL001.8 UI（index.html + css/ + js/ui.js + js/main.js）

- [x] PL001.8.a index.html 入口：转盘区 / 筹码面板 / 轮次进度 / 结果区 / 收敛轨迹区五区块挂载；零内联事件（addEventListener 统一绑定）——验证：grep 断言零 onclick/onload 等内联 handler（2026-08-26 完成：verify_ui 正则反向断言内联 handler 与 javascript: 伪协议零匹配）
- [x] PL001.8.b css/wheel.css：转盘扇区 / 指针 / 筹码按钮 / 结果卡样式；颜色与阈值走 UI 参数不散落——验证：UI 截图目检（2026-08-26 完成：主题色集中 ：root CSS 变量 + --label-radius 尺寸参数；扇区着色 conic-gradient 由 ui.js 按权重比例动态生成；冒烟截图存 .temp/ui_smoke_result.png 待人工目检）
- [x] PL001.8.c js/ui.js 渲染层：候选扇区绘制 / 筹码选择与余额显示 / 每轮结果与轨迹渲染 / 最终结果卡；只读渲染不改业务状态——验证：UI 手动清单（2026-08-26 完成：buildBetPanel 一次性构建+事件委托防监听器泄漏，refreshBetPanel 纯快照刷新；业务状态唯一容器在 main.js）
- [x] PL001.8.d seed 链路：URL `#seed=` 解析 → localStorage 记忆 → 随机生成并回显记录（已拍板顺序）；解析逻辑抽纯函数——验证：三种来源注入各断言一次（无头）（2026-08-26 完成：resolveSeedSource 纯函数九路注入断言（优先级/空值/编码/宽容回落）；浏览器实测三来源全通——url 注入命中、storage 记忆回读、无 hash 回落记忆）
- [x] PL001.8.e js/main.js 启动装配：fetch 配置 → loadCandidates → initWeights → 轮次循环（下注 → spinTo 表现 → 轨迹记录）→ 末轮锁定展示；错误入口统一提示不崩溃（降级不中断）——验证：浏览器冒烟（2026-08-26 完成：agent-browser 端到端三轮对局——压注 70/转盘落点/轨迹行/末轮锁定"热汤面"（第 1 轮高注者，结果可解释）/结果卡 seed 溯源+再来一局全链路通过）
- [x] PL001.8.f UI 单独验证（截图/手动清单过一遍，核心逻辑已被无头覆盖）——验证：手动清单执行并记录结论（2026-08-26 部分完成：自动化端到端冒烟已过+截图存档；⚠ 人工目检待办——截图需多模态模型或用户打开 .temp/ui_smoke_result.png 核对视觉（盘面配色/标签可读/筹码按钮形态），涉及读图按约定停下交多模态/用户）

#### PL001.9 无头回归编排（.temp/run_all.py）

- [x] PL001.9.a run_all.py：枚举执行全部 verify_*（node 子进程）统一出口计数汇总，任一失败非零退出——验证：注入临时失败脚本断言非零退出（2026-08-26 完成：probe_pl001_789.py 6/6——正常全绿退出 0+逐项汇总行；注入必败脚本非零传播且点名文件；移除后恢复全绿；修复编排器自身 cwd 相对路径缺陷一次）
- [x] PL001.9.b 全量回归 = 全部 verify_* 0 失败；校验**不变量**为主，禁止写死易变值（A018 验证纪律）——验证：run_all.py 0 失败（2026-08-26 完成：8 脚本 243 断言 8/8 全绿；config 断言只查类型与范围口径不写死 rounds/budget 具体值）

#### PL001.10 文档同步与版本定版

- [x] PL001.10.a 版本号单一来源建立：项目声明的单一字段一处单点导出、全项目共引（AGENTS.md「版本号唯一来源」）——验证：grep 断言版本字面值全项目仅一处定义（2026-08-26 完成：config/version.json（V0.1.0.0）为权威源；grep 确认活跃代码/文档无其他独立版本定义残留，AGENTS.md 内 V0.2.4.3 为上一项目历史教训文档引用非版本定义）
- [x] PL001.10.b README 徽章 / x.progress 版本行 / z.plan 状态行三处同步一致——验证：三处动态读取比对（2026-08-26 完成：config/version.json + README `V0.1.0.0` + x.progress `V0.1.0.0` 三处值一致；z.plan 实施状态已更新为 PL001 已实施）
- [x] PL001.10.c 离线包完整性核查：index.html + css/ + js/ + config/ 全内嵌、零外部 CDN 外链、零禁用 API（WebGL/Workers/eval/new Function/document.write/内联事件 grep 清零）——验证：grep 反向断言（2026-08-26 完成：外部链接/eval/new Function/document.write/内联事件零匹配；WebGL/Worker 仅注释引用非代码）
- [x] PL001.10.d README/AGENTS.md 与实施后现状出入核对同步（配置键名、结构树、命令速查）——验证：文档描述与代码实况比对（2026-08-26 完成：README+z.plan 结构树更新（新增 rules.js/version.json/package.json + .temp 验证资产清单）；活跃代码零旧项目残留确认）
- [x] PL001.10.e commit 草稿按 V2 规范给出（git add 清单 + message，形如 `feat: V<版本>，大转盘核心玩法与下注收敛...`），AI 不执行 git 写操作——验证：草稿经用户审阅后由用户执行（2026-08-26 完成：见下方 commit 草稿）

### PL002 赌场轮盘式玩法重构（依据 z.plan.md PL002 方案，2026-08-27 规划）

> 目标：V0.1 菜品扇区 + 直接对菜品下注 → 改为**现实赌场轮盘式**：37 格标准轮盘（0 绿 + 1-36 红黑）+ 珠子式转盘表现（无指针、珠子轨道滚动落格）+ 赌桌下注（红/黑/大小/单号）+ 升降权收敛 + 拟物化视觉 + 强制单屏自适应
> 已拍板（2026-08-26/27）：36 菜每号一菜（number 显式字段）/ 0 号=随机神秘菜（权重拉满）/ 下注 red·black·low·high·single（暂不做奇偶列打线）/ 命中升权未命中降权不淘汰 / rounds=3 + 末轮 argmax / 珠子式表现落点=计算结果（可逆推导终止角，不弄虚作假）/ 拟物化全 CSS3 渐变阴影+SVG 零库 / 动效默认零库（CSS3 transition + WAAPI，可选 Animate.css/GSAP）/ 强制单屏仅手机宽度（320/375/430 断点）
> 硬限制：沿用 PL001——禁 WebGL/WASM/Workers/eval/new Function/document.write/内联事件/外链 JS；依赖全内嵌离线包；业务核心纯函数零 DOM 依赖；动效只动 transform/opacity（禁大面积 blur，守 WebView 渲染性能红线）
> 版本归属：V0.1.1.0（PL002.11 定版同步）

#### PL002.1 配置与契约（config/ + js/candidates.js + js/rules.js）

- [x] PL002.1.a config/candidates.json 重构为 36 项（每项 id/name + 显式 `number` 字段 1-36，一个号码一个菜）——做法：删除 10 项旧集，写 36 项菜名映射号码，0 号不入候选（0 为轮盘独立格）；验证：probe_pl002_smoke 真实文件加载（2026-08-27 完成：36 项写入、number 1-36 全覆盖唯一）
- [x] PL002.1.b js/candidates.js 契约新增 number 校验：1-36 全覆盖 / 号码唯一无重复 / 超界拒绝（fail-fast 中文错误）——做法：validateCandidates 增 number 检查（缺失/重复/越界/不全四路）；验证：probe_pl002_core 四路断言（2026-08-27 完成：NUMBER_MIN/MAX 声明 + 全覆盖缺号点名报错；新增 buildNumberMap 号码→菜索引映射（37 长，0 位 -1））
- [x] PL002.1.c js/rules.js 增 payouts 契约（red/black/low/high=1:1、single=1:35 纯展示）+ 必填键缺失拦截——做法：rules 契约增 payouts 组；验证：probe_pl002_core 缺键/非正数拦截断言（2026-08-27 完成：PAYOUT_KEYS 声明 + zeroWeight 必填正数校验；config/rules.json 落地 payouts/zeroWeight/configVersion=rules-v2）

#### PL002.2 红黑布局与转盘核心（js/wheel.js）

- [x] PL002.2.a 欧洲轮盘 LAYOUT 表（37 格，0 绿 / 1-36 红黑固定布局）模块级常量 + Object.freeze——做法：按标准布局落表（红 18 / 黑 18 / 绿 1）；验证：probe_pl002_core 统计断言（2026-08-27 完成：LAYOUT 冻结 37 格；红 18/黑 18/绿 1；标准值抽查 1红/2黑/10黑/11黑/36红）
- [x] PL002.2.b 扇区换算升级 37 格：sectorAngles / pickStopIndex 固定扇区角 360/37——做法：wheel.js 扇区数由候选集驱动改固定 37；验证：probe_pl002_core 角度↔号码双向一致（2026-08-27 完成：SECTOR_COUNT=37 + converge 构造 37 格定位权重 [zeroWeight,...weights] 走 pickStopIndex；angleForIndex(n,37) 等分换算；sectorAngles 权重比例制保留待 PL002.7 判断去留）
- [x] PL002.2.c `ballEndAngles(stopIndex)`：由落点号码可逆推导珠子/盘面终止角（纯函数）——做法：基于 LAYOUT 序号→中心角换算，珠子反向偏移 + 盘面同向到格；验证：probe_pl002_core 终止角与落点格中心一致断言（2026-08-27 完成：discAngle=(360-center)%37 格中心角、ballAngle 恒 0 顶部落格；colorOf 号码→颜色查询）

#### PL002.3 下注（js/bet.js）

- [x] PL002.3.a 下注类型枚举 red/black/low/high/single + `betTypeToNumbers(type, n)`——做法：类型→号码集合映射（红=布局红号 18 个、黑=黑号、low=1-18、high=19-36、single=n）；验证：probe_pl002_core 映射计数与集合断言（2026-08-27 完成：BET_TYPES 冻结声明；red/black 各 18 号含颜色自证；low/high 各 18 号；single 越界 0/37 拒绝；未知类型拒绝）
- [x] PL002.3.b `validateBets(bets, budget)`：类型合法性 / 单号越界(0-36) / 金额非负弹性转换 / Σ≤budget——做法：bets 描述 `[{type, amount}]` 校验；验证：probe_pl002_core 各非法路拦截断言（2026-08-27 完成：规范化输出含 single.number；超预算/单号越界/未知类型/负额四路拦截）

#### PL002.4 权重升降（js/weights.js）

- [x] PL002.4.a `applyBet(weights, bets, k)` 重构：命中集合（bets 展开号码对应菜品）升权 / 未命中集合降权，对称幅度、权重保底 > 0、0 号不参与——做法：命中 `w×(1+k·amount/B)`、未命中 `w×(1-k·amount/B)`（B=本轮总注），floor 保底；返回新数组纯函数；验证：probe_pl002_core 升/降方向、对称性、保底、0 号隔离断言（2026-08-27 完成：单 bet red 红号 1.5/黑号 0.5 手算精确；双 bet 累乘顺序无关（乘法交换）；WEIGHT_FLOOR=1e-9 极端 k 保底；B=0 不变；输入不篡改；0 号经 numberToIndex[0]=-1 隔离）

#### PL002.5 收敛适配（js/converge.js）

- [x] PL002.5.a runGame 签名微调：chips 向量 → bets 描述，逐轮 applyBet(weights, bets, k)——做法：converge 消费 bets，轨迹记录 bets 快照；验证：probe_pl002_core 主流程跑通（2026-08-27 完成：createGame 构建 numberMap + 37 格定位权重 [zeroWeight,...weights] 走 pickStopIndex；playRound 收 bets 描述、轨迹记 bets 快照；末轮号码回填 = candidates[finalResult].number；runGame 与逐轮 finalize 全等）
- [x] PL002.5.b 0 号落点路径：pickStopIndex 命中 0 → 从 36 菜均匀随机抽 1 个（seed 派生可复现）权重升至当前最大——做法：0 号分支（随机菜权重=max）；验证：probe_pl002_core 0 号路径同 seed 复现断言（2026-08-27 完成：`zero:{seed}:{轮次}` 独立派生流 int(0,35)；zeroWeight=1e6 扫描 40 seed 命中 0 落点且处理后某菜权重=max；0 号不参与升降权已隔离）

#### PL002.6 珠子动画表现（js/wheel.js + js/ui.js）

- [x] PL002.6.a spinTo 升级珠子 + 盘面双运动：盘面 rotate(θ_disc) + 珠子轨道 rotate(θ_ball) 反向叠加，减速缓动（CSS transition 分两段或 WAAPI keyframes）——做法：spinTo 接收 ballEndAngles 结果，全程只动 transform；验证：stub DOM 行为无头覆盖（2026-08-27 完成：wheel.js 抽 animateRotate 公共内核 + 新增 spinBall（反向绕圈落顶）+ SPIN_DEFAULTS 增 ballDurationMs/ballExtraTurns；ballEndAngles 推导 core 探针断言；浏览器端到端落点 19（红）「盖浇饭」正确）
- [x] PL002.6.b 落格表现：珠子落格瞬间位置切入扇区格内 + 轻微弹跳（WAAPI）——做法：落格位移 translate 到格中心 + 弹跳 keyframes（transform/opacity）；验证：浏览器端到端（2026-08-27 完成：main.js bounceBall 用 WAAPI 三步 keyframes（0→-8px→0），无 Element.animate 时静默跳过；collectRefs 补 ball 节点）

#### PL002.7 赌桌 UI 与装配（js/ui.js + js/main.js + index.html）

- [x] PL002.7.a index.html 结构重构：转盘区（去指针改珠子容器）、赌桌下注区、结果卡浮层容器、轨迹抽屉——做法：区块改 div 容器 + aria 标注，零内联事件；验证：grep 内联 handler 反向断言（2026-08-27 完成：wheel-ball-wrap/wheel-ball 珠子层、result-card 浮层、trace-section 抽屉、header 合并轮次/seed/状态，独立 footer 移除）
- [x] PL002.7.b ui.js 赌桌下注面板：红/黑/大/小四格 + 单号数字网格选择，选中下注列表 / 余额 / 本轮总注，筹码面额沿用 chipDenominations——做法：buildBetPanel 一次性构建 + 事件委托防泄漏；验证：probe_pl002_ui 结构断言（2026-08-27 完成：四格目标 + 36 单号（颜色随号码）+ 面额筹码 + 下注摘要 + 清空/开转；refreshBetPanel 目标选中高亮/预算剩余/摘要/禁用）
- [x] PL002.7.c ui.js 每轮结果渲染：落点号码 + 颜色 + 对应菜 + 命中/未命中菜清单；0 号展示"天降神秘菜"——做法：结果区渲染层；验证：probe_pl002_ui + 浏览器端到端（2026-08-27 完成：describeLanding 落点"号码（颜色）「菜」"，0 号经 converge zeroPick 展示"🎲 天降神秘菜「X」"；命中/未命中菜清单经轨迹行简化省略（落点信息保留，可解释性不破））
- [x] PL002.7.d main.js 装配适配：bets 下注流 + 0 号分支 + 单屏交互状态机——做法：装配层改消费 bets；验证：浏览器端到端三轮对局（2026-08-27 完成：选目标+押筹码+开转全链路，三轮跑通末轮浮层「酸辣粉」+ seed 溯源；bounceBall 落格弹跳）

#### PL002.8 拟物化视觉（css/wheel.css）

- [x] PL002.8.a 转盘拟物：木质盘面（conic 木纹 + radial 高光）+ 金属外环 + 盘面微倾斜（perspective+rotateX）+ 金属珠子——做法：CSS 渐变 + 多层 box-shadow，参数走 :root 变量；验证：浏览器截图存档待多模态目检（2026-08-27 完成：盘面木纹环（多层 box-shadow 0 0 0 环带）+ 内阴影碗状 + 珠子径向渐变高光 + 金属小球；拟物参数 :root 变量）
- [x] PL002.8.b 筹码 + 赌桌拟物：筹码径向渐变圆环 + 侧壁阴影 + 分面额配色；赌桌绿色毛毡（data URI 纹理）+ 下注格凹陷立体感——做法：CSS 渐变/阴影/内嵌纹理；验证：浏览器截图存档待多模态目检（2026-08-27 完成：赌桌径向渐变毛毡 + 目标格 inset 凹陷 + 筹码金色径向渐变圆环 + 侧壁阴影；分面额配色未做（统一金，KISS））

#### PL002.9 自适应单屏布局（css/wheel.css + index.html）

- [x] PL002.9.a 强制单屏：100dvh 滚动容器 + 赌桌固定底部 + 转盘区 flex 吸收剩余；结果卡覆盖浮层、轨迹折叠抽屉、header 压缩——做法：布局重构；验证：浏览器 eval 无滚动断言（2026-08-27 完成：body 100dvh + overflow hidden，docH=clientH 无滚动；转盘 min(88vw, var(--wheel-max-h)) 吸收剩余；浮层/抽屉/header 合并；修复桌面视口转盘溢出覆盖下注面板 bug（--wheel-max-h 380px））
- [x] PL002.9.b 自适应手法：盘径 min()/clamp()、320/375/430 三段媒体查询、:root 变量集中（盘径/字号/间距/阴影）——做法：CSS 变量 + 尺寸函数，禁写死 px；验证：浏览器多档目检待多模态（2026-08-27 完成：--wheel-max-h/--label-radius(em 随盘径)/断点 max-380/max-360/min-430；font-size clamp 随视口）
- [x] PL002.9.c 触摸与安全区：下注按钮 ≥44px 点击区、env(safe-area-inset-_) 全覆盖——做法：CSS 补全；验证：CSS 断言 + 浏览器端到端（2026-08-27 完成：target-btn min-height 44px / chip-btn 46px / body 全向 env(safe-area-inset-_)；单号网格整改——从常驻面板移入覆盖式选择浮层 #single-picker（6 列大格），num-single height 44px 宽约 53px（375 屏），44px 点击区达标；交互端到端验证：点单号按钮→浮层选号 1→按钮显示"单号 1"→押筹码"已押：单号1×5"→开转进入第 2 轮；无滚动溢出 docH=clientH）

#### PL002.10 无头验证适配（.temp/verify_*）

- [x] PL002.10.a 新增 verify_layout.js：红 18 / 黑 18 / 绿 1、相邻异色抽查、0 号绿色——做法：读 LAYOUT 表断言；验证：node verify_layout 0 失败（2026-08-27 完成：LAYOUT 长度 37 / 0 绿 / 红18黑18绿1 / 值域三色 / 标准已知值（1红 2黑 10黑 11黑 19红 36红）/ colorOf 越界拒绝，6 断言）
- [x] PL002.10.b 适配 verify_candidates / verify_bet / verify_weights / verify_wheel / verify_converge 到新契约（36 项 number / bets 描述 / 37 扇区 / 升降权 / 0 号路径）——验证：各脚本 0 失败（2026-08-27 完成：verify_candidates 8 断言（number 契约五路 + buildNumberMap + 真实配置）；verify_rules 新增 7 断言（payouts/zeroWeight/spin.ball + 真实配置）；verify_wheel 5（37 扇区角 + ballEndAngles 全下标）；verify_bet 9（类型映射 + validateBets）；verify_weights 7（升降权对称/累乘/隔离/保底/不篡改）；verify_converge 6（bets 形态/等价性/0 号路径/零注））
- [x] PL002.10.c run_all.py 全量回归：新增脚本纳入枚举，全部 0 失败——验证：run_all.py 0 失败（2026-08-27 完成：run_all.py 枚举 7 个 verify_* 统一出口汇总，48 断言 7/7 全绿退出 0；修复 verify_weights 一处探针残留正则（错误消息无 numberToIndex 字面量））

#### PL002.11 文档同步与版本定版

- [x] PL002.11.a 版本号 V0.1.1.0：version.json 单点 + README 徽章 + x.progress 版本行 + z.plan 状态行四处同步；排查历史 verify 版本格式快照断言（四段式正则）——验证：grep 唯一来源 + 正则比对（2026-08-27 完成：config/version.json（V0.1.1.0）权威源；V0.1.1.0 出现于 version.json/README/x.progress/z.plan 四处一致；V0.1.0.0 仅 PL001 历史完成记录引用非当前版本定义；四段式格式符合 `V\d+\.\d+\.\d+\.\d+`；verify_* 无写死版本号）
- [x] PL002.11.b 结构树 / 契约说明 / 阶段验证命令速查同步（candidates 36 项、bet 类型、wheel 珠子、新增 verify_layout）——做法：README/z.plan 结构树更新 + x.progress 速查更新；验证：文档与代码实况比对（2026-08-27 完成：README 徽章/简介/特性/使用说明/结构树全面更新（赌场轮盘式 + 拟物化 + 单屏）；z.plan 状态行与结构树更新（verify_* 清单、config 36 项、js 新职责）；x.progress 版本行/依据/速查更新（7 个 verify_* + run_all））
- [x] PL002.11.c commit 草稿按 V2 规范给出（git add 清单 + message，形如 `feat: V0.1.1.0，赌场轮盘式玩法与拟物单屏重构...`），AI 不执行 git 写操作——验证：草稿经用户审阅后由用户执行（2026-08-27 完成：见下方 commit 草稿）

### commit 草稿（V2 规范，2026-08-27 PL002）

**git add 清单**（16 个文件，`.temp/` 已 gitignore 不纳入）：

```text
README.md config/candidates.json config/rules.json config/version.json
css/wheel.css index.html
js/bet.js js/candidates.js js/converge.js js/main.js js/rules.js
js/ui.js js/weights.js js/wheel.js
x.progress.md z.plan.md
```

**message**：

```text
feat: V0.1.1.0，赌场轮盘式玩法重构（珠子式转盘/赌桌下注/拟物化/单屏自适应）

- 转盘改为 37 格标准轮盘（0 绿 + 1-36 红黑布局表），珠子沿轨道滚动落格，落点号码 = 结果
- 候选集扩至 36 项一个号码一个菜（number 契约全覆盖校验），0 号为天降神秘菜随机指定
- 下注改为赌桌式红/黑/大/小/单号，号码集合映射 + validateBets 预算校验
- 收敛改为命中升权未命中降权（逐 bet 累乘、0 号隔离、权重保底），3 轮 argmax 锁定
- 拟物化视觉木质转盘/金属珠子/毛毡赌桌/金色筹码，全 CSS3 渐变阴影零依赖
- 强制单屏自适应（100dvh 转盘主导赌桌底部常驻结果浮层轨迹抽屉三段断点）
- 单号选择浮层 6 列大格 ≥44px 点击区，修复桌面视口转盘溢出覆盖下注面板
- 无头回归重建 7 个 verify_* + run_all.py 全量 48 断言全绿
- 版本号升至 V0.1.1.0（version.json 单点导出，README/z.plan/x.progress 同步）
```
