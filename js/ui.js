// ============================================================
// 幸运饭桶大转盘 - 渲染层（DOM 构建与刷新，只读不改业务状态）
// 设计要点：PL002 赌场轮盘式 UI——renderWheel 画固定 37 格盘面
// （号码 + 菜名双环，颜色走 wheel.js LAYOUT），buildBetPanel 建赌桌
// （红/黑/大/小 + 单号网格），结果卡为覆盖式浮层、轨迹为折叠抽屉；
// 所有业务决策留在装配层（main.js），本模块只画快照。
// ============================================================

import { LAYOUT, SECTOR_COUNT, colorOf } from "./wheel.js";

// localStorage 记忆键（seed 链路第二优先级的存储位）
export const SEED_STORAGE_KEY = "fortune-noodle:seed";

// 解析整局 seed 的来源链：URL #seed= → localStorage 记忆 → 随机生成
// 输入：urlHash location.hash 原文（可为 null）；stored 记忆值（可为 null）；
//   randomFn 随机源注入（测试确定性；缺省 Math.random）
// 输出：{ seed: string, source: "url" | "stored" | "random" }
// 口径：#seed= 后空值视为未提供；非 seed 开头的 hash 不误读；
//   decodeURIComponent 失败时用原文（宽容解析）；纯函数不触碰任何存储
export function resolveSeedSource(urlHash, stored, randomFn = Math.random) {
  if (typeof urlHash === "string" && urlHash.startsWith("#seed=")) {
    const raw = urlHash.slice("#seed=".length);
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // 编码异常回落原文（宽容解析主线）
    }
    if (decoded.trim() !== "") {
      return { seed: decoded.trim(), source: "url" };
    }
  }
  if (typeof stored === "string" && stored.trim() !== "") {
    return { seed: stored.trim(), source: "stored" };
  }
  return { seed: String(randomFn()), source: "random" };
}

// 收集页面骨架的关键元素引用（main.js 启动时调用一次）
// 输入：无（约定 id 见 index.html 骨架）；输出：refs 对象供全部渲染函数使用
// 异常：任一关键节点缺失抛中文错误（骨架与脚本版本失配早暴露）
export function collectRefs() {
  const byId = (id) => document.getElementById(id);
  const refs = {
    disc: byId("wheel-disc"),
    ballWrap: byId("wheel-ball-wrap"),
    ball: byId("wheel-ball"),
    wheelWrap: byId("wheel-wrap"),
    progress: byId("round-progress"),
    betPanel: byId("bet-panel"),
    resultCard: byId("result-card"),
    singlePicker: byId("single-picker"),
    singleGrid: byId("single-grid"),
    singleCancel: byId("single-cancel"),
    traceList: byId("trace-list"),
    traceToggle: byId("trace-toggle"),
    status: byId("status-bar"),
    seedInfo: byId("seed-info"),
  };
  for (const [name, el] of Object.entries(refs)) {
    if (!el) {
      throw new Error(`页面骨架缺少节点 #${name}，请核对 index.html`);
    }
  }
  return refs;
}

// 绘制固定 37 格轮盘盘面（PL002：等分、颜色走 LAYOUT，不随权重变化）
// 输入：refs.disc 盘面元素；candidates 规范化候选数组（number 1-36）
// 行为：conic-gradient 37 等分红黑绿；每格一个标签（号码 + 菜名双环），
//   0 号菜名为"神秘菜"；conic 起点 -90deg 使格 0 中心对齐顶部珠子位
//   与 ballEndAngles（discAngle 目标 0 度 = 顶部）口径一致
export function renderWheel(refs, candidates) {
  const angle = 360 / SECTOR_COUNT;
  const nameByNumber = new Map(candidates.map((c) => [c.number, c.name]));
  const stops = [];
  const labels = [];
  for (let n = 0; n < SECTOR_COUNT; n++) {
    const color = LAYOUT[n];
    const start = n * angle;
    stops.push(`${color} ${start}deg ${start + angle}deg`);
    const center = start + angle / 2;
    labels.push({
      number: n,
      name: n === 0 ? "神秘菜" : (nameByNumber.get(n) ?? `菜${n}`),
      center,
      color,
    });
  }
  refs.disc.style.background = `conic-gradient(from -90deg, ${stops.join(", ")})`;

  const old = refs.disc.querySelectorAll(".cell");
  old.forEach((el) => el.remove());
  for (const item of labels) {
    const span = document.createElement("span");
    span.className = "cell";
    span.style.transform = `rotate(${item.center}deg) translateY(calc(-1 * var(--label-radius))) rotate(${-item.center}deg)`;
    const num = document.createElement("span");
    num.className = "cell-num";
    num.textContent = item.number;
    const nm = document.createElement("span");
    nm.className = "cell-name";
    nm.textContent = item.name;
    span.append(num, nm);
    refs.disc.appendChild(span);
  }
}

// 构建赌桌下注面板：下注目标区 + 面额筹码 + 下注摘要 + 操作（事件只绑一次）
// 输入：refs.betPanel；candidates；rules 已校验规则（chipDenominations/payouts）；
//   handlers = { onTarget(type, number), onChip(denomination), onClear(), onSpin() }
// 行为：目标按钮（红/黑/大/小 + 1-36 单号网格）与面额按钮一次性创建，
//   点击委托 handlers；后续状态（选中/余额/禁用）经 refreshBetPanel 刷新
export function buildBetPanel(refs, candidates, rules, handlers) {
  const panel = refs.betPanel;
  panel.innerHTML = "";

  // 标题行：轮次 + 预算剩余（refreshBetPanel 更新文案）
  const title = document.createElement("div");
  title.className = "panel-title";
  panel.appendChild(title);

  // 下注目标区：红/黑/大/小四格
  const grid4 = document.createElement("div");
  grid4.className = "target-4";
  const groupDefs = [
    { type: "red", label: "红", cls: "t-red" },
    { type: "black", label: "黑", cls: "t-black" },
    { type: "low", label: "小 1-18", cls: "t-even" },
    { type: "high", label: "大 19-36", cls: "t-odd" },
  ];
  for (const g of groupDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `target-btn ${g.cls}`;
    btn.dataset.type = g.type;
    btn.addEventListener("click", () => handlers.onTarget(g.type, null));
    btn.textContent = g.label;
    grid4.appendChild(btn);
  }
  panel.appendChild(grid4);

  // 单号目标按钮：点击弹出号码选择浮层（36 号大格，≥44px 点击区）
  const singleBtn = document.createElement("button");
  singleBtn.type = "button";
  singleBtn.className = "target-btn target-single";
  singleBtn.dataset.type = "single";
  singleBtn.addEventListener("click", () => handlers.onPickSingle());
  singleBtn.textContent = "单号";
  panel.appendChild(singleBtn);

  // 下注摘要列表（refreshBetPanel 更新）
  const betsList = document.createElement("div");
  betsList.className = "bets-list";
  panel.appendChild(betsList);

  // 筹码面额按钮组
  const chipArea = document.createElement("div");
  chipArea.className = "chip-area";
  for (const den of rules.chipDenominations) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.dataset.denom = String(den);
    btn.addEventListener("click", () => handlers.onChip(den));
    chipArea.appendChild(btn);
  }
  panel.appendChild(chipArea);

  // 操作行：清空 + 旋转
  const ops = document.createElement("div");
  ops.className = "ops-area";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.id = "btn-clear";
  clearBtn.addEventListener("click", () => handlers.onClear());
  const spinBtn = document.createElement("button");
  spinBtn.type = "button";
  spinBtn.id = "btn-spin";
  spinBtn.addEventListener("click", () => handlers.onSpin());
  ops.append(clearBtn, spinBtn);
  panel.appendChild(ops);
}

// 下注描述摘要文案（红×10、单号7×5…）
// 输入：bets 规范化下注数组；输出：可读字符串
export function betsText(bets) {
  return bets
    .map((b) => {
      const label =
        b.type === "single" ? `单号${b.number}` : betTypeLabel(b.type);
      return `${label}×${b.amount}`;
    })
    .join("、");
}

// 下注类型中文标签
function betTypeLabel(type) {
  return (
    { red: "红", black: "黑", low: "小", high: "大", single: "单号" }[type] ??
    type
  );
}

// 刷新赌桌面板状态：标题/目标选中态/下注摘要/面额禁用/操作禁用
// 输入：refs；roundLabel 轮次文案；bets 本轮下注；budgetTotal 总预算；
//   selectedTarget {type, number?} 当前选中目标；spinning 是否转动中
export function refreshBetPanel(
  refs,
  roundLabel,
  bets,
  budgetTotal,
  selectedTarget,
  spinning,
) {
  const placed = bets.reduce((s, b) => s + b.amount, 0);
  const left = budgetTotal - placed;
  refs.betPanel.querySelector(".panel-title").textContent =
    `${roundLabel} · 预算剩余 ${left}`;

  // 目标选中态：当前选中目标高亮（单号按钮在单号目标选中时高亮）
  for (const btn of refs.betPanel.querySelectorAll(".target-btn")) {
    const isSingleBtn = btn.dataset.type === "single";
    const selected = isSingleBtn
      ? selectedTarget.type === "single"
      : btn.dataset.type === selectedTarget.type;
    btn.classList.toggle("selected", selected);
  }
  const singleBtn = refs.betPanel.querySelector(".target-single");
  singleBtn.textContent =
    selectedTarget.type === "single" ? `单号 ${selectedTarget.number}` : "单号";

  // 下注摘要
  const list = refs.betPanel.querySelector(".bets-list");
  list.innerHTML = "";
  if (bets.length === 0) {
    list.textContent = "尚未下注：先选目标，再点筹码";
  } else {
    list.textContent = `已押：${betsText(bets)}`;
  }

  // 面额按钮：超余额 / 转动中禁用
  for (const btn of refs.betPanel.querySelectorAll(".chip-btn")) {
    const den = Number(btn.dataset.denom);
    btn.textContent = `＋${den}`;
    btn.disabled = spinning || den > left;
  }
  const clearBtn = refs.betPanel.querySelector("#btn-clear");
  clearBtn.disabled = spinning || placed === 0;
  clearBtn.textContent = "清空下注";
  const spinBtn = refs.betPanel.querySelector("#btn-spin");
  spinBtn.disabled = spinning;
  spinBtn.textContent = spinning ? "转动中…" : "🎯 开转";
}

// 构建单号选择浮层：36 个号码大格（≥44px 点击区）+ 取消（事件只绑一次）
// 输入：refs.singleGrid/singleCancel；handlers = { onSelect(number), onCancel() }
export function buildSinglePicker(refs, handlers) {
  const grid = refs.singleGrid;
  grid.innerHTML = "";
  for (let n = 1; n <= 36; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `num-btn num-single num-${colorOf(n)}`;
    btn.dataset.number = String(n);
    btn.addEventListener("click", () => handlers.onSelect(n));
    btn.textContent = String(n);
    grid.appendChild(btn);
  }
  refs.singleCancel.addEventListener("click", () => handlers.onCancel());
}

// 显示/隐藏单号选择浮层
// 输入：refs；visible 是否显示；行为：同步 hidden
export function showSinglePicker(refs, visible) {
  refs.singlePicker.hidden = !visible;
}

// 追加一条收敛轨迹行（增量渲染，局内顺序追加）
// 输入：refs.traceList；text 行文案；isFinal 是否末轮（高亮样式）
export function appendTraceRow(refs, text, isFinal) {
  const li = document.createElement("li");
  li.className = isFinal ? "trace-row final" : "trace-row";
  li.textContent = text;
  refs.traceList.appendChild(li);
}

// 清空轨迹区（新一局重置）
export function resetTrace(refs) {
  refs.traceList.innerHTML = "";
}

// 切换轨迹抽屉开合
// 输入：refs；expanded 是否展开；行为：同步 aria-expanded 与列表显隐
export function setTraceOpen(refs, expanded) {
  refs.traceList.hidden = !expanded;
  refs.traceToggle.setAttribute("aria-expanded", String(expanded));
  refs.traceToggle.textContent = expanded ? "收起轨迹" : "收敛轨迹";
}

// 展示结果卡浮层：最终结果 + seed 溯源 + 再来一局（覆盖式遮罩，CSS 定位）
// 输入：refs.resultCard；heading 标题；detail 溯源文案；onReplay 回调
export function showResult(refs, heading, detail, onReplay) {
  const card = refs.resultCard;
  card.innerHTML = "";
  const box = document.createElement("div");
  box.className = "result-box";
  const h = document.createElement("h2");
  h.textContent = heading;
  const p = document.createElement("p");
  p.className = "result-detail";
  p.textContent = detail;
  const again = document.createElement("button");
  again.type = "button";
  again.id = "btn-replay";
  again.addEventListener("click", () => onReplay());
  box.append(h, p, again);
  card.appendChild(box);
  card.hidden = false;
}

// 隐藏结果卡浮层（新一轮开始）
export function hideResult(refs) {
  refs.resultCard.hidden = true;
  refs.resultCard.innerHTML = "";
}

// 状态栏提示（错误策略主线：有提示不弹窗）
export function setStatus(refs, message) {
  refs.status.textContent = message;
}

// 更新 seed 溯源信息（header 内小字）
export function setSeedInfo(refs, seed, source, configVersion) {
  const sourceName =
    source === "url" ? "URL" : source === "stored" ? "本地记忆" : "随机生成";
  refs.seedInfo.textContent = `seed: ${seed}（${sourceName}）${configVersion ? ` · 规则 ${configVersion}` : ""}`;
}

// 最小 HTML 转义：候选名来自配置文件，仍统一转义防意外标记破坏面板结构
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

// ===== js/ui.js 模块说明 =====
// 函数清单与逻辑：
// - SEED_STORAGE_KEY/resolveSeedSource：seed 链路常量与三来源纯函数（沿用 PL001）
// - collectRefs()：骨架节点收集与缺失守卫（新增 ballWrap/traceToggle 等 PL002 节点）
// - renderWheel(refs, candidates)：固定 37 格盘面——conic-gradient 等分红黑绿
//   （LAYOUT），每格标签"号码 + 菜名"双环径向排布；conic 起点 -90deg 使格 0
//   中心对齐顶部珠子位，与 ballEndAngles 口径一致；不随权重变化（固定轮盘）
// - buildBetPanel(...handlers)：赌桌一次性构建——红/黑/大/小四格 + 1-36 单号
//   网格（颜色随号码）+ 面额筹码 + 下注摘要 + 清空/开转；事件委托一次性绑定
// - betsText/betTypeLabel：下注摘要文案（红×10、单号7×5）
// - refreshBetPanel(...)：标题余额/目标选中态高亮/下注摘要/面额超余额与转动中
//   禁用/操作禁用——纯 DOM 快照刷新，不含业务判断
// - appendTraceRow/resetTrace/setTraceOpen：轨迹追加/清空/抽屉开合
// - showResult/hideResult：结果卡浮层展示隐藏（覆盖式遮罩）
// - setStatus/setSeedInfo：状态栏与 header seed 溯源
// 设计理由：渲染层零业务状态——main.js 传入什么画什么；DOM 依赖集中本文件
//   与 main.js，核心层保持无头可测；37 格盘面固定使"转盘落点 = 计算结果"
//   的表现与 ballEndAngles 换算严格同口径
// 异常处理：collectRefs 缺节点中文报错；其余函数信任 refs 来源；渲染路径
//   不抛业务异常，坏数据在核心层已被拦截
// 关联配置：LAYOUT/SECTOR_COUNT/colorOf 来自 wheel.js（红黑布局权威声明）；
//   rules.chipDenominations 驱动筹码按钮；CSS 变量集中在 css/wheel.css :root
