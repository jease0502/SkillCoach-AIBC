// In-browser fake backend used when NEXT_PUBLIC_MOCK=true.
// State lives in memory and is mirrored to sessionStorage so a page reload keeps the demo going.
import type {
  ChunkLike,
  MockState,
  ReplyRule,
} from './engine-types';
import {
  cite,
  historyRecords,
  seedChunks,
  seedDocuments,
  seedPersonas,
  seedReports,
  seedScenarios,
  seedSessions,
  violationMessages,
} from './fixtures';
import type {
  DeliveryFeedback,
  CoachHint,
  ComplianceFlag,
  Dashboard,
  Document,
  GeneratePersonaRequest,
  GeneratePersonasFromDocsRequest,
  GenerateScenarioRequest,
  Persona,
  Report,
  Scenario,
  SearchHit,
  Session,
  Turn,
  TurnEvent,
} from '../types';

const STORAGE_KEY = 'skillcoach-mock-v1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function fresh(): MockState {
  return {
    documents: clone(seedDocuments),
    chunks: clone(seedChunks),
    personas: clone(seedPersonas),
    scenarios: clone(seedScenarios),
    sessions: clone(seedSessions),
    reports: clone(seedReports),
  };
}

let state: MockState | null = null;

function db(): MockState {
  if (state) return state;
  try {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem(STORAGE_KEY) : null;
    state = saved ? (JSON.parse(saved) as MockState) : fresh();
  } catch {
    state = fresh();
  }
  return state;
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: memory only */
  }
}

function notFound(what: string): never {
  throw Object.assign(new Error(`${what} not found`), { status: 404 });
}

// ---------- Scripted customer behaviour ----------

const complianceChecks: { pattern: RegExp; flag: (quote: string) => ComplianceFlag; scenarios?: string[] }[] = [
  {
    // Any guarantee claim, except negated ones ("doesn't guarantee", "not guaranteed").
    pattern: /(?<!(?:\bnot|n['’]t|\bno|\bnever)\s(?:\w+\s)?)\bguarantee[sd]?\b[^.?!]*/i,
    flag: (quote) => ({ rule_id: 'CC-01', severity: 'high', message: 'Promises or implies a guaranteed return on an investment-linked product. Try: "Historically the plan averaged 5.2%, but returns are not guaranteed."', quote }),
  },
  {
    pattern: /(sign|decide)[^.?!]*today|ends tonight|today only|right now or/i,
    flag: (quote) => ({ rule_id: 'CC-03', severity: 'medium', message: 'Pressures the customer to decide in the same meeting. Offer time to think and the 15-day free-look period instead.', quote }),
  },
  {
    pattern: /(no|zero|without any) risk|can.t lose|never lose/i,
    scenarios: ['s_insurance'],
    flag: (quote) => ({ rule_id: 'CC-02', severity: 'high', message: 'Implies the investment cannot lose value. Disclose that it can go down as well as up.', quote }),
  },
  {
    pattern: /refund you in full[^.?!]*|full refund[^.?!]*/i,
    scenarios: ['s_support'],
    flag: (quote) => ({ rule_id: 'REF-01', severity: 'medium', message: 'Cash refunds are only allowed within 30 days. On day 41, offer store credit or escalate.', quote }),
  },
];

const rules: Record<string, ReplyRule[]> = {
  s_saas: [
    {
      match: /what happened|last year|tried before|previous tool/i,
      reply: 'Honestly? We paid for a full year and the team stopped logging in after three months. I can’t sell my board another tool nobody uses.',
      trust: 14,
      patience: 2,
      coach: { hint: 'Adoption is the real concern. Address it with evidence, like a pilot your team can prove.', technique: 'Respond with value', citations: [cite('doc_acme_c2'), cite('doc_acme_c4')] },
    },
    {
      match: /pilot/i,
      reply: 'A free pilot changes the picture. If my people actually use it, the price is easier to defend. What about security? Our shipment data is sensitive.',
      citations: [cite('doc_acme_c2', '30-day free pilot with up to 20 users')],
      trust: 14,
      patience: 0,
      coach: { hint: 'Answer the security question with the certifications, then propose a dated next step with named people.', technique: 'Confirm and close', citations: [cite('doc_acme_c3'), cite('doc_playbook_c3')] },
    },
    {
      match: /soc ?2|next week|uptime|sla/i,
      reply: 'SOC 2 Type II and a 99.9% SLA covers my IT team’s checklist. Fine. Set up the pilot with two of my team leads next week and send me the invite.',
      citations: [cite('doc_acme_c3', 'SOC 2 Type II certified and offers a 99.9% uptime SLA')],
      trust: 12,
      patience: 4,
      coach: { hint: 'Confirm the date, the attendees and what success looks like at the end of the pilot.', technique: 'Confirm', citations: [cite('doc_playbook_c3')] },
    },
    {
      match: /best|worth|leading|number one/i,
      reply: 'Everyone says they’re the best. That isn’t an answer. Your colleague mentioned a 60-day trial anyway, so why would I pay 30% more?',
      post: [{ rule_id: 'GROUNDING', severity: 'low', message: 'The product sheet offers a 30-day pilot, not a 60-day trial. Correct the customer if it matters.', quote: 'a 60-day trial' }],
      trust: -6,
      patience: -12,
      coach: { hint: 'Acknowledge the concern and ask a question before you pitch.', technique: 'Acknowledge, then clarify', citations: [cite('doc_playbook_c1')] },
    },
  ],
  s_insurance: [
    {
      match: /guarantee/i,
      reply: 'Eight percent, guaranteed? My son warned me about promises like that. Is that written down somewhere?',
      trust: -10,
      patience: -6,
      coach: { hint: 'Withdraw the guarantee now. Give the historical average and say returns can go down as well as up.', technique: 'Correct and disclose', citations: [cite('doc_coc_c1'), cite('doc_rsp_c2')] },
    },
    {
      match: /sign|tonight|today/i,
      reply: 'Tonight? I don’t make decisions like this in a hurry. I need to talk to my wife first.',
      trust: -8,
      patience: -15,
      coach: { hint: 'Take the pressure off. Invite him to think it over and mention the 15-day free-look period.', technique: 'Remove pressure', citations: [cite('doc_coc_c3'), cite('doc_rsp_c3')] },
    },
    {
      match: /past performance|go down|not guaranteed|can.t promise|cannot promise/i,
      reply: 'Thank you for being honest with me. But what happens if I need the money suddenly, for medical bills?',
      citations: [cite('doc_rsp_c1', 'historical average annual return is 5.2%'), cite('doc_rsp_c2', 'The value of the plan can go down as well as up.')],
      trust: 16,
      patience: -2,
      coach: { hint: 'Liquidity matters to him. Ask what the money is for and when he might need it.', technique: 'Open question', citations: [cite('doc_playbook_c2')] },
    },
    {
      match: /what you.d need|may i ask|what (would|will) you|need (the|that) money/i,
      reply: 'My wife has a heart condition. If something happens, I must pay the hospital quickly. That is what really worries me.',
      trust: 14,
      patience: -4,
      coach: { hint: 'Check whether this plan suits his liquidity needs, and mention the 15-day free-look period.', technique: 'Suitability check', citations: [cite('doc_rsp_c3'), cite('doc_rsp_c4')] },
    },
  ],
  s_support: [
    {
      match: /calm down|not my fault/i,
      reply: 'Don’t tell me to calm down. I want to talk to your manager. Right now.',
      trust: -15,
      patience: -20,
      coach: { hint: 'Acknowledge the emotion first, then say what you can do and when.', technique: 'Acknowledge emotion', citations: [cite('doc_tone_c1'), cite('doc_tone_c2')] },
    },
    {
      match: /refund you in full|full refund/i,
      reply: 'Great. Finally someone helpful. How long will the refund take?',
      trust: 6,
      patience: 4,
      coach: { hint: 'Day 41 is outside the 30-day window. Correct this now and offer store credit or a supervisor.', technique: 'Correct the promise', citations: [cite('doc_refund_c1'), cite('doc_refund_c2')] },
    },
    {
      match: /sorry|store credit|supervisor|frustrating/i,
      reply: '...Okay. Store credit is fine, I guess. They were a birthday gift for my dad, and I felt stupid when they stopped working.',
      citations: [cite('doc_refund_c2', 'store credit may be offered at the manager’s discretion'), cite('doc_refund_c3', 'Escalate to a supervisor if the customer requests it')],
      trust: 18,
      patience: 10,
      coach: { hint: 'Acknowledge the gift and give a clear time frame for the store credit.', technique: 'Time frame', citations: [cite('doc_tone_c2')] },
    },
  ],
};

const fallback: ReplyRule = {
  match: /.*/,
  reply: 'I’m not sure that answers my question. What does that actually mean for me?',
  trust: -2,
  patience: -8,
  coach: { hint: 'Ask an open question to learn what matters most to this customer before you explain more.', technique: 'Open question', citations: [] },
};

function findFlags(scenario: Scenario | undefined, text: string): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  for (const check of complianceChecks) {
    if (check.scenarios && scenario && !check.scenarios.includes(scenario.id)) continue;
    const m = text.match(check.pattern);
    if (m) flags.push(check.flag(m[0].trim()));
  }
  return flags;
}

function pickRule(scenarioId: string, text: string): ReplyRule {
  return (rules[scenarioId] ?? []).find((r) => r.match.test(text)) ?? fallback;
}

// ---------- Report synthesis ----------

function buildReport(session: Session, scenario: Scenario | undefined): Report {
  const traineeTurns = session.turns.filter((t) => t.role === 'trainee');
  const violations = traineeTurns.flatMap((t) => t.compliance);
  const compliance_passed = !violations.some((v) => v.severity === 'high');
  const trustGain = session.trust - (session.turns[0]?.trust ?? 40);
  const base = clamp(55 + trustGain * 0.8 - violations.length * 6);

  const dimensions = (scenario?.rubric ?? []).map((r, i) => {
    const turn = traineeTurns[(i + traineeTurns.length - 1) % Math.max(1, traineeTurns.length)];
    const isCompliance = /compliance|policy/i.test(r.name);
    const score = isCompliance ? clamp(90 - violations.length * 30) : clamp(base + (i % 2 === 0 ? 6 : -4));
    return {
      rubric_id: r.id,
      name: r.name,
      score: turn ? score : 0,
      feedback: turn
        ? isCompliance && violations.length
          ? `Flagged ${violations.length} time(s): ${violations.map((v) => v.rule_id).join(', ')}.`
          : score >= 75
            ? 'Clear, specific and grounded in the source material.'
            : 'Partly effective. Ask before you explain, and tie claims to the documents.'
        : 'No evidence in this conversation.',
      evidence: turn
        ? [{ turn_index: turn.index, quote: (isCompliance && violations[0]?.quote) || turn.text.split(/(?<=[.?!])\s/)[0], verified: true }]
        : [],
    };
  });

  const weighted = dimensions.length
    ? Math.round(
        dimensions.reduce((sum, d, i) => sum + d.score * (scenario?.rubric[i]?.weight ?? 1), 0) /
          dimensions.reduce((sum, _d, i) => sum + (scenario?.rubric[i]?.weight ?? 1), 0),
      )
    : base;
  const overall = compliance_passed ? weighted : Math.min(weighted, 59);

  return {
    session_id: session.id,
    overall_score: overall,
    compliance_passed,
    summary: compliance_passed
      ? `You moved the customer’s trust from ${session.turns[0]?.trust ?? 40} to ${session.trust} over ${traineeTurns.length} turn(s). Keep grounding claims in the documents.`
      : 'A high-severity compliance violation fails the gate, so the overall score is capped at 59 regardless of the other dimensions.',
    dimensions,
    compliance_violations: violations,
    strengths: trustGain > 0 ? ['Built trust over the conversation', 'Kept the customer engaged'] : ['Stayed in the conversation under pressure'],
    improvements: violations.length
      ? ['Check every promise against the Code of Conduct before you say it', 'Lead with disclosure, then benefits']
      : ['Ask one more discovery question before proposing a solution'],
    knowledge_citations: session.turns.flatMap((t) => t.citations).slice(0, 6),
    created_at: nowIso(),
  };
}

// ---------- Generators for the builders ----------

const names = ['Priya Nair', 'Marcus Lee', 'Sofia Alvarez', 'Kenji Watanabe', 'Grace Ong', 'Tom Becker'];

function draftPersona(partial: Partial<Persona>): Persona {
  return {
    id: '',
    name: names[Math.floor(Math.random() * names.length)],
    title: 'Prospective customer',
    age: 45,
    industry: null,
    locale: 'en-US',
    summary: '',
    personality: ['cautious', 'practical', 'polite'],
    communication_style: 'Asks practical questions and wants concrete examples.',
    goals: [],
    hidden_needs: [],
    objections: [],
    knowledge_level: 'intermediate',
    difficulty: 3,
    initial_trust: 40,
    initial_patience: 70,
    opening_line: '',
    voice: null,
    avatar: null,
    source: 'manual',
    source_document_ids: [],
    citations: [],
    status: 'draft',
    created_at: nowIso(),
    ...partial,
  };
}

function chunksFor(ids?: string[]): ChunkLike[] {
  const s = db();
  return s.chunks.filter((c) => !ids?.length || ids.includes(c.document_id));
}

function citeChunk(c: ChunkLike, supports?: string) {
  const title = db().documents.find((d) => d.id === c.document_id)?.title ?? 'Document';
  return { chunk_id: c.id, document_title: title, quote: c.text, supports: supports ?? null };
}

// ---------- Public mock API (same shape as the HTTP client) ----------

export const mockApi = {
  async health() {
    return { ok: true };
  },

  async listDocuments(): Promise<Document[]> {
    await sleep(200);
    return clone(db().documents).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async uploadDocument(file: File): Promise<Document> {
    await sleep(900);
    const isText = /\.(txt|md)$/i.test(file.name);
    const text = isText ? await file.text() : `Extracted text from ${file.name}.`;
    return mockApi.addTextDocument(file.name.replace(/\.[^.]+$/, ''), text, file);
  },
  async addTextDocument(title: string, text: string, file?: File): Promise<Document> {
    await sleep(500);
    const s = db();
    const id = uid('doc');
    const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const pieces = parts.length ? parts : [text.trim() || title];
    pieces.forEach((p, index) => s.chunks.push({ id: `${id}_c${index + 1}`, document_id: id, index, text: p.slice(0, 800) }));
    const doc: Document = {
      id,
      title,
      filename: file?.name ?? null,
      mime: file?.type || (file ? null : 'text/plain'),
      chunk_count: pieces.length,
      created_at: nowIso(),
    };
    s.documents.push(doc);
    persist();
    return clone(doc);
  },
  async deleteDocument(id: string): Promise<void> {
    await sleep(200);
    const s = db();
    s.documents = s.documents.filter((d) => d.id !== id);
    s.chunks = s.chunks.filter((c) => c.document_id !== id);
    persist();
  },
  async search(query: string, k = 5): Promise<SearchHit[]> {
    await sleep(400);
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    const s = db();
    return s.chunks
      .map((chunk) => {
        const text = chunk.text.toLowerCase();
        const hits = terms.filter((t) => text.includes(t)).length;
        return { chunk, score: terms.length ? hits / terms.length : 0 };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ chunk, score }) => ({
        chunk: clone(chunk),
        score: Math.min(0.97, 0.45 + score * 0.5),
        document_title: s.documents.find((d) => d.id === chunk.document_id)?.title ?? 'Document',
      }));
  },

  async generatePersona(body: GeneratePersonaRequest): Promise<Persona> {
    await sleep(1600);
    const brief = body.brief.trim();
    const sources = chunksFor(body.document_ids).slice(0, 2);
    return draftPersona({
      title: brief.length > 60 ? `${brief.slice(0, 57)}...` : brief,
      summary: `Generated from the brief: "${brief}".`,
      locale: body.locale ?? 'en-US',
      goals: ['Make a safe, well-informed decision', 'Avoid wasting time on a poor fit'],
      hidden_needs: ['Worried about being judged for not understanding the details'],
      objections: [
        { id: 'o1', text: 'I already have something similar. Why change?', trigger: 'at the start' },
        { id: 'o2', text: 'That sounds expensive.', trigger: 'when price is mentioned' },
      ],
      opening_line: 'I only have a few minutes. What is this about?',
      source: 'brief',
      source_document_ids: body.document_ids ?? [],
      citations: sources.map((c, i) => citeChunk(c, i === 0 ? 'objection:o1' : 'hidden_need:0')),
    });
  },
  async generatePersonasFromDocs(body: GeneratePersonasFromDocsRequest): Promise<Persona[]> {
    await sleep(2000);
    const chunks = chunksFor(body.document_ids);
    const templates: Partial<Persona>[] = [
      {
        title: 'Price-sensitive small business owner',
        summary: 'Runs a 12-person company. Compares every quote line by line.',
        personality: ['frugal', 'direct', 'busy'],
        difficulty: 3,
        objections: [{ id: 'o1', text: 'Your competitor is cheaper.', trigger: 'when price is mentioned' }],
        opening_line: 'Before we start: is this going to cost more than what I pay now?',
      },
      {
        title: 'Risk-averse first-time buyer',
        summary: 'Has never bought this kind of product and fears making a mistake.',
        personality: ['cautious', 'anxious', 'polite'],
        difficulty: 2,
        objections: [{ id: 'o1', text: 'What if something goes wrong?', trigger: 'when risks are discussed' }],
        opening_line: 'I’ve read a lot online and I’m honestly a bit confused. Where do I even start?',
      },
      {
        title: 'Expert procurement lead',
        summary: 'Knows the market well and tests whether the rep knows the product details.',
        personality: ['analytical', 'demanding', 'formal'],
        difficulty: 5,
        knowledge_level: 'expert',
        objections: [{ id: 'o1', text: 'Your SLA terms are weaker than the market standard.', trigger: 'when service levels come up' }],
        opening_line: 'I have your spec sheet in front of me. Walk me through the numbers.',
      },
    ];
    return templates.slice(0, body.count ?? 3).map((t, i) =>
      draftPersona({
        ...t,
        name: names[(i * 2 + 1) % names.length],
        source: 'documents',
        source_document_ids: body.document_ids ?? [],
        goals: ['Get a clear answer grounded in the facts'],
        hidden_needs: ['Needs to justify the decision to someone else'],
        citations: chunks.slice(i, i + 2).map((c, j) => citeChunk(c, j === 0 ? 'objection:o1' : 'hidden_need:0')),
      }),
    );
  },
  async listPersonas(): Promise<Persona[]> {
    await sleep(200);
    return clone(db().personas);
  },
  async getPersona(id: string): Promise<Persona> {
    await sleep(150);
    return clone(db().personas.find((p) => p.id === id) ?? notFound('Persona'));
  },
  async createPersona(p: Persona): Promise<Persona> {
    await sleep(400);
    const saved = { ...clone(p), id: uid('p'), status: 'draft' as const, created_at: nowIso() };
    db().personas.push(saved);
    persist();
    return clone(saved);
  },
  async updatePersona(p: Persona): Promise<Persona> {
    await sleep(400);
    const s = db();
    const i = s.personas.findIndex((x) => x.id === p.id);
    if (i < 0) notFound('Persona');
    s.personas[i] = clone(p);
    persist();
    return clone(p);
  },
  async deletePersona(id: string): Promise<void> {
    await sleep(200);
    db().personas = db().personas.filter((p) => p.id !== id);
    persist();
  },
  async approvePersona(id: string): Promise<Persona> {
    await sleep(300);
    const p = db().personas.find((x) => x.id === id) ?? notFound('Persona');
    p.status = 'approved';
    persist();
    return clone(p);
  },

  async generateScenario(body: GenerateScenarioRequest): Promise<Scenario> {
    await sleep(1800);
    const persona = db().personas.find((p) => p.id === body.persona_id) ?? notFound('Persona');
    const docIds = body.document_ids?.length ? body.document_ids : persona.source_document_ids;
    const ruleChunks = chunksFor(docIds).filter((c) => /never|always|do not|only/i.test(c.text)).slice(0, 3);
    return {
      id: '',
      title: `${persona.title}: ${body.trainee_goal.split(/[.,]/)[0]}`.slice(0, 80),
      description: `Practice conversation with ${persona.name}. ${persona.summary}`,
      persona_id: persona.id,
      trainee_goal: body.trainee_goal,
      context: 'First conversation. The customer agreed to a short call.',
      success_criteria: ['Uncovers the customer’s real concern', 'Makes only claims supported by the documents', 'Agrees on a clear next step'],
      compliance_rules: ruleChunks.map((c, i) => ({
        id: `R-${String(i + 1).padStart(2, '0')}`,
        rule: c.text.replace(/^[A-Z]+-\d+:\s*/, ''),
        severity: i === 0 ? 'high' : 'medium',
        citations: [citeChunk(c, `rule:R-${String(i + 1).padStart(2, '0')}`)],
      })),
      rubric: [
        { id: 'discovery', name: 'Discovery', description: 'Asks open questions that surface the real need.', weight: 1 },
        { id: 'accuracy', name: 'Accuracy', description: 'Claims match the knowledge base.', weight: 1 },
        { id: 'empathy', name: 'Empathy', description: 'Acknowledges feelings and concerns.', weight: 1 },
        { id: 'closing', name: 'Next step', description: 'Proposes a concrete, low-pressure next step.', weight: 1 },
      ],
      branch_events: [
        { id: 'b1', trigger: 'turn >= 4', event: persona.objections[1]?.text ?? 'raises a new objection' },
        { id: 'b2', trigger: 'trust >= 60', event: `reveals: ${persona.hidden_needs[0] ?? 'a hidden concern'}` },
      ],
      document_ids: docIds,
      difficulty: persona.difficulty,
      max_turns: 10,
      opening_line: null,
      created_at: nowIso(),
    };
  },
  async listScenarios(): Promise<Scenario[]> {
    await sleep(200);
    return clone(db().scenarios);
  },
  async getScenario(id: string): Promise<Scenario> {
    await sleep(150);
    return clone(db().scenarios.find((s) => s.id === id) ?? notFound('Scenario'));
  },
  async createScenario(sc: Scenario): Promise<Scenario> {
    await sleep(400);
    const saved = { ...clone(sc), id: uid('s'), created_at: nowIso() };
    db().scenarios.push(saved);
    persist();
    return clone(saved);
  },
  async updateScenario(sc: Scenario): Promise<Scenario> {
    await sleep(400);
    const s = db();
    const i = s.scenarios.findIndex((x) => x.id === sc.id);
    if (i < 0) notFound('Scenario');
    s.scenarios[i] = clone(sc);
    persist();
    return clone(sc);
  },
  async deleteScenario(id: string): Promise<void> {
    await sleep(200);
    db().scenarios = db().scenarios.filter((x) => x.id !== id);
    persist();
  },

  async createSession(scenario_id: string): Promise<Session> {
    await sleep(500);
    const s = db();
    const scenario = s.scenarios.find((x) => x.id === scenario_id) ?? notFound('Scenario');
    const persona = s.personas.find((p) => p.id === scenario.persona_id) ?? notFound('Persona');
    const opening = scenario.opening_line || persona.opening_line || `Hello. I'm ${persona.name}. What can you do for me?`;
    const session: Session = {
      id: uid('sess'),
      scenario_id,
      persona_id: persona.id,
      status: 'active',
      trust: persona.initial_trust,
      patience: persona.initial_patience,
      started_at: nowIso(),
      ended_at: null,
      turns: [
        { index: 0, role: 'customer', text: opening, at: nowIso(), citations: [], compliance: [], trust: persona.initial_trust, patience: persona.initial_patience },
      ],
    };
    s.sessions.push(session);
    persist();
    return clone(session);
  },
  async listSessions(): Promise<Session[]> {
    await sleep(200);
    return clone(db().sessions);
  },
  async getSession(id: string): Promise<Session> {
    await sleep(150);
    return clone(db().sessions.find((x) => x.id === id) ?? notFound('Session'));
  },
  async delivery(_id: string, _image: string, _text: string): Promise<DeliveryFeedback> {
    await sleep(600);
    return {
      eye_contact: 'good',
      expression: 'calm, friendly',
      posture: 'upright, centred',
      fit: 'fits',
      tip: 'Keep looking at the camera while you explain the risk.',
    };
  },
  async precheck(id: string, text: string): Promise<{ flags: ComplianceFlag[] }> {
    await sleep(350);
    const s = db();
    const session = s.sessions.find((x) => x.id === id) ?? notFound('Session');
    return { flags: findFlags(s.scenarios.find((x) => x.id === session.scenario_id), text) };
  },
  async *sendTurn(id: string, text: string, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
    const s = db();
    const session = s.sessions.find((x) => x.id === id);
    if (!session) {
      yield { event: 'error', data: { detail: 'Session not found' } };
      return;
    }
    if (session.status === 'ended') {
      yield { event: 'error', data: { detail: 'This session has ended.', status: 409 } };
      return;
    }
    const scenario = s.scenarios.find((x) => x.id === session.scenario_id);

    await sleep(450);
    if (signal?.aborted) return;
    const flags = findFlags(scenario, text);
    yield { event: 'compliance_pre', data: { flags } };
    session.turns.push({ index: session.turns.length, role: 'trainee', text, at: nowIso(), citations: [], compliance: flags });

    const rule = pickRule(session.scenario_id, text);
    await sleep(500);
    const words = rule.reply.split(/(?<=\s)/);
    for (const w of words) {
      if (signal?.aborted) return;
      yield { event: 'customer_delta', data: { text: w } };
      await sleep(28 + Math.random() * 40);
    }

    const prevTrust = session.trust;
    const prevPatience = session.patience;
    session.trust = clamp(session.trust + rule.trust);
    session.patience = clamp(session.patience + rule.patience);
    const turn: Turn = {
      index: session.turns.length,
      role: 'customer',
      text: rule.reply,
      at: nowIso(),
      citations: rule.citations ?? [],
      compliance: [],
      coach: rule.coach ?? null,
      trust: session.trust,
      patience: session.patience,
    };
    session.turns.push(turn);
    yield { event: 'customer_done', data: { turn: clone(turn) } };
    await sleep(120);
    yield { event: 'compliance_post', data: { flags: rule.post ?? [] } };
    await sleep(150);
    yield {
      event: 'state',
      data: {
        trust: session.trust,
        patience: session.patience,
        trust_delta: session.trust - prevTrust,
        patience_delta: session.patience - prevPatience,
        reason: rule.reason ?? (rule.trust >= 0 ? 'The customer felt heard.' : 'The customer felt pushed or dismissed.'),
      },
    };
    await sleep(350);
    if (rule.coach) yield { event: 'coach', data: { hint: clone(rule.coach) } };

    const traineeCount = session.turns.filter((t) => t.role === 'trainee').length;
    if (session.patience <= 0 || traineeCount >= (scenario?.max_turns ?? 12)) session.status = 'ended';
    persist();
    yield { event: 'done', data: { session_status: session.status } };
  },
  async endSession(id: string): Promise<Report> {
    await sleep(2200);
    const s = db();
    const session = s.sessions.find((x) => x.id === id) ?? notFound('Session');
    if (!session.turns.some((t) => t.role === 'trainee')) {
      throw Object.assign(new Error('Say something to the customer before ending the session.'), { status: 400 });
    }
    const existing = s.reports.find((r) => r.session_id === id);
    if (existing) return clone(existing);
    session.status = 'ended';
    session.ended_at = nowIso();
    const report = buildReport(session, s.scenarios.find((x) => x.id === session.scenario_id));
    s.reports.push(report);
    persist();
    return clone(report);
  },
  async getReport(id: string): Promise<Report> {
    await sleep(250);
    return clone(db().reports.find((r) => r.session_id === id) ?? notFound('Report'));
  },

  async getDashboard(): Promise<Dashboard> {
    await sleep(300);
    const s = db();
    const scenarioTitle = (id: string) => s.scenarios.find((x) => x.id === id)?.title ?? 'Deleted scenario';
    const personaName = (scenarioId: string) => {
      const pid = s.scenarios.find((x) => x.id === scenarioId)?.persona_id;
      return s.personas.find((p) => p.id === pid)?.name ?? 'Unknown';
    };

    const live = s.reports.map((r) => {
      const sess = s.sessions.find((x) => x.id === r.session_id)!;
      return {
        id: r.session_id,
        scenario_id: sess?.scenario_id ?? '',
        overall_score: r.overall_score,
        compliance_passed: r.compliance_passed,
        dims: Object.fromEntries(r.dimensions.map((d) => [d.name, d.score])),
        violations: r.compliance_violations.map((v) => v.rule_id),
        started_at: sess?.started_at ?? r.created_at,
      };
    });
    const all = [...live, ...historyRecords];

    const dimTotals = new Map<string, number[]>();
    all.forEach((r) => Object.entries(r.dims).forEach(([k, v]) => dimTotals.set(k, [...(dimTotals.get(k) ?? []), v])));
    const vioCounts = new Map<string, number>();
    all.forEach((r) => r.violations.forEach((v) => vioCounts.set(v, (vioCounts.get(v) ?? 0) + 1)));

    const unscored = s.sessions
      .filter((x) => !s.reports.some((r) => r.session_id === x.id))
      .map((x) => ({ id: x.id, scenario_title: scenarioTitle(x.scenario_id), persona_name: personaName(x.scenario_id), overall_score: null, compliance_passed: null, started_at: x.started_at }));

    return {
      ready_count: all.filter((r) => r.compliance_passed && r.overall_score >= 80).length,
      sample_sessions_count: historyRecords.length,
      sessions_count: all.length + unscored.length,
      average_score: Math.round((all.reduce((a, r) => a + r.overall_score, 0) / all.length) * 10) / 10,
      by_dimension: [...dimTotals.entries()].map(([name, v]) => ({ name, average: v.reduce((a, b) => a + b, 0) / v.length })),
      top_violations: [...vioCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([rule_id, count]) => ({ rule_id, count, message: violationMessages[rule_id] ?? rule_id })),
      recent_sessions: [
        ...unscored,
        ...all.map((r) => ({
          id: r.id,
          scenario_title: scenarioTitle(r.scenario_id),
          persona_name: personaName(r.scenario_id),
          overall_score: r.overall_score,
          compliance_passed: r.compliance_passed,
          started_at: r.started_at,
        })),
      ]
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, 10),
    };
  },
};
