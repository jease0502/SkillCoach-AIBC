'use client';

import Link from 'next/link';
import { History, LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';
import { scoreLabel, scoreTone } from '@/lib/utils';
import { Container } from '@/components/app-shell';
import { Badge, Card, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '@/components/ui';

function History_() {
  const { data, error, loading, reload } = useAsync(() => api.mySessions(), []);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <Skeleton className="h-48" />;
  if (!data?.length) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6" aria-hidden />}
        title="No practice sessions yet"
        description="Pick a scenario and start practising. Your sessions and reports will show up here."
        action={<LinkButton href="/scenarios">Browse scenarios</LinkButton>}
      />
    );
  }
  const done = data.filter((s) => s.overall_score != null);
  const avg = done.length ? Math.round(done.reduce((a, s) => a + (s.overall_score ?? 0), 0) / done.length) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-slate-500">Sessions</div>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">{data.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Average score</div>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">{avg ?? '–'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Compliance passed</div>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">
            {done.filter((s) => s.compliance_passed).length} / {done.length}
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">{s.scenario_title}</div>
                <div className="text-xs text-slate-500">
                  with {s.persona_name} · {new Date(s.started_at).toLocaleString()}
                </div>
              </div>
              {s.overall_score != null ? (
                <>
                  <span className="w-8 text-right font-semibold tabular-nums text-slate-900">{s.overall_score}</span>
                  <Badge tone={scoreTone(s.overall_score)}>{scoreLabel(s.overall_score)}</Badge>
                  {s.compliance_passed === false && <Badge tone="bad">Compliance fail</Badge>}
                  <Link href={`/reports/${s.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                    Report
                  </Link>
                </>
              ) : (
                <Link href={`/practice/${s.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  Continue
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function MyPracticePage() {
  const { account, ready } = useAuth();
  return (
    <Container>
      <PageHeader
        eyebrow="Trainee"
        title={account ? `${account.guest ? 'Guest' : account.name}'s practice` : 'My practice'}
        description="Every session you ran, with its score and evidence-backed report."
      />
      {!ready ? (
        <Skeleton className="h-48" />
      ) : !account ? (
        <EmptyState
          icon={<LogIn className="h-6 w-6" aria-hidden />}
          title="Sign in to keep your history"
          description="Create a free account or continue as a guest; your practice sessions are then saved here."
          action={<LinkButton href="/login?next=/me">Sign in</LinkButton>}
        />
      ) : (
        <History_ />
      )}
    </Container>
  );
}
