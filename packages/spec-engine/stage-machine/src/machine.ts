import type {
  GateReason,
  GateResult,
  Stage,
  StageHistoryEntry,
  StageState,
} from './types.ts';

/** Next stage from each stage; terminal stages map to null (architecture §3.1). */
const NEXT_STAGE: Readonly<Record<Stage, Stage | null>> = {
  elicit: 'align',
  align: 'analyze',
  analyze: 'embody',
  embody: 'test',
  test: 'build',
  build: 'done',
  done: null,
  aborted: null,
};

/** Dependency order used to validate rollback targets. */
const STAGE_ORDER: Readonly<Record<Stage, number>> = {
  elicit: 0,
  align: 1,
  analyze: 2,
  embody: 3,
  test: 4,
  build: 5,
  done: 6,
  aborted: 6,
};

/**
 * Creates the initial state for a fresh workspace at stage `elicit`.
 *
 * @param now ISO-8601 timestamp supplied by the caller; never read here.
 * @returns The initial state document.
 */
export function initialStageState(now: string): StageState {
  return {
    version: 1,
    stage: 'elicit',
    history: [{ stage: 'elicit', entered_at: now, exited_at: null, gate_pass: null }],
    open_questions: [],
    checkpoint_seq: 0,
  };
}

/** Advance outcome: success carries the new state; failure the unchanged one. */
export type AdvanceResult =
  | { readonly ok: true; readonly state: StageState }
  | { readonly ok: false; readonly state: StageState; readonly reasons: readonly GateReason[] };

/**
 * Applies a gate result, moving the pipeline to the next stage. On failure
 * the input state is returned unchanged with the gate's reasons.
 *
 * @param state Current state document; never mutated.
 * @param gate Gate result evaluated for `state.stage` by the caller.
 * @param now ISO-8601 timestamp supplied by the caller.
 * @returns The advanced state, or the unchanged state with failure reasons.
 */
export function advance(state: StageState, gate: GateResult, now: string): AdvanceResult {
  if (NEXT_STAGE[state.stage] === null) {
    return {
      ok: false,
      state,
      reasons: [{ code: 'advance/terminal', detail: `阶段 ${state.stage} 是终态` }],
    };
  }
  if (gate.stage !== state.stage) {
    return {
      ok: false,
      state,
      reasons: [
        {
          code: 'advance/wrong-stage',
          detail: `gate 属于 ${gate.stage}，当前阶段是 ${state.stage}`,
        },
      ],
    };
  }
  if (!gate.pass) {
    return { ok: false, state, reasons: gate.reasons };
  }
  const next = NEXT_STAGE[state.stage];
  if (next === null) {
    return {
      ok: false,
      state,
      reasons: [{ code: 'advance/terminal', detail: `阶段 ${state.stage} 是终态` }],
    };
  }
  const history: StageHistoryEntry[] = state.history.map((entry, index) =>
    index === state.history.length - 1 ? { ...entry, exited_at: now, gate_pass: true } : entry,
  );
  history.push({ stage: next, entered_at: now, exited_at: null, gate_pass: null });
  return {
    ok: true,
    state: { ...state, stage: next, history, checkpoint_seq: state.checkpoint_seq + 1 },
  };
}

/**
 * Rolls the pipeline back to an earlier, non-terminal stage, appending a
 * history row; old checkpoints are never removed (architecture §3.1).
 *
 * @param state Current state document; never mutated.
 * @param target An earlier, non-terminal stage.
 * @param now ISO-8601 timestamp supplied by the caller.
 * @returns The rolled-back state, or the unchanged state with failure reasons.
 */
export function rollback(state: StageState, target: Stage, now: string): AdvanceResult {
  if (
    target !== 'done' &&
    target !== 'aborted' &&
    STAGE_ORDER[target] < STAGE_ORDER[state.stage]
  ) {
    const history: StageHistoryEntry[] = state.history.map((entry, index) =>
      index === state.history.length - 1 ? { ...entry, exited_at: now, gate_pass: false } : entry,
    );
    history.push({ stage: target, entered_at: now, exited_at: null, gate_pass: null });
    return { ok: true, state: { ...state, stage: target, history } };
  }
  return {
    ok: false,
    state,
    reasons: [
      {
        code: 'rollback/invalid-target',
        detail: `不能回退到 ${target}（当前 ${state.stage}）`,
      },
    ],
  };
}

/**
 * Marks the pipeline aborted. All checkpoints remain on disk and recovery
 * is a rollback to any earlier stage.
 *
 * @param state Current state document; never mutated.
 * @param now ISO-8601 timestamp supplied by the caller.
 * @returns The aborted state, or the same state when already aborted.
 */
export function abortStage(state: StageState, now: string): StageState {
  if (state.stage === 'aborted') return state;
  const history: StageHistoryEntry[] = state.history.map((entry, index) =>
    index === state.history.length - 1 ? { ...entry, exited_at: now, gate_pass: false } : entry,
  );
  history.push({ stage: 'aborted', entered_at: now, exited_at: null, gate_pass: null });
  return { ...state, stage: 'aborted', history };
}
