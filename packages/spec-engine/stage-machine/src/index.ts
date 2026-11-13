/**
 * @spec-engine/stage-machine — ordered stage graph, copy-on-write state,
 * and the G1-G6 gate pure functions. Zero dependencies, no IO.
 */
export type {
  Assumption,
  Drift,
  DriftKind,
  GateInput,
  GateReason,
  GateResult,
  PlanAlternative,
  Requirement,
  RequirementKind,
  ReworkCost,
  RoundtripFile,
  SlotEntry,
  SlotSource,
  SlotsFile,
  Stage,
  StageHistoryEntry,
  StageState,
  TaskKind,
} from './types.ts';
export { BLOCKING_DRIFT_KINDS } from './types.ts';
export {
  evaluateG1,
  evaluateG2,
  evaluateG3,
  evaluateG4,
  evaluateG5,
  evaluateG6,
  evaluateGate,
  iterSlotEntries,
} from './gates.ts';
export { abortStage, advance, initialStageState, rollback } from './machine.ts';
export type { AdvanceResult } from './machine.ts';
