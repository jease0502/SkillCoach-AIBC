'use client';

import { MessagesSquare, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { useStartPractice } from '@/lib/use-start-practice';
import { Container } from '@/components/app-shell';
import { EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '@/components/ui';
import { ScenarioCard } from '@/components/scenario-card';

export default function ScenariosPage() {
  const { data, error, loading, reload } = useAsync(() => Promise.all([api.listScenarios(), api.listPersonas()]), []);
  const { start, starting } = useStartPractice();

  return (
    <Container>
      <PageHeader
        eyebrow="Practice"
        title="Scenarios"
        description="Pick a conversation to rehearse. Each one has its own customer, scoring rubric and compliance rules."
        actions={
          <LinkButton href="/scenarios/new" icon={<Plus className="h-4 w-4" aria-hidden />}>
            New scenario
          </LinkButton>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : data[0].length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="h-10 w-10" aria-hidden />}
          title="No scenarios yet"
          description="Pick an approved persona and a goal. Gemini drafts the rubric, compliance rules and twists for you to review."
          action={<LinkButton href="/scenarios/new">Build a scenario</LinkButton>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data[0].map((s) => (
            <li key={s.id}>
              <ScenarioCard scenario={s} persona={data[1].find((p) => p.id === s.persona_id)} onStart={() => start(s.id)} starting={starting === s.id} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
