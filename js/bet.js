// ============================================================
// 幸运饭桶大转盘 - 压筹码输入校验与形态转换
// 设计要点：UI 层筹码面板的自然形态是 { id: 金额 } 映射；
// validateChips 负责预算/合法性拦截（宽容解析数字字符串）；
// chipsToVector 把映射转成与候选集同序的下注向量供 converge 编排消费；
// 筹码面额表走 rules.chipDenominations 配置，本模块提供其契约校验。
// ============================================================

// 弹性数值解析内核：数字直用；数字字符串 trim 后转数字；其余拒绝
// 输入：value 任意值；label 报错定位描述
// 输出：有限非负数字
// 异常：不可解析 / 非有限 / 负数 → 中文错误（坏输入明确报错不静默）
function toNonNegativeNumber(value, label) {
  let num = value;
  if (typeof num === "string") {
    num = Number(num.trim());
  }
  if (typeof num !== "number" || !Number.isFinite(num) || num < 0) {
    throw new Error(
      `${label}必须是非负有限数字（支持数字字符串），收到：${JSON.stringify(value)}`,
    );
  }
  return num;
}

// 校验下注映射并规范化：预算约束 + 选项 id 白名单 + 金额弹性解析
// 输入：chips { id: 金额 } 映射（UI 回传形态）；budget 本轮预算；candidateIds 合法 id 数组
// 输出：全新规范化对象 { id: 数字金额 }（未注的 id 不出现，保持稀疏）
// 异常：非对象 / 未知 id / 负或坏金额 / 总额超预算 → 中文 fail-fast（超预算消息带两侧数值）
export function validateChips(chips, budget, candidateIds) {
  if (chips === null || typeof chips !== "object" || Array.isArray(chips)) {
    throw new Error(
      `下注必须是 { 选项id: 金额 } 映射，收到类型：${typeof chips}`,
    );
  }
  if (!Array.isArray(candidateIds)) {
    throw new Error("validateChips 需要合法选项 id 数组");
  }
  const checkedBudget = toNonNegativeNumber(budget, "预算 ");
  const validIds = new Set(candidateIds);
  const normalized = {};
  let total = 0;
  for (const id of Object.keys(chips)) {
    if (!validIds.has(id)) {
      throw new Error(`下注包含未知选项 id「${id}」`);
    }
    const amount = toNonNegativeNumber(chips[id], `选项「${id}」的下注额 `);
    normalized[id] = amount;
    total += amount;
  }
  if (total > checkedBudget) {
    throw new Error(`下注总额 ${total} 超出本轮预算 ${checkedBudget}`);
  }
  return normalized;
}

// 下注映射 → 与候选集同序的下注向量（converge/applyBet 消费形态）
// 输入：chips { id: 金额 } 映射（金额走弹性解析）；candidates 规范化候选数组
// 输出：与 candidates 同序的数字数组，未注项补 0
// 异常：candidates 非数组 / chips 含未知 id / 金额非法 → 中文 fail-fast
export function chipsToVector(chips, candidates) {
  if (!Array.isArray(candidates)) {
    throw new Error("chipsToVector 需要候选数组");
  }
  if (chips === null || typeof chips !== "object" || Array.isArray(chips)) {
    throw new Error(
      `下注必须是 { 选项id: 金额 } 映射，收到类型：${typeof chips}`,
    );
  }
  const ids = new Set(candidates.map((c) => c.id));
  for (const id of Object.keys(chips)) {
    if (!ids.has(id)) {
      throw new Error(`下注包含未知选项 id「${id}」`);
    }
  }
  return candidates.map((c) =>
    Object.prototype.hasOwnProperty.call(chips, c.id)
      ? toNonNegativeNumber(chips[c.id], `选项「${c.id}」的下注额 `)
      : 0,
  );
}

// 筹码面额配置契约校验：rules.chipDenominations 的守门人
// 输入：rawList 面额原始配置（允许数字字符串）
// 输出：全新升序数字数组（UI 筹码按钮按此顺序渲染）
// 异常：非数组 / 空 / 元素非正数 / 重复面额 → 中文 fail-fast（导入期拦截坏配置）
export function validateDenominations(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error(
      "chipDenominations 必须是非空数组，请检查 config/rules.json",
    );
  }
  const seen = new Set();
  const out = rawList.map((d, i) => {
    const v = Number(typeof d === "string" ? d.trim() : d);
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(
        `chipDenominations 第 ${i + 1} 项必须是正数，收到：${JSON.stringify(d)}`,
      );
    }
    if (seen.has(v)) {
      throw new Error(`chipDenominations 存在重复面额：${v}`);
    }
    seen.add(v);
    return v;
  });
  return out.sort((a, b) => a - b);
}

// ===== js/bet.js 模块说明 =====
// 函数清单与逻辑：
// - toNonNegativeNumber(value, label)：弹性解析内核（与 candidates.js 同策略：
//   数字直用、数字字符串 trim 转换、坏值中文报错），模块私有
// - validateChips(chips, budget, candidateIds)：五路拦截——非对象/未知 id/
//   负或坏金额/超预算/预算本身非法；返回稀疏规范化新对象（不改输入）
// - chipsToVector(chips, candidates)：映射→同序向量，未注补 0；与 applyBet
//   的"同序数组"约定衔接（PL001.3.b），id 白名单二次把关
// - validateDenominations(rawList)：面额表契约（非空/正数/无重复），升序输出；
//   "自定义面额生效"= 面额集合完全来自 rules.chipDenominations 经此校验，
//   UI 按钮组与拆筹展示均以返回值为准，代码内零硬编码面额
// 设计理由：校验（用户输入边界）与向量转换（业务编排形态）分离——
//   UI 每轮提交先过 validateChips（预算拦截），确认后 chipsToVector 进 converge
// 异常处理：全部中文 fail-fast 带定位（id/序号/两侧数值）；无静默回落——
//   下注是用户显式意图，坏输入回落会造成"以为押了其实没押"的可解释性破坏
// 关联配置：budget/chipDenominations 来自 config/rules.json（PL001.7.b），
//   由装配层读出后传参，本模块不直接读配置
