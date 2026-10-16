import type { Chunk, Citation, CoachHint, ComplianceFlag, Document, Persona, Report, Scenario, Session } from '../types';

export type ChunkLike = Chunk;

export interface MockState {
  documents: Document[];
  chunks: Chunk[];
  personas: Persona[];
  scenarios: Scenario[];
  sessions: Session[];
  reports: Report[];
}

export interface ReplyRule {
  match: RegExp;
  reply: string;
  citations?: Citation[];
  trust: number;
  patience: number;
  coach?: CoachHint;
  reason?: string;
  /** Simulated grounding post-check flags on the customer's reply. */
  post?: ComplianceFlag[];
}
