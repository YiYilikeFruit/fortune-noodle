// ============================================================
// 幸运饭桶大转盘 - 权重状态与极化更新
// 设计要点：初始等权 w_i=1，rules.initialWeights 可按候选 id 覆盖；
// PL002 赌场轮盘式升降权——applyBet 按 bets 描述（red/black/low/high/single）
// 展开命中号码集合，命中菜升权 w×(1+k·amount/B)、未命中菜降权
// w×(1-k·amount/B)，逐 bet 累乘（乘法交换律 → 与顺序无关、可解释）；
// 0 号（numberToIndex[0]=-1）不参与；权重保底 >0。全程纯函数。
// 关联配置：k 与 initialWeights 来自 config/rules.json（PL001.7.b）。
// ============================================================

import { betTypeToNumbers } from "./bet.js";
import { LAYOUT } from "./wheel.js";

// 权重保底：极端 k 或满额单注下未命中乘数可能 ≤0，保底防归零
const WEIGHT_FLOOR = 1e-9;

// 判断是否为合法权重值：有限非负数字
// 说明：0 允许（配置上永不倾向该选项）；字符串等宽松形态在这里不接受——
// 配置侧的弹性转换属 rules 契约层职责（PL001.7.b），权重层只认规范值
function isValidWeight(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// 初始化权重数组：默认全 1 等权，initialOverrides 按 id 覆盖
// 输入：candidates 规范化候选数组（js/candidates.js 输出）；initialOverrides {id:weight} 或 null
// 输出：与 candidates 同序的数字数组；非法覆盖项（负数/非数字）忽略回落 1（配置宽容）
// 异常：candidates 非数组抛中文错误
export function initWeights(candidates, initialOverrides) {
  if (!Array.isArray(candidates)) {
    throw new Error(`initWeights 需要候选数组，收到类型：${typeof candidates}`);
  }
  const overrides = initialOverrides ?? {};
  return candidates.map((c) => {
    const v = overrides[c.id];
    return isValidWeight(v) ? v : 1;
  });
}

// 升降权更新一轮权重：命中菜升、未命中菜降，逐 bet 累乘（PL002 定案）
// 输入：weights 当前权重数组（36 菜同序）；bets 规范化下注描述
//   [{type, amount, number?}]；k 极化系数；numberToIndex 号码→菜索引映射
//   （buildNumberMap 产物，长度 37，0 号位 -1）
// 输出：全新权重数组；B=0（空注/零额）时返回同值浅拷贝，语义"零注不变"
// 公式：单 bet {type, amount}，B=Σamount——命中该 bet 号码集合的菜
//   w×(1+k·amount/B)，未命中菜 w×(1-k·amount/B)；多 bet 逐个累乘
//   （乘法交换律成立，顺序无关）；每次结果与 WEIGHT_FLOOR 取 max 保底
// 异常：weights/bets/numberToIndex 结构非法 / k 非法 / 金额非法 → 中文 fail-fast
export function applyBet(weights, bets, k, numberToIndex) {
  if (!Array.isArray(weights) || !Array.isArray(bets)) {
    throw new Error("applyBet 的 weights 与 bets 都必须是数组");
  }
  if (typeof k !== "number" || !Number.isFinite(k) || k < 0) {
    throw new Error(`applyBet 的极化系数 k 必须是非负有限数字，收到：${k}`);
  }
  if (!Array.isArray(numberToIndex) || numberToIndex.length < 37) {
    throw new Error(
      "applyBet 需要 buildNumberMap 产出的号码→索引映射（长度 ≥37）",
    );
  }

  let totalBet = 0;
  for (const bet of bets) {
    if (bet === null || typeof bet !== "object") {
      throw new Error("applyBet 的 bets 每项必须是 {type, amount} 对象");
    }
    if (
      typeof bet.amount !== "number" ||
      !Number.isFinite(bet.amount) ||
      bet.amount < 0
    ) {
      throw new Error(
        `applyBet 的下注额必须是非负有限数字，收到：${bet.amount}`,
      );
    }
    totalBet += bet.amount;
  }
  // 零注轮：B=0 时升降乘数分母无意义，直接原样返回拷贝（保持"不改输入"约定）
  if (totalBet === 0) {
    return weights.slice();
  }

  let out = weights.slice();
  for (const bet of bets) {
    // 命中号码 → 菜索引集合（跳过 -1：0 号独立格不参与升降权）
    const nums = betTypeToNumbers(bet.type, bet.number, LAYOUT);
    const hit = new Set();
    for (const n of nums) {
      const idx = numberToIndex[n];
      if (idx >= 0) {
        hit.add(idx);
      }
    }
    const up = 1 + (k * bet.amount) / totalBet;
    const down = 1 - (k * bet.amount) / totalBet;
    out = out.map((w, i) => {
      const m = hit.has(i) ? up : down;
      return Math.max(w * m, WEIGHT_FLOOR);
    });
  }
  return out;
}

// ===== js/weights.js 模块说明 =====
// 函数清单与逻辑：
// - isValidWeight(value)：合法权重判定（有限非负数字），供覆盖项过滤
// - initWeights(candidates, initialOverrides)：等权初始化 + 按 id 覆盖；
//   非法覆盖项静默忽略回落 1——理由：rules 配置的键值合法性由 PL001.7.b
//   契约层把关，此处宽容兜底防单点脏值拖垮整局
// - applyBet(weights, chips, k)：极化公式实现。chips 采用与 weights 同序数组
//   形态（id→额度的映射转换由 bet.js/validateChips 负责，PL001.6）；
//   B=Σc_i；返回新数组，零注轮 slice 拷贝
// 设计理由：
//   1) 纯函数不改输入——收敛轨迹需要逐轮快照回放，原地突变会毁掉可解释性
//   2) 极化方向自证：c_i/B ∈[0,1]，高注项乘数 ≥1 且严格大于低注项乘数，
//      高注占比单调上升（verify_weights 有对应断言）
//   3) 长度失配/负注额属编程错误而非用户输入错误，fail-fast 早暴露
// 异常处理：入参结构非法中文 fail-fast；正常博弈路径（含零注）零异常
// 关联配置：rules.k（默认 0.5）、rules.initialWeights（缺省视为全等权），
//   两参数均由 converge 编排层从 rules.json 读出后传入，本模块不读配置
