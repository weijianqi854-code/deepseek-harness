import { BLOCKING_DRIFT_KINDS } from './types.ts';
import type {
  GateInput,
  GateReason,
  GateResult,
  PlanAlternative,
  RoundtripFile,
  SlotEntry,
  SlotsFile,
  Stage,
  TaskKind,
} from './types.ts';

/**
 * Narrows one slots.json member to its list form. `Array.isArray` does not
 * narrow readonly arrays on every TypeScript version in use, so the
 * predicate is stated once here.
 *
 * @param value A slot entry or a list of slot entries.
 * @returns True when `value` is a list of entries.
 */
function isSlotList(value: SlotEntry | readonly SlotEntry[]): value is readonly SlotEntry[] {
  return Array.isArray(value);
}

/**
 * Walks every slot entry in slots.json, flattening per-key lists. Yields the
 * qualified slot name (`key` or `key[i]`) with each entry, in document order.
 *
 * @param slots The parsed slots.json document.
 * @returns Pairs of qualified slot name and slot entry.
 */
export function* iterSlotEntries(slots: SlotsFile): Generator<[string, SlotEntry]> {
  for (const key of Object.keys(slots)) {
    const value = slots[key];
    if (value === undefined) continue;
    if (isSlotList(value)) {
      for (let i = 0; i < value.length; i++) yield [`${key}[${i}]`, value[i]];
    } else {
      yield [key, value];
    }
  }
}

/**
 * Builds a failing gate result.
 *
 * @param stage The stage whose exit this gate guards.
 * @param reasons Structured failure reasons; must be non-empty.
 * @returns A failing gate result.
 */
function fail(stage: Stage, reasons: GateReason[]): GateResult {
  return { stage, pass: false, reasons };
}

/**
 * Builds a passing gate result.
 *
 * @param stage The stage whose exit this gate guards.
 * @returns A passing gate result with no reasons.
 */
function pass(stage: Stage): GateResult {
  return { stage, pass: true, reasons: [] };
}

/**
 * G1: every high-rework-cost slot is filled, and every default-valued slot
 * has been disclosed to the user at least once.
 *
 * @param input Facts for the elicit exit.
 * @returns The G1 evaluation.
 */
export function evaluateG1(input: { readonly slots: SlotsFile | null }): GateResult {
  if (input.slots === null) {
    return fail('elicit', [{ code: 'slots/missing', detail: 'slots.json 不存在' }]);
  }
  const reasons: GateReason[] = [];
  for (const [name, entry] of iterSlotEntries(input.slots)) {
    if (entry.rework_cost === 'high' && !entry.filled) {
      reasons.push({ code: 'slots/high-cost-unfilled', detail: `槽位「${name}」返工成本高且未填充` });
    }
    if (entry.source === 'default' && !entry.disclosed) {
      reasons.push({ code: 'slots/default-undisclosed', detail: `槽位「${name}」使用默认值但未告知用户` });
    }
  }
  return reasons.length === 0 ? pass('elicit') : fail('elicit', reasons);
}

/**
 * G2: no blocking drift, no drift awaiting adjudication, the stored verdict
 * and blocking count agree with the drift list, and the user has explicitly
 * confirmed the spec.
 *
 * @param input Facts for the align exit.
 * @returns The G2 evaluation.
 */
export function evaluateG2(input: {
  readonly roundtrip: RoundtripFile | null;
  readonly user_confirmed: boolean;
}): GateResult {
  if (input.roundtrip === null) {
    return fail('align', [{ code: 'roundtrip/missing', detail: 'roundtrip.json 不存在' }]);
  }
  const reasons: GateReason[] = [];
  const hard = input.roundtrip.drift.filter((drift) => BLOCKING_DRIFT_KINDS.includes(drift.kind));
  const pending = input.roundtrip.drift.filter(
    (drift) =>
      !BLOCKING_DRIFT_KINDS.includes(drift.kind) &&
      drift.adjudicated !== true &&
      drift.adjudicated !== false,
  );
  for (const drift of hard) {
    reasons.push({ code: 'roundtrip/blocking-drift', detail: `${drift.kind}：${drift.detail}` });
  }
  if (pending.length > 0) {
    reasons.push({
      code: 'roundtrip/unadjudicated',
      detail: `${pending.length} 条非阻塞漂移待用户裁决`,
    });
  }
  if (input.roundtrip.blocking !== hard.length) {
    reasons.push({
      code: 'roundtrip/blocking-mismatch',
      detail: `blocking=${input.roundtrip.blocking} 与漂移清单不符（应为 ${hard.length}）`,
    });
  }
  const expectedVerdict = hard.length === 0 && pending.length === 0 ? 'pass' : 'fail';
  if (input.roundtrip.verdict !== expectedVerdict) {
    reasons.push({
      code: 'roundtrip/verdict-mismatch',
      detail: `verdict=${input.roundtrip.verdict} 与漂移清单不符（应为 ${expectedVerdict}）`,
    });
  }
  if (!input.user_confirmed) {
    reasons.push({ code: 'roundtrip/user-unconfirmed', detail: '用户未显式确认规格' });
  }
  return reasons.length === 0 ? pass('align') : fail('align', reasons);
}

/**
 * G3: at least two analyzed alternatives, each carrying at least one
 * evidence locator the caller has verified to resolve.
 *
 * @param input Facts for the analyze exit.
 * @returns The G3 evaluation.
 */
export function evaluateG3(input: {
  readonly alternatives: readonly PlanAlternative[] | null;
}): GateResult {
  const { alternatives } = input;
  if (alternatives === null) {
    return fail('analyze', [{ code: 'plan/missing', detail: '无备选方案' }]);
  }
  const reasons: GateReason[] = [];
  if (alternatives.length < 2) {
    reasons.push({
      code: 'plan/needs-two-alternatives',
      detail: `只有 ${alternatives.length} 个备选，至少需要 2 个`,
    });
  }
  for (const alternative of alternatives) {
    if (alternative.evidence.length === 0) {
      reasons.push({
        code: 'plan/evidence-missing',
        detail: `备选「${alternative.name}」无证据`,
      });
    } else if (alternative.evidence_verified !== true) {
      reasons.push({
        code: 'plan/evidence-unverified',
        detail: `备选「${alternative.name}」的证据未验证可解析`,
      });
    }
  }
  return reasons.length === 0 ? pass('analyze') : fail('analyze', reasons);
}

/**
 * G4: a non-empty prototype, a non-empty not-do list, and explicit user
 * confirmation of the embodied form.
 *
 * @param input Facts for the embody exit.
 * @returns The G4 evaluation.
 */
export function evaluateG4(input: {
  readonly prototype_entries: number;
  readonly not_do_count: number;
  readonly user_confirmed: boolean;
}): GateResult {
  const reasons: GateReason[] = [];
  if (input.prototype_entries <= 0) {
    reasons.push({ code: 'embody/prototype-empty', detail: 'prototype/ 为空' });
  }
  if (input.not_do_count <= 0) {
    reasons.push({ code: 'embody/no-not-do-list', detail: 'usage.md 缺「不做」清单' });
  }
  if (!input.user_confirmed) {
    reasons.push({ code: 'embody/user-unconfirmed', detail: '用户未确认体现形式' });
  }
  return reasons.length === 0 ? pass('embody') : fail('embody', reasons);
}

/**
 * G5: decidable tasks need existing, green tests; judged tasks need a
 * rubric of at least three rules referencing a golden sample, plus a
 * held-out set.
 *
 * @param input Facts for the test exit.
 * @returns The G5 evaluation.
 */
export function evaluateG5(input: {
  readonly task_kind: TaskKind;
  readonly tests_exist: boolean;
  readonly tests_green: boolean;
  readonly rubric_count: number;
  readonly golden_referenced: boolean;
  readonly held_out: boolean;
}): GateResult {
  const reasons: GateReason[] = [];
  if (input.task_kind === 'decidable') {
    if (!input.tests_exist) {
      reasons.push({ code: 'test/tests-missing', detail: '测试文件不存在' });
    } else if (!input.tests_green) {
      reasons.push({ code: 'test/not-green', detail: '最近一次测试运行未全绿' });
    }
  } else {
    if (input.rubric_count < 3) {
      reasons.push({
        code: 'test/rubric-too-thin',
        detail: `rubric 只有 ${input.rubric_count} 条，至少需要 3 条`,
      });
    }
    if (!input.golden_referenced) {
      reasons.push({ code: 'test/no-golden-sample', detail: 'rubric 未引用金标准样例' });
    }
    if (!input.held_out) {
      reasons.push({ code: 'test/no-held-out', detail: '缺 held-out 集' });
    }
  }
  return reasons.length === 0 ? pass('test') : fail('test', reasons);
}

/**
 * G6: every plan item closed and no regression.
 *
 * @param input Facts for the build exit.
 * @returns The G6 evaluation.
 */
export function evaluateG6(input: {
  readonly open_plan_items: number;
  readonly regression_clean: boolean;
}): GateResult {
  const reasons: GateReason[] = [];
  if (input.open_plan_items > 0) {
    reasons.push({ code: 'build/plan-open', detail: `${input.open_plan_items} 个计划项未关闭` });
  }
  if (!input.regression_clean) {
    reasons.push({ code: 'build/regression-dirty', detail: '回归存在退化' });
  }
  return reasons.length === 0 ? pass('build') : fail('build', reasons);
}

/**
 * Evaluates the exit gate of one stage from caller-supplied facts. Pure:
 * no model calls and no file reads (decision D-06).
 *
 * @param input Parsed facts for the stage being exited.
 * @returns The gate evaluation for that stage.
 */
export function evaluateGate(input: GateInput): GateResult {
  switch (input.stage) {
    case 'elicit':
      return evaluateG1(input);
    case 'align':
      return evaluateG2(input);
    case 'analyze':
      return evaluateG3(input);
    case 'embody':
      return evaluateG4(input);
    case 'test':
      return evaluateG5(input);
    case 'build':
      return evaluateG6(input);
  }
}
