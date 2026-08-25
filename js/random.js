// ============================================================
// 幸运饭桶大转盘 - 可复现随机源（mulberry32）
// 设计要点：同一 seed 恒产同一序列（结果可复现可解释）；
// deriveSeed 从整局基础 seed 派生每轮独立随机流，互不污染。
// 关联配置：无（纯工具层；seed 来源链 #seed=/localStorage/随机生成 在装配层）。
// 平台约束：纯 JS 零依赖零 DOM，禁 eval/WebGL 场景可用（AGENTS.md 运行与验证）。
// ============================================================

// xmur3 字符串哈希：把任意字符串充分雪崩压缩为一个 uint32
// 输入：str 字符串；输出：uint32 整数
// 异常：无（模块内部函数，入参由 toSeedUint32 保证非空字符串）
function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// seed 归一化：数字截断取 uint32；字符串走哈希；其余类型拒绝
// 输入：seed（number | string）；输出：uint32 整数
// 异常：非有限数字 / 空串 / 不支持的类型 → 中文 fail-fast（错误策略主线）
function toSeedUint32(seed) {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new Error(`随机源 seed 必须是有限数字或非空字符串，收到：${seed}`);
    }
    return Math.trunc(seed) >>> 0;
  }
  if (typeof seed === "string") {
    if (seed.length === 0) {
      throw new Error("随机源 seed 字符串不能为空");
    }
    return hashString(seed);
  }
  throw new Error(`随机源 seed 只支持数字或字符串，收到类型：${typeof seed}`);
}

// 创建随机数发生器：同 seed 恒产同序列，各实例内部状态互不影响
// 输入：seed（number | string）；输出：{ next, int } 取数接口对象
// 异常：seed 非法在构造期立即抛错；next/int 正常取数路径不再抛错
export function createRNG(seed) {
  // mulberry32 内部 32 位状态，随每次取数推进
  let s = toSeedUint32(seed);

  // 取一个 [0,1) 均匀伪随机小数（mulberry32 标准变换）
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,

    // 取 [min, max] 闭区间均匀整数（两端均可达到）
    // 口径说明：floor(next()*span)+min 直取法——双精度 53 位尾数下，
    // span 远小于 2^53 时模偏差 < 1e-10，决策小工具场景可忽略；
    // 如未来需要密码学级均匀再换拒绝采样（KISS，不提前设计）
    // 异常：min/max 非有限、区间为空（max<min 经取整后）→ 中文 fail-fast
    int(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new Error(
          `int(min, max) 两端必须是有限数字，收到：${min}, ${max}`,
        );
      }
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (hi < lo) {
        throw new Error(`int(min, max) 区间为空：min=${min} > max=${max}`);
      }
      const span = hi - lo + 1;
      return lo + Math.floor(next() * span);
    },
  };
}

// 派生 seed：把整局基础 seed 与轮次号混合成新的字符串 seed
// 用途：收敛编排每轮 createRNG(deriveSeed(baseSeed, r))，各轮流互不污染且整体可复现
// 输入：baseSeed（number | string）、round（非负整数）；输出：字符串 seed
// 异常：round 非负整数校验失败抛中文错；baseSeed 合法性交 createRNG 入口把关
export function deriveSeed(baseSeed, round) {
  if (!Number.isInteger(round) || round < 0) {
    throw new Error(`派生 seed 的轮次必须是非负整数，收到：${round}`);
  }
  return `${String(baseSeed)}#r${round}`;
}

// ===== js/random.js 模块说明 =====
// 函数清单与逻辑：
// - hashString(str)：xmur3 字符串哈希，异文异值、雪崩充分，输出 uint32
// - toSeedUint32(seed)：seed 归一化入口；数字 trunc>>>0、字符串 xmur3、其余拒绝
// - createRNG(seed)：mulberry32 工厂。next() ∈ [0,1)；int(min,max) ∈ 闭区间
//   [min,max]。int 采用 floor(next*span) 直取法：双精度下模偏差可忽略，
//   精度取舍已注释在实现处，如需严格均匀再升级拒绝采样（当前不需要）
// - deriveSeed(baseSeed, round)：模板串 `${base}#r${round}`，确定性派生
// 设计理由：mulberry32 体量小、确定性、零依赖，契合离线包与平台禁 eval 约束；
//   字符串 seed 支持让 URL #seed= 与 localStorage 记忆链路直接可用
// 异常处理：构造/入参非法一律中文 fail-fast；取数路径零异常不中断对局
// 关联配置：无；configVersion 记录与 seed 来源优先级在装配层（PL001.8.d）
