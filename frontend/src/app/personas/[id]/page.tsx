'use client';

import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { Container } from '@/components/app-shell';
import { ErrorState, LinkButton, PageHeader, Spinner } from '@/components/ui';
import { PersonaEditor } from '@/components/persona-editor';

export default function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync(() => api.getPersona(id), [id]);

  return (
    <Container>
      <LinkButton href="/personas" variant="ghost" size="sm" className="mb-4 -ml-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
        All personas
      </LinkButton>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Spinner label="Loading persona" />
      ) : (
        <>
          <PageHeader eyebrow="Persona" title={data.name} description={data.title} />
          <PersonaEditor key={data.id} initial={data} />
        </>
      )}
    </Container>
  );
}
