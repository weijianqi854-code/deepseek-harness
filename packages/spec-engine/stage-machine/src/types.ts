/**
 * Spec Engine stage-machine data model.
 *
 * Every JSON field name matches the published architecture contract
 * (spec-engine/docs/architecture.md §2) and is intentionally snake_case on
 * disk. Renaming a field here for TypeScript style breaks the contract.
 */

/** Pipeline stage. `done` and `aborted` are terminal. */
export type Stage =
  | 'elicit'
  | 'align'
  | 'analyze'
  | 'embody'
  | 'test'
  | 'build'
  | 'done'
  | 'aborted';

/** Origin of a slot value. */
export type SlotSource = 'user' | 'default' | 'inferred';

/** Cost class of discovering a slot was wrong after the fact. */
export type ReworkCost = 'high' | 'low';

/** One slot entry in slots.json; some keys hold a list of entries. */
export interface SlotEntry {
  readonly value: string;
  readonly source: SlotSource;
  readonly rework_cost: ReworkCost;
  readonly filled: boolean;
  /** True once the agent has told the user this default was assumed. */
  readonly disclosed?: boolean;
}

/** The slots.json document: slot objects or lists of slot objects. */
export type SlotsFile = Readonly<Record<string, SlotEntry | readonly SlotEntry[]>>;

/** Requirement kind in requirements.json. */
export type RequirementKind = 'functional' | 'constraint' | 'quality' | 'negative';

/** One requirement in requirements.json. */
export interface Requirement {
  readonly id: string;
  readonly statement: string;
  /** Verbatim quote from the user's own words; never paraphrased. */
  readonly source_quote: string;
  readonly kind: RequirementKind;
  /** Decidable acceptance predicate. */
  readonly acceptance: string;
  readonly status: 'active' | 'dropped';
  readonly dropped_reason: string | null;
}

/** Assumption in assumptions.json; `falsifier` is mandatory. */
export interface Assumption {
  readonly id: string;
  readonly claim: string;
  readonly confidence: 'high' | 'medium' | 'low';
  /** Evidence that would refute the claim; an assumption without one is invalid. */
  readonly falsifier: string;
  readonly status: 'open' | 'verified' | 'refuted';
}

/** Round-trip drift kinds (architecture §4.2). */
export type DriftKind =
  | 'missing'
  | 'hallucinated'
  | 'negation'
  | 'quantified'
  | 'term'
  | 'implicit';

/** Drift kinds that always block G2. */
export const BLOCKING_DRIFT_KINDS: readonly DriftKind[] = ['missing', 'hallucinated', 'negation'];

/** One drift finding in roundtrip.json. */
export interface Drift {
  readonly kind: DriftKind;
  readonly quote?: string;
  readonly requirement?: string;
  readonly detail: string;
  /** User adjudication for the three adjudication kinds; absent while pending. */
  readonly adjudicated?: boolean | null;
}

/** The roundtrip.json document. */
export interface RoundtripFile {
  readonly attempt: number;
  readonly verdict: 'pass' | 'fail';
  readonly restatement_path: string;
  readonly drift: readonly Drift[];
  /** Count of blocking-kind drift; G2 cross-checks it against the drift list. */
  readonly blocking: number;
}

/** One analyzed alternative in stage 3. */
export interface PlanAlternative {
  readonly name: string;
  /** Evidence locators: existing file paths or recorded tool calls. */
  readonly evidence: readonly string[];
  /** Set by the caller after verifying every locator resolves. */
  readonly evidence_verified?: boolean;
}

/** Stage-5 task classification. */
export type TaskKind = 'decidable' | 'judged';

/** Facts one gate evaluation needs; supplied parsed, never as files (D-06). */
export type GateInput =
  | { readonly stage: 'elicit'; readonly slots: SlotsFile | null }
  | {
      readonly stage: 'align';
      readonly roundtrip: RoundtripFile | null;
      readonly user_confirmed: boolean;
    }
  | { readonly stage: 'analyze'; readonly alternatives: readonly PlanAlternative[] | null }
  | {
      readonly stage: 'embody';
      readonly prototype_entries: number;
      readonly not_do_count: number;
      readonly user_confirmed: boolean;
    }
  | {
      readonly stage: 'test';
      readonly task_kind: TaskKind;
      readonly tests_exist: boolean;
      readonly tests_green: boolean;
      readonly rubric_count: number;
      readonly golden_referenced: boolean;
      readonly held_out: boolean;
    }
  | {
      readonly stage: 'build';
      readonly open_plan_items: number;
      readonly regression_clean: boolean;
    };

/** One structured gate failure. */
export interface GateReason {
  /** Stable machine-readable code; never shown raw to users. */
  readonly code: string;
  /** Human-readable detail in the workspace language. */
  readonly detail: string;
}

/** Gate evaluation outcome for one stage exit. */
export interface GateResult {
  /** The stage whose exit this gate guards. */
  readonly stage: Stage;
  readonly pass: boolean;
  readonly reasons: readonly GateReason[];
}

/** One history row in state.json. */
export interface StageHistoryEntry {
  readonly stage: Stage;
  /** ISO-8601; supplied by the caller, never read from a clock here. */
  readonly entered_at: string;
  readonly exited_at: string | null;
  /** True when exited via a passed gate; false when exited via rollback or abort; null while active. */
  readonly gate_pass: boolean | null;
}

/** The state.json document. Only the stage-machine service may write it. */
export interface StageState {
  readonly version: 1;
  readonly stage: Stage;
  readonly history: readonly StageHistoryEntry[];
  readonly open_questions: readonly string[];
  /** Number of the last checkpoint written; checkpoints are never removed. */
  readonly checkpoint_seq: number;
}
