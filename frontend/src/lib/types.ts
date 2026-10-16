// Mirrors backend/app/schemas.py. Keep field names and defaults in sync.
// Datetimes arrive as ISO 8601 strings.

export type ISODate = string;
export type Severity = 'low' | 'medium' | 'high';

// ---------- Knowledge base ----------

export interface Document {
  id: string;
  title: string;
  filename?: string | null;
  mime?: string | null;
  chunk_count: number;
  created_at: ISODate;
}

export interface Chunk {
  id: string;
  document_id: string;
  index: number;
  text: string;
}

export interface SearchHit {
  chunk: Chunk;
  document_title: string;
  score: number;
}

export interface Citation {
  chunk_id: string;
  document_title: string;
  quote: string;
  /** Which attribute this backs, e.g. "objection:obj-2", "hidden_need:0", "rule:CC-01", "rubric:discovery". */
  supports?: string | null;
}

// ---------- Persona ----------

export interface Objection {
  id: string;
  text: string;
  /** When the customer raises it, e.g. "when price is mentioned". */
  trigger: string;
}

export type KnowledgeLevel = 'novice' | 'intermediate' | 'expert';
export type PersonaSource = 'brief' | 'documents' | 'manual' | 'seed';
export type PersonaStatus = 'draft' | 'approved';

export interface Persona {
  id: string;
  name: string;
  title: string;
  age?: number | null;
  industry?: string | null;
  locale: string;
  summary: string;
  personality: string[];
  communication_style: string;
  goals: string[];
  hidden_needs: string[];
  objections: Objection[];
  knowledge_level: KnowledgeLevel;
  difficulty: number;
  initial_trust: number;
  initial_patience: number;
  /** Served verbatim as the customer's first turn; no model call. */
  opening_line: string;
  voice?: string | null;
  avatar?: string | null;
  source: PersonaSource;
  source_document_ids: string[];
  /** KB passages the generated attributes are derived from. */
  citations: Citation[];
  status: PersonaStatus;
  created_at: ISODate;
}

// ---------- Scenario ----------

export interface ComplianceRule {
  id: string;
  rule: string;
  severity: Severity;
  citations: Citation[];
}

export interface RubricItem {
  id: string;
  name: string;
  description: string;
  weight: number;
}

export interface BranchEvent {
  id: string;
  /** e.g. "turn >= 4" or "trust < 30" */
  trigger: string;
  /** What the customer does, e.g. "mentions a cheaper competitor" */
  event: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  persona_id: string;
  trainee_goal: string;
  context: string;
  success_criteria: string[];
  compliance_rules: ComplianceRule[];
  rubric: RubricItem[];
  branch_events: BranchEvent[];
  document_ids: string[];
  difficulty: number;
  max_turns: number;
  /** Overrides persona.opening_line when set. */
  opening_line?: string | null;
  created_at: ISODate;
}

// ---------- Session ----------

export interface ComplianceFlag {
  rule_id: string;
  severity: Severity;
  message: string;
  /** Exact words from the message that triggered the flag. */
  quote: string;
}

export interface CoachHint {
  hint: string;
  technique?: string | null;
  citations: Citation[];
}

export type TurnRole = 'trainee' | 'customer';

export interface Turn {
  index: number;
  role: TurnRole;
  text: string;
  at: ISODate;
  citations: Citation[];
  compliance: ComplianceFlag[];
  coach?: CoachHint | null;
  trust?: number | null;
  patience?: number | null;
}

export type SessionStatus = 'active' | 'ended';

export interface Session {
  id: string;
  scenario_id: string;
  persona_id: string;
  status: SessionStatus;
  turns: Turn[];
  trust: number;
  patience: number;
  started_at: ISODate;
  ended_at?: ISODate | null;
}

// ---------- Report ----------

export interface Evidence {
  turn_index: number;
  quote: string;
  verified: boolean;
}

export interface DimensionScore {
  rubric_id: string;
  name: string;
  score: number;
  feedback: string;
  evidence: Evidence[];
}

export interface Report {
  session_id: string;
  overall_score: number;
  /** False if any high-severity violation; gates certification. */
  compliance_passed: boolean;
  summary: string;
  dimensions: DimensionScore[];
  compliance_violations: ComplianceFlag[];
  strengths: string[];
  improvements: string[];
  knowledge_citations: Citation[];
  created_at: ISODate;
}

// ---------- Dashboard ----------

export interface DimensionAverage {
  name: string;
  average: number;
}

export interface ViolationCount {
  rule_id: string;
  message: string;
  count: number;
}

export interface SessionSummary {
  id: string;
  scenario_title: string;
  persona_name: string;
  overall_score: number | null;
  compliance_passed?: boolean | null;
  started_at: ISODate;
}

export interface Dashboard {
  sessions_count: number;
  average_score: number | null;
  by_dimension: DimensionAverage[];
  top_violations: ViolationCount[];
  recent_sessions: SessionSummary[];
  /** Ended sessions with compliance_passed and overall_score >= 80. */
  ready_count: number;
  /** How many of the counted sessions are labeled sample team data (their ids start with `sample-`). */
  sample_sessions_count?: number;
}

// ---------- Request bodies ----------

export interface GeneratePersonaRequest {
  brief: string;
  document_ids?: string[];
  locale?: string;
}

export interface GeneratePersonasFromDocsRequest {
  document_ids?: string[];
  count?: number;
  locale?: string;
}

export interface GenerateScenarioRequest {
  persona_id: string;
  trainee_goal: string;
  document_ids?: string[];
}

export interface StateEventData {
  trust: number;
  patience: number;
  trust_delta?: number;
  patience_delta?: number;
  /** Short explanation of why the meters moved. */
  reason?: string;
}

// ---------- SSE events for POST /api/sessions/{id}/turns ----------

export type TurnEvent =
  | { event: 'compliance_pre'; data: { flags: ComplianceFlag[] } }
  | { event: 'customer_delta'; data: { text: string } }
  | { event: 'customer_done'; data: { turn: Turn } }
  /** Ungrounded product claims in the customer's reply (rule_id "GROUNDING"). Order vs state/coach is not fixed. */
  | { event: 'compliance_post'; data: { flags: ComplianceFlag[] } }
  | { event: 'state'; data: StateEventData }
  | { event: 'coach'; data: { hint: CoachHint } }
  | { event: 'done'; data: { session_status: SessionStatus; /** Server-side offsets (ms from turn start) at which each step finished, e.g. {kb, first_delta, reply, compliance_post, state, coach, total}. */ timing_ms?: Record<string, number> } }
  | { event: 'error'; data: { detail: string; /** HTTP status when the stream could not start (client-side only). */ status?: number } };

export type TurnEventName = TurnEvent['event'];
