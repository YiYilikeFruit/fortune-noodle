// ============================================================
// 幸运饭桶大转盘 - 启动装配与对局状态机（唯一持业务状态的模块）
// 设计要点：fetch 配置 → 双契约校验 → seed 三来源解析并记忆 →
// createGame 逐轮交互（bets 下注 → 珠子/盘面双动画表现 → 轨迹记录）
// → 末轮锁定浮层展示。错误入口统一中文提示不崩溃（降级不中断主线）。
// PL002 赌场轮盘式：下注走 red/black/low/high/single，动画走
// ballEndAngles（盘面转 + 珠子反向落格），0 号展示"天降神秘菜"。
// ============================================================

import { loadCandidates } from "./candidates.js";
import { validateRules } from "./rules.js";
import { validateBets } from "./bet.js";
import { createGame } from "./converge.js";
import { ballEndAngles, colorOf, spinBall, spinTo } from "./wheel.js";
import {
  collectRefs,
  renderWheel,
  buildBetPanel,
  buildSinglePicker,
  showSinglePicker,
  refreshBetPanel,
  betsText,
  appendTraceRow,
  resetTrace,
  setTraceOpen,
  showResult,
  hideResult,
  setStatus,
  setSeedInfo,
  highlightCell,
  clearCellHighlight,
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
  currentBets: [],
  selectedTarget: { type: "red" },
  discAngle: 0,
  ballAngle: 0,
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

  buildBetPanel(state.refs, state.candidates, state.rules, {
    onTarget: (type, number) => {
      state.selectedTarget = number ? { type, number } : { type };
      refreshBet();
    },
    onPickSingle: () => showSinglePicker(state.refs, true),
    onChip: addChip,
    onClear: clearBets,
    onSpin: spinCurrentRound,
  });

  // 单号选择浮层：选号即设目标并关闭（事件只绑一次）
  buildSinglePicker(state.refs, {
    onSelect: (number) => {
      state.selectedTarget = { type: "single", number };
      refreshBet();
      showSinglePicker(state.refs, false);
    },
    onCancel: () => showSinglePicker(state.refs, false),
  });

  // 轨迹抽屉开关（一次性绑定）
  state.refs.traceToggle.addEventListener("click", () => {
    const open = state.refs.traceList.hidden;
    setTraceOpen(state.refs, open);
  });

  newGame();
}

// 落格弹跳：珠子转回顶部后轻微弹起落下，增强落格手感
// 行为：WAAPI 三步 keyframes（0 → -8px → 0）；无 Element.animate 时静默跳过
function bounceBall() {
  const el = state.refs.ball;
  if (!el || typeof el.animate !== "function") {
    return;
  }
  try {
    el.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-8px)" },
        { transform: "translateY(0)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
  } catch {
    // 动画环境异常不影响对局（降级不中断）
  }
}

// 开新一局：重建状态机、复位盘面/珠子角度与面板（再来一局复用同一入口）
function newGame() {
  // 非首局的"再来一局"生成全新随机 seed 并更新记忆（拍板第 6 条链路）
  if (state.game && state.game.isFinished) {
    state.seedInfo = resolveSeedSource(null, "", Math.random);
    persistSeed(state.seedInfo.seed);
  }
  state.game = createGame(state.candidates, state.seedInfo.seed, state.rules);
  state.discAngle = 0;
  state.ballAngle = 0;
  state.currentBets = [];
  state.selectedTarget = { type: "red" };
  state.spinning = false;

  resetTrace(state.refs);
  setTraceOpen(state.refs, false);
  hideResult(state.refs);
  renderWheel(state.refs);
  setSeedInfo(
    state.refs,
    state.seedInfo.seed,
    state.seedInfo.source,
    state.rules.configVersion,
  );
  setStatus(state.refs, "");
  startRound();
}

// 进入新一轮：清空本轮注额、刷新进度与面板可用态
function startRound() {
  state.currentBets = [];
  const idx = state.game.roundIndex;
  const total = state.rules.rounds;
  const label =
    idx === total - 1
      ? `第 ${idx + 1}/${total} 轮 · 最终轮（锁定最高权重）`
      : `第 ${idx + 1}/${total} 轮`;
  state.refs.progress.textContent = label;
  refreshBet();
  setStatus(state.refs, "先选下注目标，再点筹码");
}

// 加注：按当前选中目标追加一条 bet，预算校验失败仅在状态栏提示
function addChip(denomination) {
  if (state.spinning) {
    return;
  }
  const next = [
    ...state.currentBets,
    {
      type: state.selectedTarget.type,
      amount: denomination,
      ...(state.selectedTarget.number !== undefined
        ? { number: state.selectedTarget.number }
        : {}),
    },
  ];
  try {
    validateBets(next, state.rules.budget);
  } catch (e) {
    setStatus(state.refs, e.message);
    return;
  }
  state.currentBets = next;
  setStatus(state.refs, "");
  refreshBet();
}

// 清空本轮下注
function clearBets() {
  if (state.spinning) {
    return;
  }
  state.currentBets = [];
  setStatus(state.refs, "");
  refreshBet();
}

// 提交本轮并驱动转盘：盘面转到落点号码格、珠子反向滚动落格
async function spinCurrentRound() {
  if (state.spinning || state.game.isFinished) {
    return;
  }
  let bets;
  try {
    bets = validateBets(state.currentBets, state.rules.budget);
  } catch (e) {
    setStatus(state.refs, e.message);
    return;
  }

  state.spinning = true;
  refreshBet();
  setStatus(state.refs, "转动中…");
  clearCellHighlight(state.refs);

  const outcome = state.game.playRound(bets);

  // 末轮：先 finalize 取锁定结果作为落点号码（落点=计算结果红线）
  let stopIndex = outcome.stopIndex;
  let finalData = null;
  if (outcome.isFinal) {
    finalData = state.game.finalize();
    stopIndex = finalData.rounds[finalData.rounds.length - 1].stopIndex;
  }

  // 珠子/盘面双动画：盘面把落点号码格转到顶部珠子位，珠子反向绕圈落格
  const ends = ballEndAngles(stopIndex);
  const [newDisc, newBall] = await Promise.all([
    spinTo(state.refs.disc, state.discAngle, ends.discAngle, state.rules.spin),
    spinBall(
      state.refs.ballWrap,
      state.ballAngle,
      ends.ballAngle,
      state.rules.spin,
    ),
  ]);
  state.discAngle = newDisc;
  state.ballAngle = newBall;

  // 落格表现：珠子到位后轻微弹跳 + 落点格金色脉冲高亮（PL003 反馈强化）
  bounceBall();
  highlightCell(state.refs, stopIndex);

  // 轨迹行：非末轮报落点；末轮宣布锁定
  const betText = betsText(bets) || "未押注";
  if (!outcome.isFinal) {
    const landed = describeLanding(outcome);
    appendTraceRow(
      state.refs,
      `第 ${outcome.round} 轮 · 押 ${betText} · B=${outcome.totalBet} · ${landed}`,
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

// 落点描述：号码 + 颜色 + 对应菜（0 号展示"天降神秘菜"）
// 输入：outcome 本轮 playRound 结果；输出：可读落点文案
function describeLanding(outcome) {
  const number = outcome.stopIndex;
  if (number === 0) {
    const zeroName = nameOf(state.candidates[outcome.zeroPick]?.id);
    return `天降神秘菜「${zeroName}」（号码 0）`;
  }
  const cand = state.candidates.find((c) => c.number === number);
  const colorName = colorLabel(number);
  return `停在 ${number}（${colorName}）「${cand?.name ?? number}」`;
}

// 号码颜色中文标签（展示用，颜色走 wheel.js colorOf 权威表）
function colorLabel(number) {
  return (
    { red: "红", black: "黑", green: "绿" }[colorOf(number)] ?? colorOf(number)
  );
}

// id → 名称的小工具（轨迹与结果文案用）
function nameOf(id) {
  return state.candidates.find((c) => c.id === id)?.name ?? id;
}

// 赌桌面板状态刷新（透传当前快照给渲染层）
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
    state.currentBets,
    state.rules.budget,
    state.selectedTarget,
    state.spinning,
  );
}

bootstrap();
