'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Sparkles } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Scenario } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { Container } from '@/components/app-shell';
import { Avatar, Button, Card, DifficultyDots, EmptyState, ErrorState, Field, LinkButton, PageHeader, Skeleton, inputClass } from '@/components/ui';
import { DocPicker } from '@/components/doc-picker';
import { GenerationProgress } from '@/components/generation-progress';
import { ScenarioEditor } from '@/components/scenario-editor';

const STAGES = ['Reading the persona', 'Retrieving policies and product facts', 'Drafting rubric and compliance rules', 'Verifying citations'];

export default function NewScenarioPage() {
  return (
    <Suspense fallback={null}>
      <NewScenario />
    </Suspense>
  );
}

function NewScenario() {
  const params = useSearchParams();
  const personas = useAsync(() => api.listPersonas(), []);
  const approved = personas.data?.filter((p) => p.status === 'approved') ?? [];

  const [personaId, setPersonaId] = useState<string>(params.get('persona') ?? '');
  const [goal, setGoal] = useState('');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ scenario: Scenario; n: number } | null>(null);
  const requestId = useRef(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const persona = approved.find((p) => p.id === personaId) ?? null;

  useEffect(() => {
    if (persona && !docIds.length) setDocIds(persona.source_document_ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona?.id]);

  const generate = async () => {
    if (!personaId || !goal.trim()) return;
    const id = ++requestId.current;
    setGenerating(true);
    setError(null);
    try {
      const s = await api.generateScenario({ persona_id: personaId, trainee_goal: goal.trim(), document_ids: docIds.length ? docIds : undefined });
      if (id !== requestId.current) return;
      setDraft({ scenario: s, n: Date.now() });
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setGenerating(false);
    }
  };

  return (
    <Container>
      <LinkButton href="/scenarios" variant="ghost" size="sm" className="mb-4 -ml-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
        All scenarios
      </LinkButton>
      <PageHeader
        eyebrow="New scenario"
        title="Build a practice scenario"
        description="Pick who the trainee talks to and what they must achieve. Gemini drafts the rubric, compliance rules and twists from your documents."
      />

      <Card className="mb-6 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!generating) void generate();
          }}
          className="flex flex-col gap-6"
        >
          <div role="radiogroup" aria-labelledby="persona-label" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span id="persona-label" className="text-sm font-medium text-slate-800">
                1. Customer persona <span className="font-normal text-slate-500">(approved only)</span>
              </span>
              <LinkButton href="/personas/new" variant="ghost" size="sm">
                New persona
              </LinkButton>
            </div>
            {personas.error ? (
              <ErrorState message={personas.error} onRetry={personas.reload} />
            ) : personas.loading ? (
              <Skeleton className="h-24" />
            ) : approved.length === 0 ? (
              <EmptyState title="No approved personas" description="Approve a persona after reviewing its sources, then come back." action={<LinkButton href="/personas">Go to personas</LinkButton>} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {approved.map((p) => {
                  const selected = p.id === personaId;
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          'flex h-full cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2',
                          selected ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200 bg-white hover:border-slate-300',
                        )}
                      >
                        <input type="radio" name="persona" value={p.id} checked={selected} onChange={() => setPersonaId(p.id)} className="sr-only" />
                        <Avatar name={p.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 font-medium text-slate-900">
                            {p.name}
                            <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="Approved" />
                          </span>
                          <span className="block text-sm text-slate-600">{p.title}</span>
                          <DifficultyDots value={p.difficulty} className="mt-2" />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Field label="2. What should the trainee achieve?" hint="Be specific. This drives the rubric and success criteria.">
            {(p) => (
              <textarea
                {...p}
                rows={2}
                required
                className={inputClass}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Explain the retirement plan honestly, uncover the customer's real need and stay within the Code of Conduct"
              />
            )}
          </Field>

          <DocPicker value={docIds} onChange={setDocIds} label="3. Ground rules and facts in these documents" />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={generating} disabled={!personaId || !goal.trim()} icon={<Sparkles className="h-4 w-4" aria-hidden />}>
              {draft ? 'Regenerate draft' : 'Generate scenario'}
            </Button>
          </div>
        </form>
      </Card>

      {generating && (
        <div className="mb-6">
          <GenerationProgress
            title="Drafting your scenario"
            stages={STAGES}
            onCancel={() => {
              requestId.current++;
              setGenerating(false);
            }}
          />
        </div>
      )}
      {error && (
        <div className="mb-6">
          <ErrorState message={error} onRetry={generate} />
        </div>
      )}

      {draft && (
        <div ref={editorRef} className="scroll-mt-20">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Review the draft</h2>
          <p className="mb-4 text-sm text-slate-600">Edit anything. Check that each compliance rule points at the right policy passage, then save.</p>
          <ScenarioEditor key={draft.n} initial={draft.scenario} persona={persona} />
        </div>
      )}
    </Container>
  );
}
