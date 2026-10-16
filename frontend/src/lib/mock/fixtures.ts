// Demo fixtures for NEXT_PUBLIC_MOCK=true. Content follows docs/DEMO_SCRIPT.md.
import type { Chunk, Citation, Document, Persona, Report, Scenario, Session } from '../types';

const daysAgo = (d: number, h = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(h, 0, 0, 0);
  return date.toISOString();
};

// ---------- Knowledge base ----------

interface SeedDoc {
  doc: Omit<Document, 'chunk_count'>;
  chunks: string[];
}

const seedDocs: SeedDoc[] = [
  {
    doc: { id: 'doc_acme', title: 'Acme Analytics product sheet', filename: 'acme-product-sheet.pdf', mime: 'application/pdf', created_at: daysAgo(9) },
    chunks: [
      'Acme Analytics Pro plan costs USD 49 per user per month, billed annually. Volume discounts start at 150 seats.',
      'Every new customer can run a 30-day free pilot with up to 20 users before signing a contract. Pilot data carries over.',
      'Acme Analytics is SOC 2 Type II certified and offers a 99.9% uptime SLA with service credits.',
      'Customer success: every Pro account gets an onboarding manager and weekly adoption reports for the first 90 days.',
    ],
  },
  {
    doc: { id: 'doc_playbook', title: 'Sales playbook', filename: 'sales-playbook.md', mime: 'text/markdown', created_at: daysAgo(9) },
    chunks: [
      'Objection handling follows four steps: acknowledge, clarify, respond with value, confirm. Never answer an objection before you understand it.',
      'Discovery: ask open questions about past attempts and failures. The stated objection is often not the real concern.',
      'Closing: propose a concrete, low-risk next step with a date and named participants.',
    ],
  },
  {
    doc: { id: 'doc_rsp', title: 'Retirement Savings Plan brochure', filename: 'rsp-brochure.pdf', mime: 'application/pdf', created_at: daysAgo(8) },
    chunks: [
      'The Retirement Savings Plan is a variable, investment-linked plan. Its historical average annual return is 5.2%.',
      'Past performance is not indicative of future results. The value of the plan can go down as well as up.',
      'Every policy has a 15-day free-look period. The customer may cancel for a full refund of premiums within 15 days.',
      'Partial withdrawals are allowed after year 2 and may incur a surrender charge of up to 3%.',
    ],
  },
  {
    doc: { id: 'doc_coc', title: 'Code of Conduct', filename: 'code-of-conduct.md', mime: 'text/markdown', created_at: daysAgo(8) },
    chunks: [
      'CC-01: Never promise or imply guaranteed returns on investment-linked products.',
      'CC-02: Always disclose that the value of investments can go down as well as up.',
      'CC-03: Do not pressure the customer to decide in the same meeting.',
    ],
  },
  {
    doc: { id: 'doc_refund', title: 'Refund & Returns Policy', filename: 'refund-policy.txt', mime: 'text/plain', created_at: daysAgo(6) },
    chunks: [
      'Refunds are issued within 30 days of purchase with a receipt.',
      'Outside 30 days, store credit may be offered at the manager’s discretion. Cash refunds are not allowed.',
      'Escalate to a supervisor if the customer requests it or after two failed resolution attempts.',
    ],
  },
  {
    doc: { id: 'doc_tone', title: 'Support tone guide', filename: 'support-tone.md', mime: 'text/markdown', created_at: daysAgo(6) },
    chunks: [
      'Acknowledge the customer’s emotion before explaining policy. Never tell a customer to calm down.',
      'State what you can do, not what you cannot. Give a clear time frame for the next step.',
    ],
  },
];

export const seedChunks: Chunk[] = seedDocs.flatMap(({ doc, chunks }) =>
  chunks.map((text, index) => ({ id: `${doc.id}_c${index + 1}`, document_id: doc.id, index, text })),
);

export const seedDocuments: Document[] = seedDocs.map(({ doc, chunks }) => ({ ...doc, chunk_count: chunks.length }));

export function cite(chunkId: string, quote?: string, supports?: string): Citation {
  const chunk = seedChunks.find((c) => c.id === chunkId);
  const doc = seedDocuments.find((d) => d.id === chunk?.document_id);
  return { chunk_id: chunkId, document_title: doc?.title ?? 'Unknown document', quote: quote ?? chunk?.text ?? '', supports: supports ?? null };
}

// ---------- Personas ----------

const personaBase = {
  locale: 'en-US',
  voice: null,
  avatar: null,
  source: 'seed' as const,
  status: 'approved' as const,
};

export const seedPersonas: Persona[] = [
  {
    ...personaBase,
    id: 'p_dana',
    name: 'Dana Kim',
    title: 'CFO of a 200-person logistics company',
    age: 47,
    industry: 'Logistics',
    summary: 'Busy, numbers-driven finance leader evaluating analytics vendors after a failed rollout last year.',
    personality: ['direct', 'skeptical', 'time-pressed', 'analytical'],
    communication_style: 'Short sentences. Interrupts vague answers and asks for numbers.',
    goals: ['Cut reporting time for regional managers', 'Avoid another wasted software budget'],
    hidden_needs: ['A previous analytics tool was abandoned after 3 months; adoption risk, not price, is the real concern'],
    objections: [
      { id: 'o1', text: 'Your quote is 30% higher than the tool we tried last year.', trigger: 'at the start' },
      { id: 'o2', text: 'How do I know my team will actually use it?', trigger: 'when features are pitched' },
      { id: 'o3', text: 'Is our shipment data secure with you?', trigger: 'after a pilot is proposed' },
    ],
    knowledge_level: 'expert',
    difficulty: 3,
    initial_trust: 35,
    initial_patience: 60,
    opening_line: 'I have ten minutes. Your quote is 30% higher than the tool we tried last year. Why should I pay more?',
    source_document_ids: ['doc_acme', 'doc_playbook'],
    citations: [cite('doc_acme_c1', undefined, 'objection:o1'), cite('doc_playbook_c2', undefined, 'hidden_need:0'), cite('doc_acme_c3', undefined, 'objection:o3')],
    created_at: daysAgo(9),
  },
  {
    ...personaBase,
    id: 'p_tan',
    name: 'Mr. Tan',
    title: 'Recently retired school principal',
    age: 63,
    industry: 'Retail banking / insurance',
    summary: 'Cautious retiree whose son urged him to invest his retirement savings. Wants safety above all.',
    personality: ['cautious', 'polite', 'risk-averse', 'family-oriented'],
    communication_style: 'Speaks slowly, asks for reassurance, repeats key questions.',
    goals: ['Keep his savings safe', 'Earn a little more than a fixed deposit'],
    hidden_needs: ['His savings must cover his wife’s medical costs; he needs access to cash at short notice'],
    objections: [
      { id: 'o1', text: 'Can you promise I won’t lose any of it?', trigger: 'at the start' },
      { id: 'o2', text: 'What if I need the money suddenly?', trigger: 'when risk is disclosed honestly' },
    ],
    knowledge_level: 'novice',
    difficulty: 3,
    initial_trust: 40,
    initial_patience: 75,
    opening_line: 'My son said I should invest my retirement money. Can you promise I won’t lose any of it?',
    source_document_ids: ['doc_rsp', 'doc_coc'],
    citations: [cite('doc_rsp_c2', undefined, 'objection:o1'), cite('doc_rsp_c4', undefined, 'hidden_need:0'), cite('doc_rsp_c4', undefined, 'objection:o2')],
    created_at: daysAgo(8),
  },
  {
    ...personaBase,
    id: 'p_alex',
    name: 'Alex Morgan',
    title: 'Upset retail customer',
    age: 29,
    industry: 'Consumer electronics retail',
    summary: 'Bought premium headphones that broke on day 41. Angry and wants cash back immediately.',
    personality: ['frustrated', 'impatient', 'proud'],
    communication_style: 'Raised voice, short demands, escalates when dismissed.',
    goals: ['Get a working pair of headphones or money back'],
    hidden_needs: ['The headphones were a gift for their dad and Alex feels embarrassed'],
    objections: [
      { id: 'o1', text: 'I want my money back. Now.', trigger: 'at the start' },
      { id: 'o2', text: 'I want to talk to your manager.', trigger: 'when told to calm down' },
    ],
    knowledge_level: 'intermediate',
    difficulty: 2,
    initial_trust: 25,
    initial_patience: 45,
    opening_line: 'These headphones died after a month and a bit. I want my money back. Now.',
    source_document_ids: ['doc_refund', 'doc_tone'],
    citations: [cite('doc_refund_c2', undefined, 'objection:o1')],
    created_at: daysAgo(6),
  },
];

// ---------- Scenarios ----------

const rubric = (...items: [string, string, string, number?][]) =>
  items.map(([id, name, description, weight]) => ({ id, name, description, weight: weight ?? 1 }));

export const seedScenarios: Scenario[] = [
  {
    id: 's_saas',
    title: 'Pricing objection from a skeptical CFO',
    description: 'B2B SaaS renewal call. The CFO pushes back on price; the real concern is adoption.',
    persona_id: 'p_dana',
    trainee_goal: 'Uncover the real concern and agree on a concrete next step.',
    context: 'Second call. The CFO has the quote and ten minutes.',
    success_criteria: ['Asks about the failed previous tool', 'Proposes the 30-day pilot', 'Secures a dated next step'],
    compliance_rules: [
      { id: 'SP-01', rule: 'Do not quote discounts that are not in the price book.', severity: 'medium', citations: [cite('doc_acme_c1')] },
    ],
    rubric: rubric(
      ['discovery', 'Discovery', 'Asks open questions that surface the real concern.'],
      ['objection', 'Objection handling', 'Acknowledges and clarifies before responding.'],
      ['accuracy', 'Product accuracy', 'Every claim matches the product sheet.'],
      ['closing', 'Closing', 'Proposes a concrete, low-risk next step.'],
    ),
    branch_events: [
      { id: 'b1', trigger: 'turn >= 4', event: 'mentions a cheaper competitor' },
      { id: 'b2', trigger: 'patience < 30', event: 'says they have to jump to another meeting' },
    ],
    document_ids: ['doc_acme', 'doc_playbook'],
    difficulty: 3,
    max_turns: 10,
    opening_line: null,
    created_at: daysAgo(9),
  },
  {
    id: 's_insurance',
    title: 'Retirement plan with a cautious retiree',
    description: 'Investment-linked insurance advice. Tests compliant disclosure under pressure to reassure.',
    persona_id: 'p_tan',
    trainee_goal: 'Explain the plan honestly, uncover his real need and stay within the Code of Conduct.',
    context: 'First meeting at the branch. His son booked the appointment.',
    success_criteria: ['Discloses risk (CC-02)', 'No guaranteed-return claims', 'Uncovers the medical-cost need'],
    compliance_rules: [
      { id: 'CC-01', rule: 'Never promise or imply guaranteed returns on investment-linked products.', severity: 'high', citations: [cite('doc_coc_c1')] },
      { id: 'CC-02', rule: 'Always disclose that the value of investments can go down as well as up.', severity: 'high', citations: [cite('doc_coc_c2')] },
      { id: 'CC-03', rule: 'Do not pressure the customer to decide in the same meeting.', severity: 'medium', citations: [cite('doc_coc_c3')] },
    ],
    rubric: rubric(
      ['compliance', 'Compliance', 'Follows CC-01 to CC-03 in every statement.', 1.5],
      ['accuracy', 'Product accuracy', 'Figures and terms match the brochure.'],
      ['empathy', 'Empathy', 'Recognises the customer’s worries and responds to them.'],
      ['discovery', 'Needs discovery', 'Surfaces liquidity and family needs before recommending.'],
    ),
    branch_events: [{ id: 'b1', trigger: 'trust >= 60', event: 'mentions his wife’s medical costs' }],
    document_ids: ['doc_rsp', 'doc_coc'],
    difficulty: 3,
    max_turns: 10,
    opening_line: null,
    created_at: daysAgo(8),
  },
  {
    id: 's_support',
    title: 'Refund request outside policy',
    description: 'Customer support escalation. An angry customer wants a cash refund on day 41.',
    persona_id: 'p_alex',
    trainee_goal: 'De-escalate, stay within the refund policy and offer a workable resolution.',
    context: 'In-store service desk on a busy Saturday.',
    success_criteria: ['Acknowledges emotion first', 'States policy accurately', 'Offers store credit or escalation'],
    compliance_rules: [
      { id: 'REF-01', rule: 'Cash refunds only within 30 days with a receipt.', severity: 'medium', citations: [cite('doc_refund_c1')] },
    ],
    rubric: rubric(
      ['empathy', 'Empathy', 'Acknowledges emotion before policy.'],
      ['policy', 'Policy accuracy', 'Offers only what the refund policy allows.'],
      ['deescalation', 'De-escalation', 'Lowers tension and gives a clear next step with a time frame.'],
    ),
    branch_events: [{ id: 'b1', trigger: 'trust < 15', event: 'demands to speak to a manager' }],
    document_ids: ['doc_refund', 'doc_tone'],
    difficulty: 2,
    max_turns: 8,
    opening_line: null,
    created_at: daysAgo(6),
  },
];

// ---------- Completed sessions (history for reports + dashboard) ----------

const flagCC01 = {
  rule_id: 'CC-01',
  severity: 'high' as const,
  message: 'Promises a guaranteed return on an investment-linked product.',
  quote: 'guarantees you 8% a year',
};

export const seedSessions: Session[] = [
  {
    id: 'sess_demo',
    scenario_id: 's_insurance',
    persona_id: 'p_tan',
    status: 'ended',
    trust: 62,
    patience: 58,
    started_at: daysAgo(1, 14),
    ended_at: daysAgo(1, 15),
    turns: [
      { index: 0, role: 'customer', text: seedPersonas[1].opening_line, at: daysAgo(1, 14), citations: [], compliance: [], trust: 40, patience: 75 },
      { index: 1, role: 'trainee', text: 'Don’t worry, this plan guarantees you 8% a year.', at: daysAgo(1, 14), citations: [], compliance: [flagCC01] },
      {
        index: 2,
        role: 'customer',
        text: 'Eight percent, guaranteed? My son warned me about promises like that. Is that written down somewhere?',
        at: daysAgo(1, 14),
        citations: [],
        compliance: [],
        coach: {
          hint: 'Withdraw the guarantee now. Give the historical average and say returns can go down as well as up.',
          technique: 'Correct and disclose',
          citations: [cite('doc_coc_c1'), cite('doc_rsp_c2')],
        },
        trust: 30,
        patience: 68,
      },
      {
        index: 3,
        role: 'trainee',
        text: 'I can’t promise that. Historically the plan has averaged 5.2%, but past performance doesn’t guarantee future results, and the value can go down as well as up.',
        at: daysAgo(1, 14),
        citations: [],
        compliance: [],
      },
      {
        index: 4,
        role: 'customer',
        text: 'Thank you for being honest with me. But what happens if I need the money suddenly, for medical bills?',
        at: daysAgo(1, 14),
        citations: [cite('doc_rsp_c1', 'historical average annual return is 5.2%'), cite('doc_rsp_c2', 'The value of the plan can go down as well as up.')],
        compliance: [],
        coach: { hint: 'Liquidity matters to him. Ask what the money is for and when he might need it.', technique: 'Open question', citations: [cite('doc_playbook_c2')] },
        trust: 48,
        patience: 64,
      },
      { index: 5, role: 'trainee', text: 'That’s an important point. May I ask what you’d need that money for, and when?', at: daysAgo(1, 14), citations: [], compliance: [] },
      {
        index: 6,
        role: 'customer',
        text: 'My wife has a heart condition. If something happens, I must pay the hospital quickly. That is what really worries me.',
        at: daysAgo(1, 14),
        citations: [],
        compliance: [],
        coach: {
          hint: 'Check whether this plan suits his liquidity needs, and mention the 15-day free-look period.',
          technique: 'Suitability check',
          citations: [cite('doc_rsp_c3'), cite('doc_rsp_c4')],
        },
        trust: 62,
        patience: 58,
      },
    ],
  },
];

export const seedReports: Report[] = [
  {
    session_id: 'sess_demo',
    overall_score: 58,
    compliance_passed: false,
    summary:
      'Strong recovery after a serious early mistake. You corrected the guaranteed-return claim, disclosed risk accurately and uncovered Mr. Tan’s real need. The CC-01 violation fails the compliance gate, so the score is capped.',
    dimensions: [
      {
        rubric_id: 'compliance',
        name: 'Compliance',
        score: 25,
        feedback: 'Promising a guaranteed 8% return breaches CC-01. The later correction helps, but the claim was already made.',
        evidence: [{ turn_index: 1, quote: 'this plan guarantees you 8% a year', verified: true }],
      },
      {
        rubric_id: 'accuracy',
        name: 'Product accuracy',
        score: 86,
        feedback: 'The 5.2% historical figure and the risk disclosure match the brochure exactly.',
        evidence: [{ turn_index: 3, quote: 'Historically the plan has averaged 5.2%', verified: true }],
      },
      {
        rubric_id: 'empathy',
        name: 'Empathy',
        score: 78,
        feedback: 'You treated his question as important instead of rushing past it.',
        evidence: [{ turn_index: 5, quote: 'That’s an important point.', verified: true }],
      },
      {
        rubric_id: 'discovery',
        name: 'Needs discovery',
        score: 82,
        feedback: 'An open question surfaced the medical-cost concern. Ask it earlier next time.',
        evidence: [
          { turn_index: 5, quote: 'May I ask what you’d need that money for, and when?', verified: true },
          { turn_index: 3, quote: 'I will find the best fund for you', verified: false },
        ],
      },
    ],
    compliance_violations: [flagCC01],
    strengths: ['Corrected a misstatement immediately and honestly', 'Accurate figures from the brochure', 'Open question uncovered the hidden need'],
    improvements: [
      'Never answer "can you promise" with a promise; lead with the risk disclosure',
      'Mention the 15-day free-look period once suitability is clear',
    ],
    knowledge_citations: [cite('doc_coc_c1'), cite('doc_rsp_c1'), cite('doc_rsp_c2'), cite('doc_rsp_c3')],
    created_at: daysAgo(1, 15),
  },
];

/** Older team sessions that only feed the dashboard aggregates. */
export const historyRecords: {
  id: string;
  scenario_id: string;
  overall_score: number;
  compliance_passed: boolean;
  dims: Record<string, number>;
  violations: string[];
  started_at: string;
}[] = [
  { id: 'sample-h1', scenario_id: 's_saas', overall_score: 84, compliance_passed: true, dims: { Discovery: 88, 'Objection handling': 76, 'Product accuracy': 90, Closing: 82 }, violations: [], started_at: daysAgo(2) },
  { id: 'sample-h2', scenario_id: 's_insurance', overall_score: 52, compliance_passed: false, dims: { Compliance: 30, 'Product accuracy': 70, Empathy: 66, 'Needs discovery': 58 }, violations: ['CC-01', 'CC-03'], started_at: daysAgo(3) },
  { id: 'sample-h3', scenario_id: 's_support', overall_score: 71, compliance_passed: true, dims: { Empathy: 64, 'Policy accuracy': 72, 'De-escalation': 77 }, violations: ['REF-01'], started_at: daysAgo(3, 15) },
  { id: 'sample-h4', scenario_id: 's_saas', overall_score: 66, compliance_passed: true, dims: { Discovery: 54, 'Objection handling': 61, 'Product accuracy': 80, Closing: 70 }, violations: [], started_at: daysAgo(4) },
  { id: 'sample-h5', scenario_id: 's_insurance', overall_score: 81, compliance_passed: true, dims: { Compliance: 92, 'Product accuracy': 84, Empathy: 74, 'Needs discovery': 72 }, violations: [], started_at: daysAgo(5) },
  { id: 'sample-h6', scenario_id: 's_insurance', overall_score: 49, compliance_passed: false, dims: { Compliance: 20, 'Product accuracy': 62, Empathy: 70, 'Needs discovery': 50 }, violations: ['CC-01'], started_at: daysAgo(6) },
  { id: 'sample-h7', scenario_id: 's_support', overall_score: 88, compliance_passed: true, dims: { Empathy: 90, 'Policy accuracy': 86, 'De-escalation': 88 }, violations: [], started_at: daysAgo(7) },
];

export const violationMessages: Record<string, string> = {
  'CC-01': 'Promised or implied a guaranteed return',
  'CC-02': 'Did not disclose that value can go down',
  'CC-03': 'Pressured the customer to decide immediately',
  'REF-01': 'Offered a cash refund outside the 30-day policy',
  'SP-01': 'Quoted a discount not in the price book',
};
