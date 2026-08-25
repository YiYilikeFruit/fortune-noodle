# 开发进度追踪（x.progress.md）

> 依据：`z.plan.md`（幸运饭桶大转盘方案报告，PL001 完整 MVP）
> 当前版本：待定版（PL001.10 建立版本号单一来源后三处同步；AGENTS.md「版本号唯一来源」约定）
> 记录格式：状态 [⏳ 待开发, ✅ 已完成] / 优先级 [高, 中, 低]
> 执行原则：每阶段完成后运行验证命令确认无回归，再进入下一阶段
> 错误策略：不崩溃、不阻塞、有提示、能自愈——统一中文错误类型 / fail-fast 与明确回落并用 / 宽容解析（详见 AGENTS.md 错误策略主线）

---

## 阶段验证命令速查（AGENTS.md 运行与验证）

```shell
# 无头验证（node 直跑，不拉起浏览器；核心逻辑纯函数零 DOM 依赖）
node .temp/verify_random.js       # PL001.1 随机源：同 seed 同序列 / [0,1) 粗均匀 / int 落域
node .temp/verify_candidates.js   # PL001.2 候选集：键名契约 / 宽容解析
node .temp/verify_weights.js      # PL001.3 权重极化：方向正确 / 零注不变
node .temp/verify_converge.js     # PL001.4 收敛：确定性 / 轨迹 / 边界
node .temp/verify_wheel.js        # PL001.5 转盘：角度↔索引 / 累计权重定位
node .temp/verify_bet.js          # PL001.6 下注：预算校验
python3 .temp/run_all.py          # PL001.9 全量回归总入口（全部 verify_* 0 失败）
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

- [ ] PL001.1.a mulberry32 核心 + seed 归一化：数字/字符串 seed 经哈希归一为 uint32 内部态，`createRNG(seed)` 工厂返回相互独立的 RNG 实例——验证：verify_random 同 seed 两实例序列逐位相等
- [ ] PL001.1.b `next()` ∈ [0,1) 与 `int(min, max)` 均匀整数 API（含端点口径以 `#` 注释说明）；int 取法注释说明精度取舍——验证：verify_random int 落域正确（min/max 边界可达）
- [ ] PL001.1.c 派生 seed 序列：`deriveSeed(baseSeed, round)` 整局同源派生，每轮独立随机流互不污染——验证：verify_random 派生序列确定且不同轮互异
- [ ] PL001.1.d verify_random.js 落地 `.temp/`（node 直跑不拉浏览器）：同 seed 同序列 / 异 seed 异序列 / [0,1) 分布粗均匀（桶计数偏离阈值内）/ int 落域四断言组——验证：node verify_random 0 失败

#### PL001.2 候选集（js/candidates.js）

- [ ] PL001.2.a 契约层：候选集结构键名显式声明（id/name/weight?/color? 等）+ `validateCandidates` 导入期校验（缺失必填键 / 重复 id / 空集 fail-fast 抛中文错误，对齐 P23 契约定案：键名代码内显式声明不外置）——验证：verify_candidates 缺键 / 重复 / 空集各断言抛错
- [ ] PL001.2.b 宽容解析（错误策略主线）：weight 数字字段字符串弹性转换、缺省 weight 回落等权、坏结构返回明确中文错误不崩溃；核心层纯函数只接收已解析对象，fetch IO 留在装配层——验证：verify_candidates 字符串 weight 转换 + 缺省回落断言
- [ ] PL001.2.c verify_candidates.js 落地：合法集通过 / 缺失键抛错 / 重复 id 抛错 / 空集抛错 / 宽容解析五组——验证：node verify_candidates 0 失败

#### PL001.3 权重极化（js/weights.js）

- [ ] PL001.3.a `initWeights(candidates, initialOverrides)`：初始等权 w_i=1，rules.initialWeights 可按键覆盖（缺项回落 1）——验证：verify_weights 等权初始化 + 覆盖生效断言
- [ ] PL001.3.b `applyBet(weights, chips, k)`：`w_i ← w_i×(1+k·c_i/B)` 极化更新（B=Σc_i 本轮总注）；B=0 时权重原样；返回新数组不原地突变（纯函数）——验证：verify_weights 高注单调上升 / 零注不变 / 输入不被篡改断言
- [ ] PL001.3.c verify_weights.js 落地：极化方向正确性（高注选项权重占比上升）/ 零注不变 / k 系数方向 / 浮点容差比较四组——验证：node verify_weights 0 失败

#### PL001.4 多轮收敛（js/converge.js）

- [ ] PL001.4.a `runGame(candidates, betRounds, seed, rules)` 纯函数编排主流程：逐轮 applyBet 极化 → wheel.pickStopIndex 记录落点 → 循环 rules.rounds 轮（模块间顶层 import，不用函数内延迟 import）——验证：verify_converge 主流程跑通输出结构完整
- [ ] PL001.4.b 末轮锁定与并列决出：末轮 `argmax(w_i)` 为最终结果，并列由 seed 决出（确定性）——验证：verify_converge 构造并列权重断言 seed 决出稳定
- [ ] PL001.4.c 收敛轨迹与元数据：每轮 {权重快照, stopIndex, 总注 B} + 最终 {finalResult, seed, configVersion}（可解释可复现）——验证：verify_converge 轨迹完整性与 seed/configVersion 记录断言
- [ ] PL001.4.d 边界：空候选 fail-fast 中文错误 / 单候选直接锁定 / 全程零注正常走完等权随机——验证：verify_converge 三边界不崩且有确定输出
- [ ] PL001.4.e verify_converge.js 落地：确定性复现 / 定位 / 轨迹 / 边界五组——验证：node verify_converge 0 失败

#### PL001.5 转盘（js/wheel.js）

- [ ] PL001.5.a `pickStopIndex(weights, rng)`：[0, Σw) 取落点按累计权重定位（纯函数，权重大者更易停）——验证：verify_wheel 定位与累计权重区间一一对应
- [ ] PL001.5.b `angleForIndex(stopIndex, sectorCount)`：落点扇区中心角换算（纯函数，含指针偏移口径注释）——验证：verify_wheel 角度与索引双向一致
- [ ] PL001.5.c `spinTo(el, fromAngle, toAngle, opts)`：CSS3 transform rotate + transition 动画封装（圈数/时长/缓动走 rules 或 UI 参数不硬编码；transitionend + setTimeout 兜底双保险防事件丢失）——验证：纯计算部分无头覆盖；动画表现 UI 层单独
- [ ] PL001.5.d verify_wheel.js 落地：angleForIndex 正确性 / pickStopIndex 累计权重定位（DOM 无关部分全覆盖）——验证：node verify_wheel 0 失败

#### PL001.6 下注（js/bet.js）

- [ ] PL001.6.a `validateChips(chips, budget, candidateIds)`：Σc ≤ budget 校验 / 负数拒绝 / 未知选项 id 拒绝 / 数字字段字符串弹性转换——验证：verify_bet 各非法输入拦截断言
- [ ] PL001.6.b 筹码面额走配置（rules.chipDenominations 可调，禁代码硬编码）——验证：verify_bet 自定义面额生效断言
- [ ] PL001.6.c verify_bet.js 落地：超预算拦截 / 负数 / 未知 id / 合法通过 / 弹性转换五组——验证：node verify_bet 0 失败

#### PL001.7 配置（config/）

- [ ] PL001.7.a config/candidates.json：默认候选集（菜品/餐厅类别 8~12 项，键名与 PL001.2 契约一致）——验证：经 loadCandidates 通过契约校验
- [ ] PL001.7.b config/rules.json：rounds=3 / budget=100 / k=0.5 / initialWeights / chipDenominations / 动画参数（圈数、时长毫秒）全外置——验证：rules 必填键缺失时导入期报错断言
- [ ] PL001.7.c 配置加载与契约：装配层一次性加载传递（核心层运行时零 IO），坏 JSON fail-fast 中文提示不静默——验证：verify_candidates 附坏 JSON 输入断言

#### PL001.8 UI（index.html + css/ + js/ui.js + js/main.js）

- [ ] PL001.8.a index.html 入口：转盘区 / 筹码面板 / 轮次进度 / 结果区 / 收敛轨迹区五区块挂载；零内联事件（addEventListener 统一绑定）——验证：grep 断言零 onclick/onload 等内联 handler
- [ ] PL001.8.b css/wheel.css：转盘扇区 / 指针 / 筹码按钮 / 结果卡样式；颜色与阈值走 UI 参数不散落——验证：UI 截图目检
- [ ] PL001.8.c js/ui.js 渲染层：候选扇区绘制 / 筹码选择与余额显示 / 每轮结果与轨迹渲染 / 最终结果卡；只读渲染不改业务状态——验证：UI 手动清单
- [ ] PL001.8.d seed 链路：URL `#seed=` 解析 → localStorage 记忆 → 随机生成并回显记录（已拍板顺序）；解析逻辑抽纯函数——验证：三种来源注入各断言一次（无头）
- [ ] PL001.8.e js/main.js 启动装配：fetch 配置 → loadCandidates → initWeights → 轮次循环（下注 → spinTo 表现 → 轨迹记录）→ 末轮锁定展示；错误入口统一提示不崩溃（降级不中断）——验证：浏览器冒烟
- [ ] PL001.8.f UI 单独验证（截图/手动清单过一遍，核心逻辑已被无头覆盖）——验证：手动清单执行并记录结论

#### PL001.9 无头回归编排（.temp/run_all.py）

- [ ] PL001.9.a run*all.py：枚举执行全部 verify*\*（node 子进程）统一出口计数汇总，任一失败非零退出——验证：注入临时失败脚本断言非零退出
- [ ] PL001.9.b 全量回归 = 全部 verify\_\* 0 失败；校验**不变量**为主，禁止写死易变值（A018 验证纪律）——验证：run_all.py 0 失败

#### PL001.10 文档同步与版本定版

- [ ] PL001.10.a 版本号单一来源建立：项目声明的单一字段一处单点导出、全项目共引（AGENTS.md「版本号唯一来源」）——验证：grep 断言版本字面值全项目仅一处定义
- [ ] PL001.10.b README 徽章 / x.progress 版本行 / z.plan 状态行三处同步一致——验证：三处动态读取比对
- [ ] PL001.10.c 离线包完整性核查：index.html + css/ + js/ + config/ 全内嵌、零外部 CDN 外链、零禁用 API（WebGL/Workers/eval/new Function/document.write/内联事件 grep 清零）——验证：grep 反向断言
- [ ] PL001.10.d README/AGENTS.md 与实施后现状出入核对同步（配置键名、结构树、命令速查）——验证：文档描述与代码实况比对
- [ ] PL001.10.e commit 草稿按 V2 规范给出（git add 清单 + message，形如 `feat: V<版本>，大转盘核心玩法与下注收敛...`），AI 不执行 git 写操作——验证：草稿经用户审阅后由用户执行
