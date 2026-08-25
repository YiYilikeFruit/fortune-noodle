// ============================================================
// 幸运饭桶大转盘 - 多轮收敛编排（纯逻辑，无 DOM，无头可测）
// 设计要点：createGame 两段式 API 支撑 UI 逐轮交互——每轮"压注极化 →
// 转盘落点表演"，末轮不进随机、finalize 以 argmax 锁定并回填落点；
// 权重并列由独立派生的 seed 流确定性决出。runGame 为整局预演包装，
// 与逐轮实况在相同输入下完全等价（verify_converge/probe 双向断言）。
// 关联配置：rules = { rounds, k, initialWeights?, configVersion? }，
//   经 js/rules.js 校验后由装配层传入（PL001.7.b）。
// ============================================================

import { initWeights, applyBet } from "./weights.js";
import { pickStopIndex } from "./wheel.js";
import { createRNG } from "./random.js";

// 权重并列判定容差：applyBet 浮点累乘后理论相等值可能差 ~1e-16，
// 容差并列更符合"并列"语义（严格相等会漏判不同路径收敛到同值的情况）
const TIE_EPSILON = 1e-12;

// 创建一局可逐步推进的对局状态机（UI 交互形态）
// 输入：candidates 规范化候选数组；seed 整局基础 seed；rules 已校验规则
// 输出：{ playRound(chips), finalize(), roundIndex, isFinished }
//   playRound(同序下注向量) → { round, totalBet, stopIndex, weightsAfter, isFinal }
//     非末轮即时给出转盘落点；末轮 stopIndex 暂为 null，finalize 后回填锁定结果
//   finalize() → { finalResult, finalId, rounds, meta }（幂等，可重复取）
// 异常：空候选 / rounds 非正整数 / 整局结束后再 playRound /
//   未完成全部轮次即 finalize → 中文 fail-fast；向量合法性由 applyBet 把关
export function createGame(candidates, seed, rules) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("createGame 需要非空候选集");
  }
  if (!rules || !Number.isInteger(rules.rounds) || rules.rounds < 1) {
    throw new Error("createGame 的 rules.rounds 必须是正整数");
  }

  const rng = createRNG(seed);
  let weights = initWeights(candidates, rules.initialWeights);
  const isSingle = candidates.length === 1;
  const trace = [];
  let finalOutcome = null;

  function playRound(chips) {
    if (finalOutcome !== null) {
      throw new Error("整局已结束，不能再下注");
    }
    if (trace.length >= rules.rounds) {
      throw new Error(`对局共 ${rules.rounds} 轮，无法继续追加`);
    }
    weights = applyBet(weights, chips, rules.k);

    // 末轮不进随机落点：结果由 argmax 锁定而非随机数（z.plan 第三章收敛定义），
    // 循环后以 finalResult 回填末轮 stopIndex——保证全程"落点=计算结果"
    let stopIndex = null;
    const isFinal = trace.length === rules.rounds - 1;
    if (!isFinal) {
      // 单候选短路：落点恒 0，且规避"唯一扇区权重为 0 时无区间可停"的死局
      stopIndex = isSingle ? 0 : pickStopIndex(weights, rng);
    }
    const totalBet = chips.reduce((sum, c) => sum + c, 0);
    const snapshot = {
      round: trace.length + 1,
      chips: chips.slice(),
      totalBet,
      stopIndex,
      weightsAfter: weights.slice(),
    };
    trace.push(snapshot);
    return { ...snapshot, isFinal };
  }

  function finalize() {
    if (finalOutcome !== null) {
      return finalOutcome;
    }
    if (trace.length < rules.rounds) {
      throw new Error(
        `仍有 ${rules.rounds - trace.length} 轮未完成，不能提前结算`,
      );
    }

    // 末轮锁定：argmax(权重)；容差内并列者由独立 seed 流确定性决出
    const maxWeight = Math.max(...weights);
    const tiedIndexes = [];
    for (let i = 0; i < weights.length; i++) {
      if (maxWeight - weights[i] < TIE_EPSILON) {
        tiedIndexes.push(i);
      }
    }
    let finalResult;
    if (tiedIndexes.length === 1 || isSingle) {
      finalResult = tiedIndexes[0];
    } else {
      // 并列决出走独立命名空间流：与主链取数进度互不影响，重放仍确定
      const tieRng = createRNG(`tie:${String(seed)}:${rules.rounds}`);
      finalResult = tiedIndexes[tieRng.int(0, tiedIndexes.length - 1)];
    }

    // 末轮落点回填为锁定结果：转盘末轮精确停在 argmax 扇区（仪式感收尾），
    // 全程维持"转盘落点 = 计算结果、不弄虚作假"的项目红线
    trace[trace.length - 1].stopIndex = finalResult;

    finalOutcome = {
      finalResult,
      finalId: candidates[finalResult].id,
      rounds: trace.map((r) => ({ ...r })),
      meta: { seed, configVersion: rules.configVersion ?? null },
    };
    return finalOutcome;
  }

  return {
    playRound,
    finalize,
    get roundIndex() {
      return trace.length;
    },
    get isFinished() {
      return finalOutcome !== null;
    },
  };
}

// 整局预演包装：给定全部轮次的下注一次性跑完（无头验证与模拟器形态）
// 输入输出契约与分步实况完全一致——同输入下 JSON 全等（探针等价性断言）
// 异常：betRounds 轮数与 rules.rounds 失配 → 中文 fail-fast（保留原报错时机）
export function runGame(candidates, betRounds, seed, rules) {
  if (!Array.isArray(betRounds) || betRounds.length !== rules?.rounds) {
    throw new Error(
      `下注轮数 ${betRounds?.length ?? 0} 与 rules.rounds=${rules?.rounds} 不一致`,
    );
  }
  const game = createGame(candidates, seed, rules);
  for (const chips of betRounds) {
    game.playRound(chips);
  }
  return game.finalize();
}

// ===== js/converge.js 模块说明 =====
// 函数清单与逻辑：
// - createGame(candidates, seed, rules)：闭包状态机——rng 主链/weights/trace；
//   playRound 极化+非末轮 pickStopIndex（单候选短路恒 0）；finalize 做
//   argmax 锁定（TIE_EPSILON 容差并列走 `tie:` 独立流 int 决出）+
//   末轮 stopIndex 回填；trace 每轮 {round, chips 快照, totalBet, stopIndex,
//   weightsAfter 快照}；finalize 幂等缓存 finalOutcome
// - runGame(candidates, betRounds, seed, rules)：createGame 逐轮推进后
//   finalize 的组合包装，供整局预演与既有验证资产复用
// 设计理由：
//   1) 两段式拆分的动因是真实交互时序——用户第 r+1 轮押谁取决于第 r 轮
//      落点，整局一次性 API 无法支撑 UI；而逐轮与整局共用同一实现消除漂移
//   2) 并列决出流用 `tie:{seed}:{rounds}` 命名空间隔离，主链消耗进度
//      不影响决出稳定性（同 seed 重跑恒同结果）
//   3) 末轮锁定语义：前 n-1 轮转盘只是概率表演并驱动权重演化，最终结果
//      必须可解释地等于"末轮后最被看好的选项"
// 异常处理：结构非法中文 fail-fast；金额与权重合法性分别委托
//   applyBet/pickStopIndex 的既有守卫；结束后追加下注/提前结算均拒绝
// 关联配置：rules.rounds/k/initialWeights/configVersion 由 js/rules.js 校验
//   规范化后传入；configVersion 仅透传记录进 meta（结果复现时对齐配置版本）
