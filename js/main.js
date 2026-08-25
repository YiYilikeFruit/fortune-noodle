// ============================================================
// 幸运饭桶大转盘 - 启动装配与对局状态机（唯一持业务状态的模块）
// 设计要点：fetch 配置 → 双契约校验（rules/candidates）→ seed 三来源
// 解析并记忆 → createGame 逐轮交互（下注 → spinTo 表现 → 轨迹记录）
// → 末轮锁定展示。错误入口统一中文提示不崩溃（降级不中断主线）。
// ============================================================

import { loadCandidates } from "./candidates.js";
import { validateRules } from "./rules.js";
import { chipsToVector, validateChips } from "./bet.js";
import { createGame } from "./converge.js";
import { initWeights } from "./weights.js";
import { rotationForIndex, spinTo } from "./wheel.js";
import {
  collectRefs,
  renderWheel,
  buildBetPanel,
  refreshBetPanel,
  appendTraceRow,
  resetTrace,
  showResult,
  hideResult,
  setStatus,
  setSeedInfo,
  resolveSeedSource,
  SEED_STORAGE_KEY,
} from "./ui.js";

// 对局状态（唯一可变业务状态容器，渲染层只读消费快照）
const state = {
  refs: null,
  candidates: [],
  rules: null,
  game: null,
  seedInfo: { seed: "", source: "random" },
  currentChips: {},
  selectedId: "",
  discAngle: 0,
  spinning: false,
};

// 拉取配置 JSON：非 2xx 抛中文错误（装配层 IO 唯一入口，核心层零 IO）
async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`配置加载失败：${path}（HTTP ${res.status}）`);
  }
  return res.json();
}

// 持久化 seed 到 localStorage：隐私模式等写入失败仅提示，不影响对局
function persistSeed(seed) {
  try {
    localStorage.setItem(SEED_STORAGE_KEY, seed);
  } catch {
    setStatus(state.refs, "本地存储不可用，seed 记忆将不会跨次生效");
  }
}

// 致命错误展示：结果卡位置显示错误信息（配置坏/骨架缺时游戏无法成立）
function fatal(message) {
  showResult(state.refs, "启动失败", message, () => location.reload());
  setStatus(state.refs, "请修复问题后点击重试");
}

// 启动装配：seed 链路 + 配置契约 + DOM 骨架 + 首局创建
async function bootstrap() {
  state.refs = collectRefs();

  // seed 三来源链（url → 记忆 → 随机），解析失败属编程错误直接致命提示
  try {
    state.seedInfo = resolveSeedSource(
      typeof location !== "undefined" ? location.hash : null,
      typeof localStorage !== "undefined"
        ? localStorage.getItem(SEED_STORAGE_KEY)
        : null,
    );
    persistSeed(state.seedInfo.seed);
  } catch (e) {
    fatal(`seed 初始化失败：${e.message}`);
    return;
  }

  // 配置加载与双契约校验：任一失败 fail-fast 展示，不进入残缺对局
  let candidatesRaw;
  let rulesRaw;
  try {
    [candidatesRaw, rulesRaw] = await Promise.all([
      loadJson("config/candidates.json"),
      loadJson("config/rules.json"),
    ]);
    state.candidates = loadCandidates(candidatesRaw);
    state.rules = validateRules(rulesRaw);
  } catch (e) {
    fatal(`配置校验未通过：${e.message}`);
    return;
  }

  state.selectedId = state.candidates[0].id;

  buildBetPanel(state.refs, state.candidates, state.rules.chipDenominations, {
    onSelect: (id) => {
      state.selectedId = id;
      refreshBet();
    },
    onChip: addChip,
    onClear: clearChips,
    onSpin: spinCurrentRound,
  });

  newGame();
}

// 开新一局：重建状态机、复位盘面角度与面板（再来一局复用同一入口）
function newGame() {
  // 非首局的"再来一局"生成全新随机 seed 并更新记忆（拍板第 6 条链路）
  if (state.game && state.game.isFinished) {
    state.seedInfo = resolveSeedSource(null, "", Math.random);
    persistSeed(state.seedInfo.seed);
  }
  state.game = createGame(state.candidates, state.seedInfo.seed, state.rules);
  state.discAngle = 0;
  state.currentChips = {};
  state.spinning = false;

  resetTrace(state.refs);
  hideResult(state.refs);
  renderWheel(state.refs, state.candidates, initWeightsSnapshot());
  setSeedInfo(
    state.refs,
    state.seedInfo.seed,
    state.seedInfo.source,
    state.rules.configVersion,
  );
  setStatus(state.refs, "");
  startRound();
}

// 初始等权快照：复用核心层 initWeights（等权 + rules.initialWeights 覆盖）
function initWeightsSnapshot() {
  return initWeights(state.candidates, state.rules.initialWeights);
}

// 进入新一轮：清空本轮注额、刷新进度与面板可用态
function startRound() {
  state.currentChips = {};
  const idx = state.game.roundIndex;
  const total = state.rules.rounds;
  const label =
    idx === total - 1
      ? `第 ${idx + 1}/${total} 轮 · 最终轮（锁定最高权重）`
      : `第 ${idx + 1}/${total} 轮`;
  state.refs.progress.textContent = label;
  refreshBet();
  setStatus(state.refs, "点候选行选中目标，再点筹码压注");
}

// 加注：预算校验失败仅在状态栏提示，不改当前注额（错误策略：有提示不崩溃）
function addChip(denomination) {
  if (state.spinning) {
    return;
  }
  const next = { ...state.currentChips };
  next[state.selectedId] = (next[state.selectedId] ?? 0) + denomination;
  try {
    validateChips(
      next,
      state.rules.budget,
      state.candidates.map((c) => c.id),
    );
  } catch (e) {
    setStatus(state.refs, e.message);
    return;
  }
  state.currentChips = next;
  setStatus(state.refs, "");
  refreshBet();
}

// 清空本轮注额
function clearChips() {
  if (state.spinning) {
    return;
  }
  state.currentChips = {};
  setStatus(state.refs, "");
  refreshBet();
}

// 提交本轮并驱动转盘：先重绘扇区地形（极化后权重），再转到既定落点
async function spinCurrentRound() {
  if (state.spinning || state.game.isFinished) {
    return;
  }
  const ids = state.candidates.map((c) => c.id);
  try {
    validateChips(state.currentChips, state.rules.budget, ids);
  } catch (e) {
    setStatus(state.refs, e.message);
    return;
  }

  state.spinning = true;
  refreshBet();
  setStatus(state.refs, "转动中…");

  const vector = chipsToVector(state.currentChips, state.candidates);
  const outcome = state.game.playRound(vector);

  // 末轮：先 finalize 取锁定结果作为落点（落点=计算结果红线）
  let stopIndex = outcome.stopIndex;
  let finalData = null;
  if (outcome.isFinal) {
    finalData = state.game.finalize();
    stopIndex = finalData.finalResult;
  }

  // 落点换算基于极化后的扇区地形：先按新权重重绘（押注改变概率地形可视化）
  renderWheel(state.refs, state.candidates, outcome.weightsAfter);
  const target = rotationForIndex(outcome.weightsAfter, stopIndex);
  state.discAngle = await spinTo(
    state.refs.disc,
    state.discAngle,
    target,
    state.rules.spin,
  );

  // 轨迹行：非末轮报落点；末轮宣布锁定
  const landedName = state.candidates[stopIndex].name;
  const betText =
    Object.entries(state.currentChips)
      .filter(([, v]) => v > 0)
      .map(([id, v]) => `${nameOf(id)}×${v}`)
      .join("、") || "未押注";
  if (!outcome.isFinal) {
    appendTraceRow(
      state.refs,
      `第 ${outcome.round} 轮 · 押 ${betText} · B=${outcome.totalBet} · 停在「${landedName}」`,
      false,
    );
    setStatus(state.refs, "");
    state.spinning = false;
    startRound();
    return;
  }

  appendTraceRow(
    state.refs,
    `最终锁定「${nameOf(finalData.finalId)}」· seed=${finalData.meta.seed}`,
    true,
  );
  showResult(
    state.refs,
    `今天就吃「${nameOf(finalData.finalId)}」！`,
    `整局 seed=${finalData.meta.seed}${finalData.meta.configVersion ? ` · 规则 ${finalData.meta.configVersion}` : ""}（同 seed 同下注可完整复现）`,
    () => newGame(),
  );
  setStatus(state.refs, "");
  state.spinning = false;
  refreshBet();
}

// id → 名称的小工具（轨迹与结果文案用）
function nameOf(id) {
  return state.candidates.find((c) => c.id === id)?.name ?? id;
}

// 筹码面板状态刷新（透传当前快照给渲染层）
function refreshBet() {
  const idx = state.game.roundIndex;
  const total = state.rules.rounds;
  const label =
    idx >= total
      ? "整局结束"
      : idx === total - 1
        ? `第 ${idx + 1}/${total} 轮 · 最终轮`
        : `第 ${idx + 1}/${total} 轮`;
  refreshBetPanel(
    state.refs,
    label,
    state.candidates,
    state.currentChips,
    state.rules.budget,
    state.selectedId,
    state.spinning,
  );
}

bootstrap();
