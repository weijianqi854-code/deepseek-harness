import { describe, expect, it } from 'vitest';
import { evaluateGate } from '../src/gates.ts';
import { abortStage, advance, initialStageState, rollback } from '../src/machine.ts';
import type { GateResult, SlotsFile, StageState } from '../src/types.ts';

const filledSlots: SlotsFile = {
  goal: { value: '每周自动生成并发送周报', source: 'user', rework_cost: 'high', filled: true },
  audience: {
    value: '内部团队',
    source: 'default',
    rework_cost: 'low',
    filled: true,
    disclosed: true,
  },
};

const t0 = '2026-01-01T00:00:00Z';
const t1 = '2026-01-01T00:01:00Z';
const t2 = '2026-01-01T00:02:00Z';

function atAlign(): StageState {
  const start = initialStageState(t0);
  const gate = evaluateGate({ stage: 'elicit', slots: filledSlots });
  const result = advance(start, gate, t1);
  if (!result.ok) throw new Error('fixture setup failed');
  return result.state;
}

describe('initialStageState', () => {
  it('starts at elicit with one open history row', () => {
    const state = initialStageState(t0);
    expect(state.stage).toBe('elicit');
    expect(state.checkpoint_seq).toBe(0);
    expect(state.history).toEqual([
      { stage: 'elicit', entered_at: t0, exited_at: null, gate_pass: null },
    ]);
  });
});

describe('advance', () => {
  it('refuses to advance a terminal stage', () => {
    const aborted = abortStage(initialStageState(t0), t1);
    const handCraftedGate: GateResult = { stage: 'aborted', pass: true, reasons: [] };
    const result = advance(aborted, handCraftedGate, t2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]?.code).toBe('advance/terminal');
  });

  it('rejects a gate evaluated for a different stage', () => {
    const start = initialStageState(t0);
    const wrongStageGate = evaluateGate({ stage: 'analyze', alternatives: null });
    const result = advance(start, wrongStageGate, t1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]?.code).toBe('advance/wrong-stage');
  });

  it('returns the unchanged state with reasons when the gate fails', () => {
    const start = initialStageState(t0);
    const failedGate = evaluateGate({ stage: 'elicit', slots: null });
    const result = advance(start, failedGate, t1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe(start);
      expect(result.reasons[0]?.code).toBe('slots/missing');
    }
  });

  it('moves to the next stage, closes the row, and bumps the checkpoint counter', () => {
    const start = initialStageState(t0);
    const gate = evaluateGate({ stage: 'elicit', slots: filledSlots });
    const result = advance(start, gate, t1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.stage).toBe('align');
    expect(result.state.checkpoint_seq).toBe(1);
    expect(result.state.history).toHaveLength(2);
    expect(result.state.history[0]).toEqual({
      stage: 'elicit',
      entered_at: t0,
      exited_at: t1,
      gate_pass: true,
    });
    expect(result.state.history[1]).toEqual({
      stage: 'align',
      entered_at: t1,
      exited_at: null,
      gate_pass: null,
    });
  });

  it('never mutates the input state', () => {
    const start = initialStageState(t0);
    const gate = evaluateGate({ stage: 'elicit', slots: filledSlots });
    advance(start, gate, t1);
    expect(start.stage).toBe('elicit');
    expect(start.history).toHaveLength(1);
    expect(start.history[0].exited_at).toBeNull();
  });
});

describe('rollback', () => {
  it('returns to an earlier stage and appends a history row', () => {
    const result = rollback(atAlign(), 'elicit', t2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.stage).toBe('elicit');
    expect(result.state.history).toHaveLength(3);
    expect(result.state.history[1].gate_pass).toBe(false);
    expect(result.state.history[2].stage).toBe('elicit');
  });

  it('rejects rollback to a later or terminal stage', () => {
    const state = atAlign();
    expect(rollback(state, 'test', t2).ok).toBe(false);
    expect(rollback(state, 'done', t2).ok).toBe(false);
  });

  it('rejects rollback to the current stage', () => {
    expect(rollback(atAlign(), 'align', t2).ok).toBe(false);
  });

  it('recovers out of aborted', () => {
    const aborted = abortStage(atAlign(), t1);
    const result = rollback(aborted, 'align', t2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.stage).toBe('align');
  });

  it('never removes history on rollback', () => {
    const state = atAlign();
    const result = rollback(state, 'elicit', t2);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.history.length).toBeGreaterThan(state.history.length);
  });
});

describe('abortStage', () => {
  it('marks the pipeline aborted and appends a terminal row', () => {
    const aborted = abortStage(atAlign(), t1);
    expect(aborted.stage).toBe('aborted');
    const last = aborted.history[aborted.history.length - 1];
    expect(last?.stage).toBe('aborted');
    expect(last?.gate_pass).toBeNull();
    expect(aborted.history[1].gate_pass).toBe(false);
  });

  it('is idempotent on an already-aborted state', () => {
    const aborted = abortStage(atAlign(), t1);
    expect(abortStage(aborted, t2)).toBe(aborted);
  });

  it('never mutates the input state', () => {
    const state = atAlign();
    abortStage(state, t1);
    expect(state.stage).toBe('align');
  });
});
