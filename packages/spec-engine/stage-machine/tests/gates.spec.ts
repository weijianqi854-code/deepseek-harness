import { describe, expect, it } from 'vitest';
import { evaluateGate } from '../src/gates.ts';
import type { RoundtripFile, SlotsFile } from '../src/types.ts';

const filledSlots: SlotsFile = {
  goal: { value: '每周自动生成并发送周报', source: 'user', rework_cost: 'high', filled: true },
  audience: {
    value: '内部团队',
    source: 'default',
    rework_cost: 'low',
    filled: true,
    disclosed: true,
  },
  success_criteria: [
    { value: '周一 09:00 前送达', source: 'user', rework_cost: 'high', filled: true },
  ],
};

const cleanRoundtrip: RoundtripFile = {
  attempt: 1,
  verdict: 'pass',
  restatement_path: '.spec-engine/restatement.md',
  drift: [],
  blocking: 0,
};

describe('G1', () => {
  it('fails when slots.json is missing', () => {
    const result = evaluateGate({ stage: 'elicit', slots: null });
    expect(result.pass).toBe(false);
    expect(result.reasons[0]?.code).toBe('slots/missing');
  });

  it('fails on unfilled high-cost slots and undisclosed defaults', () => {
    const slots: SlotsFile = {
      goal: { value: '', source: 'user', rework_cost: 'high', filled: false },
      audience: { value: '内部团队', source: 'default', rework_cost: 'low', filled: true },
    };
    const result = evaluateGate({ stage: 'elicit', slots });
    expect(result.pass).toBe(false);
    const codes = result.reasons.map((reason) => reason.code);
    expect(codes).toContain('slots/high-cost-unfilled');
    expect(codes).toContain('slots/default-undisclosed');
  });

  it('passes when high-cost slots are filled and defaults disclosed', () => {
    expect(evaluateGate({ stage: 'elicit', slots: filledSlots }).pass).toBe(true);
  });
});

describe('G2', () => {
  it('fails when roundtrip.json is missing', () => {
    const result = evaluateGate({ stage: 'align', roundtrip: null, user_confirmed: true });
    expect(result.pass).toBe(false);
    expect(result.reasons[0]?.code).toBe('roundtrip/missing');
  });

  it('fails on a blocking drift even with everything else clean', () => {
    const result = evaluateGate({
      stage: 'align',
      roundtrip: {
        ...cleanRoundtrip,
        verdict: 'fail',
        blocking: 1,
        drift: [{ kind: 'missing', quote: '每周自动发一次', detail: '需求未体现周期性' }],
      },
      user_confirmed: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reasons[0]?.code).toBe('roundtrip/blocking-drift');
  });

  it('fails while a non-blocking drift awaits user adjudication', () => {
    const result = evaluateGate({
      stage: 'align',
      roundtrip: {
        ...cleanRoundtrip,
        verdict: 'fail',
        drift: [
          {
            kind: 'term',
            requirement: 'R-01',
            detail: '「客户」被写作「用户」',
            adjudicated: null,
          },
        ],
        blocking: 0,
      },
      user_confirmed: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reasons.some((reason) => reason.code === 'roundtrip/unadjudicated')).toBe(true);
  });

  it('passes an adjudicated non-blocking drift', () => {
    const result = evaluateGate({
      stage: 'align',
      roundtrip: {
        ...cleanRoundtrip,
        drift: [
          {
            kind: 'term',
            requirement: 'R-01',
            detail: '「客户」被写作「用户」',
            adjudicated: true,
          },
        ],
      },
      user_confirmed: true,
    });
    expect(result.pass).toBe(true);
  });

  it('self-checks the stored verdict against the drift list', () => {
    const result = evaluateGate({
      stage: 'align',
      roundtrip: { ...cleanRoundtrip, verdict: 'fail' },
      user_confirmed: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reasons.some((reason) => reason.code === 'roundtrip/verdict-mismatch')).toBe(true);
  });

  it('self-checks the stored blocking count against the drift list', () => {
    const result = evaluateGate({
      stage: 'align',
      roundtrip: { ...cleanRoundtrip, blocking: 2 },
      user_confirmed: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reasons.some((reason) => reason.code === 'roundtrip/blocking-mismatch')).toBe(true);
  });

  it('fails without explicit user confirmation', () => {
    const result = evaluateGate({
      stage: 'align',
      roundtrip: cleanRoundtrip,
      user_confirmed: false,
    });
    expect(result.reasons.some((reason) => reason.code === 'roundtrip/user-unconfirmed')).toBe(true);
  });

  it('passes when clean and confirmed', () => {
    expect(
      evaluateGate({ stage: 'align', roundtrip: cleanRoundtrip, user_confirmed: true }).pass,
    ).toBe(true);
  });
});

describe('G3', () => {
  const verified = { name: 'A', evidence: ['src/a.ts'], evidence_verified: true };

  it('fails without alternatives', () => {
    const result = evaluateGate({ stage: 'analyze', alternatives: null });
    expect(result.reasons[0]?.code).toBe('plan/missing');
  });

  it('demands at least two alternatives', () => {
    const result = evaluateGate({ stage: 'analyze', alternatives: [verified] });
    expect(result.pass).toBe(false);
    expect(result.reasons[0]?.code).toBe('plan/needs-two-alternatives');
  });

  it('rejects unverified evidence', () => {
    const result = evaluateGate({
      stage: 'analyze',
      alternatives: [verified, { name: 'B', evidence: ['log#12'] }],
    });
    expect(result.pass).toBe(false);
    expect(result.reasons.some((reason) => reason.code === 'plan/evidence-unverified')).toBe(true);
  });

  it('rejects an alternative with no evidence at all', () => {
    const result = evaluateGate({
      stage: 'analyze',
      alternatives: [verified, { name: 'B', evidence: [] }],
    });
    expect(result.reasons.some((reason) => reason.code === 'plan/evidence-missing')).toBe(true);
  });

  it('passes with two verified alternatives', () => {
    const result = evaluateGate({
      stage: 'analyze',
      alternatives: [
        verified,
        { name: 'B', evidence: ['log#12'], evidence_verified: true },
      ],
    });
    expect(result.pass).toBe(true);
  });
});

describe('G4', () => {
  it('fails on an empty prototype', () => {
    const result = evaluateGate({
      stage: 'embody',
      prototype_entries: 0,
      not_do_count: 3,
      user_confirmed: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reasons[0]?.code).toBe('embody/prototype-empty');
  });

  it('fails on a missing not-do list', () => {
    const result = evaluateGate({
      stage: 'embody',
      prototype_entries: 2,
      not_do_count: 0,
      user_confirmed: true,
    });
    expect(result.reasons.some((reason) => reason.code === 'embody/no-not-do-list')).toBe(true);
  });

  it('fails without user confirmation', () => {
    const result = evaluateGate({
      stage: 'embody',
      prototype_entries: 2,
      not_do_count: 1,
      user_confirmed: false,
    });
    expect(result.reasons.some((reason) => reason.code === 'embody/user-unconfirmed')).toBe(true);
  });

  it('passes with a prototype, a not-do list, and confirmation', () => {
    const result = evaluateGate({
      stage: 'embody',
      prototype_entries: 2,
      not_do_count: 1,
      user_confirmed: true,
    });
    expect(result.pass).toBe(true);
  });
});

describe('G5', () => {
  it('fails when a judged-task rubric is thinner than three rules', () => {
    const result = evaluateGate({
      stage: 'test',
      task_kind: 'judged',
      tests_exist: false,
      tests_green: false,
      rubric_count: 2,
      golden_referenced: true,
      held_out: true,
    });
    expect(result.pass).toBe(false);
    expect(result.reasons[0]?.code).toBe('test/rubric-too-thin');
  });

  it('fails when a judged task references no golden sample', () => {
    const result = evaluateGate({
      stage: 'test',
      task_kind: 'judged',
      tests_exist: false,
      tests_green: false,
      rubric_count: 3,
      golden_referenced: false,
      held_out: true,
    });
    expect(result.reasons.some((reason) => reason.code === 'test/no-golden-sample')).toBe(true);
  });

  it('fails when a judged task has no held-out set', () => {
    const result = evaluateGate({
      stage: 'test',
      task_kind: 'judged',
      tests_exist: false,
      tests_green: false,
      rubric_count: 3,
      golden_referenced: true,
      held_out: false,
    });
    expect(result.reasons.some((reason) => reason.code === 'test/no-held-out')).toBe(true);
  });

  it('fails when a decidable task has no test files', () => {
    const result = evaluateGate({
      stage: 'test',
      task_kind: 'decidable',
      tests_exist: false,
      tests_green: false,
      rubric_count: 0,
      golden_referenced: false,
      held_out: false,
    });
    expect(result.reasons[0]?.code).toBe('test/tests-missing');
  });

  it('fails when a decidable task is not green', () => {
    const result = evaluateGate({
      stage: 'test',
      task_kind: 'decidable',
      tests_exist: true,
      tests_green: false,
      rubric_count: 0,
      golden_referenced: false,
      held_out: false,
    });
    expect(result.reasons[0]?.code).toBe('test/not-green');
  });

  it('passes a decidable task with green tests', () => {
    const result = evaluateGate({
      stage: 'test',
      task_kind: 'decidable',
      tests_exist: true,
      tests_green: true,
      rubric_count: 0,
      golden_referenced: false,
      held_out: false,
    });
    expect(result.pass).toBe(true);
  });
});

describe('G6', () => {
  it('fails while plan items remain open', () => {
    const result = evaluateGate({ stage: 'build', open_plan_items: 1, regression_clean: true });
    expect(result.pass).toBe(false);
    expect(result.reasons[0]?.code).toBe('build/plan-open');
  });

  it('fails when regression is dirty', () => {
    const result = evaluateGate({ stage: 'build', open_plan_items: 0, regression_clean: false });
    expect(result.reasons[0]?.code).toBe('build/regression-dirty');
  });

  it('passes with a closed plan and clean regression', () => {
    expect(
      evaluateGate({ stage: 'build', open_plan_items: 0, regression_clean: true }).pass,
    ).toBe(true);
  });
});
