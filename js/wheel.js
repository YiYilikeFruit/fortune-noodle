// ============================================================
// 幸运饭桶大转盘 - 转盘停止逻辑与旋转动画
// 设计要点：结果先由 pickStopIndex 按 [0,Σw) 累计权重定位（纯函数），
// spinTo 只是把既定落点表演出来——不伪随机、不弄虚作假；
// 动画仅用 CSS3 transform rotate + transition（平台禁 WebGL/Canvas 兜底即可）。
// 关联配置：动画参数由装配层从 rules.json 读出后经 opts 传入，
//   SPIN_DEFAULTS 仅为缺省兜底的单一声明处。
// ============================================================

// 权重数组守卫：非空且全为非负有限数字，返回总和
// 异常：空数组/负权重/非有限权重 → 中文 fail-fast（pickStopIndex/sectorAngles 共用）
function assertWeights(weights) {
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new Error("需要非空权重数组");
  }
  let total = 0;
  for (const w of weights) {
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
      throw new Error(`权重必须是非负有限数字，收到：${w}`);
    }
    total += w;
  }
  if (total <= 0) {
    throw new Error("权重总和必须大于零（当前无可选项）");
  }
  return total;
}

// 按累计权重定位落点扇区：point ∈ [0,Σw) 命中的第一个累计区间
// 输入：weights 非空权重数组（允许含 0）；rng 提供 next() 的随机源
// 输出：命中扇区下标；权重越大区间越宽越易停（概率与权重成正比）
// 异常：空数组/负权重/非有限权重/全零权重/rng 缺 next → 中文 fail-fast
export function pickStopIndex(weights, rng) {
  if (!rng || typeof rng.next !== "function") {
    throw new Error("pickStopIndex 需要提供 next() 的随机源");
  }
  const total = assertWeights(weights);
  const point = rng.next() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (point < acc) {
      return i;
    }
  }
  // 浮点兜底：point 因舍入恰好 == total 时归入最后一项（区间右端闭口）
  return weights.length - 1;
}

// 落点扇区的盘面中心角：绘制口径为扇区 i 占 [i·a, (i+1)·a)，a=360/count，
// 以指针方向为 0 度顺时针展开；中心角即 (i+0.5)·a
// 输入：stopIndex 落点下标；sectorCount 扇区总数
// 输出：扇区中心相对指针方向的度数（正数，<360）
// 异常：下标越界/扇区数 <2 或非整数 → 中文 fail-fast；
//   指针不在 12 点方向的视觉偏移属渲染层职责，不影响本换算
export function angleForIndex(stopIndex, sectorCount) {
  if (!Number.isInteger(stopIndex) || !Number.isInteger(sectorCount)) {
    throw new Error(
      `angleForIndex 需要整数参数，收到：${stopIndex}, ${sectorCount}`,
    );
  }
  if (sectorCount < 2) {
    throw new Error(`angleForIndex 扇区数至少为 2，收到：${sectorCount}`);
  }
  if (stopIndex < 0 || stopIndex >= sectorCount) {
    throw new Error(`angleForIndex 下标越界：${stopIndex} / ${sectorCount}`);
  }
  return ((stopIndex + 0.5) * 360) / sectorCount;
}

// 按当前权重比例计算各扇区角度区间（转盘绘制与落点换算共用口径）
// 输入：weights 权重数组；输出 [{start, end, center}] 度数数组，
//   从指针方向 0 度顺时针展开，扇区 i 占 [start_i, end_i)，center 为其中点
// 用途：ui 层以 start/end 拼 conic-gradient 色带、以 center 排布标签
// 异常：空数组/负权重/全零权重 → 中文 fail-fast（与 pickStopIndex 同守卫）
export function sectorAngles(weights) {
  const total = assertWeights(weights);
  const out = [];
  let acc = 0;
  for (const w of weights) {
    const span = (w * 360) / total;
    out.push({ start: acc, end: acc + span, center: acc + span / 2 });
    acc += span;
  }
  return out;
}

// 把指定扇区中心顺时针转到指针位所需的旋转角（mod 360 后的盘面目标角）
// 口径：扇区中心初始在 center 度处，需顺时针再转 360-center 使其对准指针；
// 输出 ∈ [0, 360)，等权等分时与 angleForIndex 的补角一致
// 异常：下标越界/权重非法 → 中文 fail-fast
export function rotationForIndex(weights, index) {
  const angles = sectorAngles(weights);
  if (!Number.isInteger(index) || index < 0 || index >= angles.length) {
    throw new Error(`rotationForIndex 下标越界：${index} / ${angles.length}`);
  }
  return (360 - angles[index].center) % 360;
}

// 动画缺省参数单一声明处：装配层应从 rules.json 读取后经 opts 覆盖传入
// settleTimeoutMs 为 transitionend 丢失时的兜底等待增量
export const SPIN_DEFAULTS = Object.freeze({
  durationMs: 4000,
  extraTurns: 5,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  settleTimeoutMs: 120,
});

// 旋转动画到既定落点：CSS transition 驱动，transitionend + 定时器双保险
// 输入：el 转盘元素；fromAngle 当前累计角度；toAngle 目标扇区盘面角（angleForIndex 输出）；
//   opts 覆盖 SPIN_DEFAULTS 字段
// 输出：Promise<number>——resolve 本次写入的总角度（调用方存为下次 fromAngle）
// 行为：总角度 = fromAngle + extraTurns 整圈 + 归一化的正向角差（只顺时针不倒转）；
//   双保险：transitionend 触发即收尾；事件丢失则 durationMs+settleTimeoutMs 后兜底收尾，
//   两路互斥（settled 标志），监听器与定时器均清理防泄漏
// 异常：el 缺 style/addEventListener 时抛原生 TypeError（装配错误早暴露）
export function spinTo(el, fromAngle, toAngle, opts = {}) {
  return new Promise((resolve) => {
    const o = { ...SPIN_DEFAULTS, ...opts };
    // 归一化正向角差：无论 toAngle 相对 fromAngle 在哪个象限都只顺时针到达
    const delta = (((toAngle - fromAngle) % 360) + 360) % 360;
    const total = fromAngle + o.extraTurns * 360 + delta;

    el.style.transition = `transform ${o.durationMs}ms ${o.easing}`;
    el.style.transform = `rotate(${total}deg)`;

    let settled = false;
    const onEnd = (event) => {
      // 过滤非 transform 属性的过渡结束事件（如 opacity 连带过渡）
      if (event && event.propertyName && event.propertyName !== "transform") {
        return;
      }
      finish();
    };
    const timer = setTimeout(finish, o.durationMs + o.settleTimeoutMs);

    function finish() {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        el.removeEventListener("transitionend", onEnd);
      } catch {
        // stub 环境/异常元素下清理失败不影响收尾语义
      }
      resolve(total);
    }

    el.addEventListener("transitionend", onEnd);
  });
}

// ===== js/wheel.js 模块说明 =====
// 函数清单与逻辑：
// - assertWeights(weights)：内部守卫，非空+非负有限+总和为正，返回总和
// - pickStopIndex(weights, rng)：先求和再取 point=rng.next()×total，
//   单遍累计定位；区间左闭右开 [acc_prev, acc_cur)，右端浮点兜底归末项；
//   全零权重视为"无可选项"fail-fast（对应规则覆盖全 0 的配置错误）
// - angleForIndex(stopIndex, sectorCount)：等分扇区中心角换算纯函数，
//   verify_wheel 以等分扇区逐一双射断言（通用工具口径）
// - sectorAngles(weights)：按权重比例的扇区角度区间 [{start,end,center}]，
//   转盘 conic-gradient 绘制与标签排布共用此口径——扇区大小随极化可视化
// - rotationForIndex(weights, index)：把指定扇区中心顺时针转到指针位的目标角
//   （=360-center 归一化），spinTo 的 toAngle 即由此产出
// - spinTo(el, fromAngle, toAngle, opts)：Promise 化 CSS 动画封装。
//   双保险机制：transitionend 主路径 + setTimeout(duration+settle) 兜底路径，
//   settled 标志保证 resolve 恰好一次；propertyName 过滤防连带过渡误触发；
//   返回总角度供调用方续接（角度持续增长由 CSS transform 语义天然容忍）
// 设计理由：落点计算与动画表现彻底分离——converge 出结果、wheel 只演出，
//   满足"结果可解释、不弄虚作假"的项目红线；DOM 依赖被压缩到 spinTo 一个函数，
//   其余全部可 node 无头直测；扇区随权重比例缩放使"押注变强"肉眼可见
// 异常处理：纯函数入参非法中文 fail-fast；spinTo 收尾路径吞清理异常保 resolve
// 关联配置：durationMs/extraTurns/easing/settleTimeoutMs 由 rules.json 外置，
//   SPIN_DEFAULTS 仅兜底（PL001.7.b 动画参数条目）；rules.js 校验 spin 后合并本常量
