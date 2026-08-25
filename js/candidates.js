// ============================================================
// 幸运饭桶大转盘 - 候选集加载与键名契约校验
// 设计要点：结构键名在本文件显式声明（P23 契约定案：代码内声明不外置）；
// 必填缺失/重复 id/空集 fail-fast 中文报错；数值字段宽容解析（弹性转换）。
// 核心层零 IO：raw 数据由装配层 fetch 解析后传入，便于无头验证。
// 关联配置：config/candidates.json 的结构即本文件契约的镜像（PL001.7.a）。
// ============================================================

// 候选集必填键：缺一即契约失败（导入期/加载期 fail-fast）
const REQUIRED_KEYS = ["id", "name"];

// 候选集可选键：缺省有回落语义（weight 回落等权 1，color 回落 null）
// 声明用途：契约自文档化 + 未来可加"未知键告警"而不改结构
const OPTIONAL_KEYS = ["weight", "color"];

// 校验原始候选数组是否符合键名契约（只读校验，不修改输入）
// 输入：rawList 待校验数组（已由装配层 JSON.parse）；输出：true（全部通过）
// 异常：非数组 / 空集 / 元素非对象 / 缺必填键 / 空白 id / 重复 id → 中文 fail-fast
export function validateCandidates(rawList) {
  if (!Array.isArray(rawList)) {
    throw new Error(`候选集必须是数组，收到类型：${typeof rawList}`);
  }
  if (rawList.length === 0) {
    throw new Error("候选集不能为空，请检查 config/candidates.json");
  }
  const seenIds = new Set();
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`候选集第 ${i + 1} 项必须是对象`);
    }
    for (const key of REQUIRED_KEYS) {
      if (!(key in item) || item[key] === undefined || item[key] === null) {
        throw new Error(`候选集第 ${i + 1} 项缺少必填键「${key}」`);
      }
    }
    const id = String(item.id).trim();
    if (id === "") {
      throw new Error(`候选集第 ${i + 1} 项的 id 不能为空白`);
    }
    if (seenIds.has(id)) {
      throw new Error(`候选集存在重复 id「${id}」`);
    }
    seenIds.add(id);
  }
  return true;
}

// 弹性数值解析：数字直用；数字字符串转数字；其余一律拒绝
// 输入：value 任意值；label 报错定位用的字段描述
// 输出：有限非负数字
// 异常：不可解析 / 非有限 / 负数 → 中文错误（坏值不静默，保结果可解释）
function toFiniteNonNegative(value, label) {
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

// 加载候选集：契约校验 + 规范化（宽容解析），返回全新规范化数组
// 输入：rawList 装配层传入的已解析 JSON 数组；输出 [{id,name,weight,color}] 与原序一致
// 异常：契约失败 / weight 坏值抛中文错误；调用方捕获后走降级提示不崩溃
export function loadCandidates(rawList) {
  validateCandidates(rawList);
  return rawList.map((item) => ({
    // id 统一字符串化：与 UI dataset、initialOverrides 键、chips 映射键同源可比对
    id: String(item.id).trim(),
    name: String(item.name),
    // weight 宽容解析：缺省回落等权 1；"2.5" 形式弹性转数字
    weight:
      item.weight === undefined
        ? 1
        : toFiniteNonNegative(
            item.weight,
            `候选「${item.name}」(id=${String(item.id).trim()}) 的 weight `,
          ),
    // color 纯展示可选：缺省 null 由 UI 层回落主题色
    color: item.color === undefined ? null : String(item.color),
  }));
}

// ===== js/candidates.js 模块说明 =====
// 函数清单与逻辑：
// - REQUIRED_KEYS/OPTIONAL_KEYS：结构键名单一声明处（P23：接口标识符双方声明，
//   本文件是候选集结构的权威声明点，config/candidates.json 是数据镜像）
// - validateCandidates(rawList)：五路 fail-fast——非数组/空集/元素非对象/
//   缺必填键/空白或重复 id，全部中文报错并带定位（第 N 项/id 名）
// - toFiniteNonNegative(value, label)：数字字段弹性转换内核；
//   字符串 trim 后 Number()；NaN/Infinity/负数拒绝（坏值静默会破坏收敛可解释性）
// - loadCandidates(rawList)：先 validate 再规范化；weight 缺省 1、color 缺省 null、
//   id 规范化为 trim 后字符串（与权重覆盖/下注映射的键口径一致）
// 设计理由：核心层纯函数零 IO——fetch 与坏 JSON 处理留在装配层（PL001.7.c），
//   本模块只对"已解析的结构"负责，从而 node 无头直测、浏览器复用同一份逻辑
// 异常处理：契约与坏值 fail-fast 中文报错（错误策略：能自愈的部分宽容、
//   伤语义的部分明确报错）；不吞错不静默回落，避免"看起来在跑其实错了"
// 关联配置：candidates.json（PL001.7.a）；rules.initialWeights 以本模块输出的
//   id 为键（weights.js 消费）
