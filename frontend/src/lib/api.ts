import { parseSSE } from './sse';
import { mockApi } from './mock/engine';
import type {
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
  TurnEvent,
} from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
export const MOCK = process.env.NEXT_PUBLIC_MOCK === 'true';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Cannot reach the SkillCoach API. Check your connection and try again.', 0);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
      else if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).join('; ');
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) });
const del: RequestInit = { method: 'DELETE' };

const httpApi = {
  health: () => request<{ ok: boolean }>('/healthz'),

  // Knowledge base
  listDocuments: () => request<Document[]>('/api/kb/documents'),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Document>('/api/kb/documents', { method: 'POST', body: form });
  },
  addTextDocument: (title: string, text: string) => request<Document>('/api/kb/documents/text', json({ title, text })),
  deleteDocument: (id: string) => request<void>(`/api/kb/documents/${id}`, del),
  search: (query: string, k = 5) => request<SearchHit[]>('/api/kb/search', json({ query, k })),

  // Personas
  generatePersona: (body: GeneratePersonaRequest) => request<Persona>('/api/personas/generate', json(body)),
  generatePersonasFromDocs: (body: GeneratePersonasFromDocsRequest) =>
    request<Persona[]>('/api/personas/generate-from-docs', json(body)),
  listPersonas: () => request<Persona[]>('/api/personas'),
  getPersona: (id: string) => request<Persona>(`/api/personas/${id}`),
  createPersona: (p: Persona) => request<Persona>('/api/personas', json(p)),
  updatePersona: (p: Persona) => request<Persona>(`/api/personas/${p.id}`, put(p)),
  deletePersona: (id: string) => request<void>(`/api/personas/${id}`, del),
  approvePersona: (id: string) => request<Persona>(`/api/personas/${id}/approve`, { method: 'POST' }),

  // Scenarios
  generateScenario: (body: GenerateScenarioRequest) => request<Scenario>('/api/scenarios/generate', json(body)),
  listScenarios: () => request<Scenario[]>('/api/scenarios'),
  getScenario: (id: string) => request<Scenario>(`/api/scenarios/${id}`),
  createScenario: (s: Scenario) => request<Scenario>('/api/scenarios', json(s)),
  updateScenario: (s: Scenario) => request<Scenario>(`/api/scenarios/${s.id}`, put(s)),
  deleteScenario: (id: string) => request<void>(`/api/scenarios/${id}`, del),

  // Sessions
  createSession: (scenario_id: string) => request<Session>('/api/sessions', json({ scenario_id })),
  listSessions: () => request<Session[]>('/api/sessions'),
  getSession: (id: string) => request<Session>(`/api/sessions/${id}`),
  /** Fast compliance check before a message is sent, so high-risk messages can be held back. */
  precheck: (id: string, text: string, signal?: AbortSignal) =>
    request<{ flags: ComplianceFlag[] }>(`/api/sessions/${id}/precheck`, { ...json({ text }), signal }),
  async *sendTurn(id: string, text: string, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/sessions/${id}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ text }),
        signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      yield { event: 'error', data: { detail: 'Cannot reach the SkillCoach API.' } };
      return;
    }
    if (!res.ok || !res.body) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        detail = (await res.json()).detail ?? detail;
      } catch {
        /* ignore */
      }
      yield { event: 'error', data: { detail, status: res.status } };
      return;
    }
    yield* parseSSE(res.body);
  },
  endSession: (id: string) => request<Report>(`/api/sessions/${id}/end`, { method: 'POST' }),
  getReport: (id: string) => request<Report>(`/api/sessions/${id}/report`),

  // Dashboard
  getDashboard: () => request<Dashboard>('/api/dashboard'),
};

export type Api = typeof httpApi;

/** Single entry point for all data access. `NEXT_PUBLIC_MOCK=true` swaps in local fixtures. */
export const api: Api = MOCK ? mockApi : httpApi;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
