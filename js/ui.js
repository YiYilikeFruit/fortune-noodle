// ============================================================
// 幸运饭桶大转盘 - 渲染层（DOM 构建与刷新，只读不改业务状态）
// 设计要点：本模块只做两件事——①纯函数（seed 来源解析等可无头单测）；
// ②接收 main.js 注入的状态快照绘制 DOM。所有业务决策留在装配层，
// 渲染函数不持有对局数据、不发起计算。
// ============================================================

import { sectorAngles } from "./wheel.js";

// 候选缺省色板单一声明处：candidates[].color 缺失时按序循环取色
export const FALLBACK_PALETTE = Object.freeze([
  "#e74c3c",
  "#e67e22",
  "#f1c40f",
  "#2ecc71",
  "#1abc9c",
  "#3498db",
  "#9b59b6",
  "#fd79a8",
  "#6c5ce7",
  "#00b894",
]);

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
    pointer: byId("wheel-pointer"),
    wheelWrap: byId("wheel-wrap"),
    progress: byId("round-progress"),
    betPanel: byId("bet-panel"),
    resultCard: byId("result-card"),
    traceList: byId("trace-list"),
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

// 绘制转盘：按当前权重比例生成 conic-gradient 扇区 + 径向标签
// 输入：refs.disc 转盘元素；candidates 候选数组；weights 当前权重数组
// 行为：扇区角宽 ∝ 权重（押注变强肉眼可见）；标签放各扇区中心线并反向
//   旋转保持水平可读；颜色取 candidates[].color 优先、FALLBACK_PALETTE 兜底
// 异常：权重非法由 sectorAngles 守卫抛中文错误
export function renderWheel(refs, candidates, weights) {
  const angles = sectorAngles(weights);
  const stops = [];
  const labels = [];
  candidates.forEach((c, i) => {
    const color = c.color || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
    const a = angles[i];
    stops.push(`${color} ${a.start}deg ${a.end}deg`);
    labels.push({ name: c.name, center: a.center });
  });
  refs.disc.style.background = `conic-gradient(from 0deg, ${stops.join(", ")})`;

  // 标签层一次性重建（数量与候选集一致，局内不变）
  const old = refs.disc.querySelectorAll(".sector-label");
  old.forEach((el) => el.remove());
  for (const item of labels) {
    const span = document.createElement("span");
    span.className = "sector-label";
    span.style.transform = `rotate(${item.center}deg) translateY(calc(-1 * var(--label-radius))) rotate(${-item.center}deg)`;
    span.textContent = item.name;
    refs.disc.appendChild(span);
  }
}

// 内部桥接说明：扇区角换算复用 wheel.js 的 sectorAngles（顶部 import），
// 绘制与落点换算共用同一口径，杜绝两处实现漂移

// 构建筹码面板骨架：候选选择行 + 面额按钮组 + 操作行（事件只绑一次）
// 输入：refs.betPanel；candidates；denominations 已升序面额表；handlers 回调集合
//   handlers = { onSelect(id), onChip(denomination), onClear(), onSpin() }
// 行为：候选行/面额按钮/操作按钮一次性创建，点击委托 handlers；后续状态
//   （选中态/注额/余额/禁用）一律经 refreshBetPanel 刷新，不重建不重复绑事件
export function buildBetPanel(refs, candidates, denominations, handlers) {
  refs.betPanel.innerHTML = "";

  const title = document.createElement("div");
  title.className = "panel-title";
  refs.betPanel.appendChild(title);

  const rows = document.createElement("div");
  rows.className = "cand-rows";
  for (const c of candidates) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cand-row";
    row.dataset.id = c.id;
    row.style.setProperty("--row-color", c.color || FALLBACK_PALETTE[0]);
    row.addEventListener("click", () => handlers.onSelect(c.id));
    rows.appendChild(row);
  }
  refs.betPanel.appendChild(rows);

  const chipArea = document.createElement("div");
  chipArea.className = "chip-area";
  for (const den of denominations) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.dataset.denom = String(den);
    btn.addEventListener("click", () => handlers.onChip(den));
    chipArea.appendChild(btn);
  }
  refs.betPanel.appendChild(chipArea);

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
  refs.betPanel.appendChild(ops);
}

// 刷新筹码面板状态：标题/候选行选中与注额/面额可用性/操作按钮文案
// 输入：refs；roundLabel 轮次文案；candidates；currentChips 本轮注额映射；
//   budgetTotal 总预算；selectedId 当前选中；spinning 是否转动中
export function refreshBetPanel(
  refs,
  roundLabel,
  candidates,
  currentChips,
  budgetTotal,
  selectedId,
  spinning,
) {
  const placed = Object.values(currentChips).reduce((s, v) => s + v, 0);
  const left = budgetTotal - placed;

  refs.betPanel.querySelector(".panel-title").textContent =
    `${roundLabel} · 本轮预算剩余 ${left}`;

  for (const row of refs.betPanel.querySelectorAll(".cand-row")) {
    const id = row.dataset.id;
    const amount = currentChips[id] ?? 0;
    row.classList.toggle("selected", id === selectedId);
    row.innerHTML = `<span class="cand-name">${escapeHtml(
      candidates.find((c) => c.id === id)?.name ?? id,
    )}</span><span class="cand-bet">${amount > 0 ? `×${amount}` : ""}</span>`;
  }

  for (const btn of refs.betPanel.querySelectorAll(".chip-btn")) {
    const den = Number(btn.dataset.denom);
    btn.textContent = `＋${den}`;
    btn.disabled = spinning || den > left;
  }
  refs.betPanel.querySelector("#btn-clear").disabled = spinning || placed === 0;
  refs.betPanel.querySelector("#btn-clear").textContent = "清空本轮";
  const spinBtn = refs.betPanel.querySelector("#btn-spin");
  spinBtn.disabled = spinning;
  spinBtn.textContent = spinning ? "转动中…" : "🎯 压注旋转";
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

// 展示结果卡：最终结果 + seed 溯源信息 + 再来一局入口
// 输入：refs.resultCard；finalName 结果名；metaText 溯源文案；onReplay 回调
export function showResult(refs, heading, detail, onReplay) {
  const card = refs.resultCard;
  card.innerHTML = "";
  const h = document.createElement("h2");
  h.textContent = heading;
  const p = document.createElement("p");
  p.className = "result-detail";
  p.textContent = detail;
  const again = document.createElement("button");
  again.type = "button";
  again.id = "btn-replay";
  again.addEventListener("click", () => onReplay());
  card.append(h, p, again);
  card.hidden = false;
}

// 隐藏结果卡（新一轮开始）
export function hideResult(refs) {
  refs.resultCard.hidden = true;
  refs.resultCard.innerHTML = "";
}

// 状态栏提示（错误策略主线：有提示不弹窗）
export function setStatus(refs, message) {
  refs.status.textContent = message;
}

// 更新脚注 seed 溯源信息
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
// - FALLBACK_PALETTE/SEED_STORAGE_KEY：常量单一声明处（色板兜底/记忆键）
// - resolveSeedSource(urlHash, stored, randomFn)：三来源优先级纯函数，
//   decodeURIComponent 宽容解析，randomFn 可注入保证无头确定性单测
// - collectRefs()：骨架节点收集与缺失守卫（index.html 与脚本版本失配早暴露）
// - renderWheel(refs, candidates, weights)：conic-gradient 按权重比例着色 +
//   标签径向排布（center 旋转让文字保持水平）；扇区随极化可视化缩放
// - buildBetPanel(...handlers)：一次性构建 + 事件委托绑定；后续状态刷新
//   全部走 refreshBetPanel，杜绝重建导致的监听器泄漏
// - refreshBetPanel(...)：标题余额/候选选中态与注额徽标/面额超余额禁用/
//   旋转中全局禁用——纯 DOM 快照刷新，不含任何业务判断
// - appendTraceRow/resetTrace/showResult/hideResult/setStatus/setSeedInfo：
//   轨迹增量追加/清空/结果卡展示隐藏/状态栏/脚注溯源，单向渲染入口
// - escapeHtml(text)：候选名等配置文本入 DOM 前的最小转义
// 设计理由：渲染层零业务状态——main.js 传入什么画什么，同一份 UI 代码
//   可被未来任何驱动方复用；DOM 依赖集中本文件与 main.js，核心层保持无头可测
// 异常处理：collectRefs 缺节点中文报错；其余函数信任 refs 来源（main 收集）；
//   渲染路径不抛业务异常，坏数据在核心层已被拦截
// 关联配置：颜色兜底 FALLBACK_PALETTE（候选 color 优先）；CSS 变量集中在
//   css/wheel.css :root（--label-radius 等），本文件不散落样式魔法数
