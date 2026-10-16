'use client';

import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { Container } from '@/components/app-shell';
import { ErrorState, LinkButton, PageHeader, Spinner } from '@/components/ui';
import { ScenarioEditor } from '@/components/scenario-editor';

export default function ScenarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync(async () => {
    const scenario = await api.getScenario(id);
    const persona = await api.getPersona(scenario.persona_id).catch(() => null);
    return { scenario, persona };
  }, [id]);

  return (
    <Container>
      <LinkButton href="/scenarios" variant="ghost" size="sm" className="mb-4 -ml-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
        All scenarios
      </LinkButton>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Spinner label="Loading scenario" />
      ) : (
        <>
          <PageHeader eyebrow="Scenario" title={data.scenario.title} description={data.scenario.description} />
          <ScenarioEditor key={data.scenario.id} initial={data.scenario} persona={data.persona} />
        </>
      )}
    </Container>
  );
}
