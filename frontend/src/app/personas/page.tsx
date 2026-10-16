'use client';

import Link from 'next/link';
import { BadgeCheck, BookOpen, FileText, PenLine, Plus, Sparkles, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { Persona } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { Container } from '@/components/app-shell';
import { Avatar, Badge, Card, DifficultyDots, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '@/components/ui';
import { PersonaSummary } from '@/components/persona-form';

const sourceMeta: Record<Persona['source'], { label: string; Icon: typeof Sparkles }> = {
  brief: { label: 'From brief', Icon: Sparkles },
  documents: { label: 'From documents', Icon: FileText },
  manual: { label: 'Manual', Icon: PenLine },
  seed: { label: 'Demo', Icon: BookOpen },
};

export default function PersonasPage() {
  const { data, error, loading, reload } = useAsync(() => api.listPersonas(), []);

  return (
    <Container>
      <PageHeader
        eyebrow="Builder"
        title="Customer personas"
        description="The AI customers your team practices with. Generate them from your own documents, review every source, then approve."
        actions={
          <LinkButton href="/personas/new" icon={<Plus className="h-4 w-4" aria-hidden />}>
            New persona
          </LinkButton>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={<UserRound className="h-10 w-10" aria-hidden />}
          title="No personas yet"
          description="Describe a customer in one line, or let Gemini find customer types in your documents."
          action={<LinkButton href="/personas/new">Create a persona</LinkButton>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => {
            const src = sourceMeta[p.source];
            return (
              <li key={p.id}>
                <Card className="group relative flex h-full flex-col p-5 transition-shadow focus-within:shadow-lift hover:shadow-lift">
                  <div className="mb-3 flex items-start gap-3">
                    <Avatar name={p.name} />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold text-slate-900">
                        <Link href={`/personas/${p.id}`} className="after:absolute after:inset-0 after:rounded-xl focus:outline-none">
                          {p.name}
                        </Link>
                      </h2>
                      <p className="truncate text-sm text-slate-600">{p.title}</p>
                    </div>
                    {p.status === 'approved' ? (
                      <Badge tone="good">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Approved
                      </Badge>
                    ) : (
                      <Badge tone="warn">Draft</Badge>
                    )}
                  </div>
                  <PersonaSummary persona={p} className="flex-1" />
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <src.Icon className="h-3.5 w-3.5" aria-hidden />
                      {src.label}
                      {p.citations.length > 0 && <span>&middot; {p.citations.length} sources</span>}
                    </span>
                    <DifficultyDots value={p.difficulty} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
