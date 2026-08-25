// ============================================================
// 幸运饭桶大转盘 - 对局规则契约（config/rules.json 的守门人）
// 设计要点：必填键显式声明（P23 契约定案），缺键/坏值导入装配期
// fail-fast 中文报错；可选键宽容回落；输出规范化对象供全链消费。
// 关联配置：config/rules.json 是本文件契约的数据镜像（PL001.7.b）。
// ============================================================

import { validateDenominations } from "./bet.js";
import { SPIN_DEFAULTS } from "./wheel.js";

// 必填键：缺一即契约失败（对局无法成立的核心参数）
const REQUIRED_KEYS = ["rounds", "budget", "k", "chipDenominations"];

// 弹性数值解析内核：数字直用；数字字符串转数字；其余拒绝（配置侧宽容口径）
function toNumber(value, label) {
  let num = value;
  if (typeof num === "string") {
    num = Number(num.trim());
  }
  if (typeof num !== "number" || !Number.isFinite(num)) {
    throw new Error(`${label}必须是有限数字，收到：${JSON.stringify(value)}`);
  }
  return num;
}

// 校验并规范化规则配置：必填拦截 + 数值口径 + 可选键回落
// 输入：raw 装配层 JSON.parse 后的规则对象
// 输出：规范化对象 { rounds, budget, k, initialWeights, chipDenominations(升序), spin(完整), configVersion }
// 异常：非对象 / 缺必填键 / rounds 非正整数 / budget 非 / k 越界 / 面额表非法 /
//   initialWeights 非对象 / spin 字段坏类型 → 中文 fail-fast（PL001.7.b 验证口径）
export function validateRules(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`规则配置必须是对象，收到类型：${typeof raw}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in raw) || raw[key] === undefined || raw[key] === null) {
      throw new Error(`规则配置缺少必填键「${key}」，请检查 config/rules.json`);
    }
  }

  const rounds = toNumber(raw.rounds, "rounds ");
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error(`rounds 必须是正整数，收到：${JSON.stringify(raw.rounds)}`);
  }

  const budget = toNumber(raw.budget, "budget ");
  if (budget <= 0) {
    throw new Error(`budget 必须是正数，收到：${JSON.stringify(raw.budget)}`);
  }

  const k = toNumber(raw.k, "k ");
  if (k < 0) {
    throw new Error(`极化系数 k 不允许为负，收到：${JSON.stringify(raw.k)}`);
  }

  // 面额表委托 bet.js 契约（非空/正数/无重复），返回升序副本
  const chipDenominations = validateDenominations(raw.chipDenominations);

  // 初始权重可选：null/缺省视为等权；存在则须为对象（键值合法性由 initWeights 宽容兜底）
  let initialWeights = {};
  if (raw.initialWeights !== undefined && raw.initialWeights !== null) {
    if (
      typeof raw.initialWeights !== "object" ||
      Array.isArray(raw.initialWeights)
    ) {
      throw new Error("initialWeights 必须是 { 选项id: 权重 } 对象或 null");
    }
    initialWeights = { ...raw.initialWeights };
  }

  // 动画参数可选：字段级校验后与 SPIN_DEFAULTS 合并出完整 spin（缺字段回落缺省）
  const spinInput = raw.spin ?? {};
  if (typeof spinInput !== "object" || Array.isArray(spinInput)) {
    throw new Error("spin 必须是动画参数对象");
  }
  const durationMs = toNumber(
    spinInput.durationMs ?? SPIN_DEFAULTS.durationMs,
    "spin.durationMs ",
  );
  const settleTimeoutMs = toNumber(
    spinInput.settleTimeoutMs ?? SPIN_DEFAULTS.settleTimeoutMs,
    "spin.settleTimeoutMs ",
  );
  if (durationMs <= 0 || settleTimeoutMs < 0) {
    throw new Error("spin.durationMs 必须为正、settleTimeoutMs 不得为负");
  }
  const extraTurnsRaw = toNumber(
    spinInput.extraTurns ?? SPIN_DEFAULTS.extraTurns,
    "spin.extraTurns ",
  );
  if (!Number.isInteger(extraTurnsRaw) || extraTurnsRaw < 0) {
    throw new Error(
      `spin.extraTurns 必须是非负整数，收到：${JSON.stringify(spinInput.extraTurns)}`,
    );
  }
  const easing = spinInput.easing ?? SPIN_DEFAULTS.easing;
  if (typeof easing !== "string" || easing.trim() === "") {
    throw new Error("spin.easing 必须是非空字符串（CSS timing 函数）");
  }

  return {
    rounds,
    budget,
    k,
    initialWeights,
    chipDenominations,
    spin: { durationMs, extraTurns: extraTurnsRaw, easing, settleTimeoutMs },
    configVersion:
      raw.configVersion === undefined ? null : String(raw.configVersion),
  };
}

// ===== js/rules.js 模块说明 =====
// 函数清单与逻辑：
// - REQUIRED_KEYS：rules 结构必填键单一声明处（rounds/budget/k/chipDenominations）
// - toNumber(value, label)：弹性解析内核（数字直用/字符串 trim 转换/其余拒绝）
// - validateRules(raw)：九路守卫——非对象/四必填键缺失/rounds 口径/budget 正数/
//   k 非负/面额表委托 validateDenominations/initialWeights 形态/spin 字段级校验；
//   输出规范化对象：denominations 升序副本、spin 与 SPIN_DEFAULTS 合并为完整参数、
//   configVersion 缺省归一 null
// 设计理由：与 candidates.js 对称的"数据镜像契约"——config/rules.json 是数据，
//   本文件是结构的权威声明点；校验发生在启动装配期一次完成（运行时零 IO 零重验）
// 异常处理：全部中文 fail-fast 带键名定位；不静默回落必填项——
//   规则残缺的对局结果不可解释，宁可明确拒绝启动
// 关联配置：config/rules.json（PL001.7.b）；消费方 main.js 装配期调用一次，
//   规范化产物分发 converge（rounds/k/initialWeights/configVersion）、
//   bet 面板（budget/chipDenominations）、spinTo（spin 参数组）
