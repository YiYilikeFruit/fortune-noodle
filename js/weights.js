// ============================================================
// 幸运饭桶大转盘 - 权重状态与极化更新
// 设计要点：初始等权 w_i=1，rules.initialWeights 可按候选 id 覆盖；
// applyBet 执行极化公式 w_i ← w_i×(1+k·c_i/B)（B=Σc_i 本轮总注）；
// 全程纯函数：返回新数组、绝不修改输入（可解释可回放）。
// 关联配置：k 与 initialWeights 来自 config/rules.json（PL001.7.b），由调用方传入。
// ============================================================

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

// 极化更新一轮权重：w_i ← w_i×(1+k·c_i/B)，B=Σc_i
// 输入：weights 当前权重数组；chips 与 weights 同序的下注额数组；k 极化系数
// 输出：全新权重数组；B=0（全程零注）时返回同值浅拷贝，语义"零注不变"
// 异常：长度失配 / chip 非法 / k 非法 → 中文 fail-fast（编程错误早暴露）
export function applyBet(weights, chips, k) {
  if (!Array.isArray(weights) || !Array.isArray(chips)) {
    throw new Error("applyBet 的 weights 与 chips 都必须是数组");
  }
  if (chips.length !== weights.length) {
    throw new Error(
      `applyBet 长度失配：weights=${weights.length}，chips=${chips.length}`,
    );
  }
  if (typeof k !== "number" || !Number.isFinite(k)) {
    throw new Error(`applyBet 的极化系数 k 必须是有限数字，收到：${k}`);
  }
  let totalBet = 0;
  for (const c of chips) {
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0) {
      throw new Error(`applyBet 的下注额必须是非负有限数字，收到：${c}`);
    }
    totalBet += c;
  }
  // 零注轮：B=0 时公式分母无意义，直接原样返回拷贝（保持"不改输入"约定）
  if (totalBet === 0) {
    return weights.slice();
  }
  return weights.map((w, i) => w * (1 + (k * chips[i]) / totalBet));
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
