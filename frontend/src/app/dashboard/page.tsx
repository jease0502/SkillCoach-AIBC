'use client';

import { Activity, BadgeCheck, Database, Gauge, Lock, ShieldAlert, ShieldCheck, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate, scoreLabel, scoreTone } from '@/lib/utils';
import { Container } from '@/components/app-shell';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';

const bar = { good: 'bg-emerald-600', warn: 'bg-amber-500', bad: 'bg-rose-600', neutral: 'bg-slate-400', brand: 'bg-brand-600' };

export default function DashboardPage() {
  const { data, error, loading, reload } = useAsync(() => api.getDashboard(), []);

  const dims = [...(data?.by_dimension ?? [])].sort((a, b) => a.average - b.average);
  const weakest = dims[0];
  const maxViolations = Math.max(1, ...(data?.top_violations ?? []).map((v) => v.count));

  return (
    <Container>
      <PageHeader
        eyebrow="Manager view"
        title="Team readiness"
        description="Where your team is strong, where it needs coaching, and who is ready to talk to real customers."
      />
      <p className="-mt-4 mb-8 flex items-center gap-2 text-sm text-slate-600">
        <Lock className="h-4 w-4 text-slate-500" aria-hidden />
        Privacy: managers see aggregates and session summaries only, never transcripts or trainee names, so people can practice and fail safely.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
          <Skeleton className="h-72 sm:col-span-2" />
          <Skeleton className="h-72 sm:col-span-2" />
        </div>
      ) : data.sessions_count === 0 ? (
        <EmptyState icon={<Activity className="h-10 w-10" aria-hidden />} title="No practice sessions yet" description="Scores and skill gaps appear here after the first session." />
      ) : (
        <div className="flex flex-col gap-6">
          {(data.sample_sessions_count ?? 0) > 0 && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
              <Database className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
              <span className="font-semibold">
                Includes sample team data ({data.sample_sessions_count} {data.sample_sessions_count === 1 ? 'session' : 'sessions'})
              </span>
              <span className="text-amber-900">Seeded so the team view is not empty in a demo. Rows marked Sample below are not real practice.</span>
            </p>
          )}

          {/* KPI tiles */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<Activity className="h-5 w-5" aria-hidden />} label="Practice sessions" value={String(data.sessions_count)} />
            <Kpi
              icon={<Gauge className="h-5 w-5" aria-hidden />}
              label="Average score"
              value={data.average_score != null ? data.average_score.toFixed(0) : '–'}
              suffix={data.average_score != null ? '/ 100' : undefined}
              note={data.average_score != null ? scoreLabel(data.average_score) : undefined}
            />
            <Kpi
              icon={<BadgeCheck className="h-5 w-5" aria-hidden />}
              label="Ready to go live"
              value={String(data.ready_count ?? 0)}
              note="Compliance pass and score 80+"
              highlight
            />
            <Kpi
              icon={<TrendingDown className="h-5 w-5" aria-hidden />}
              label="Weakest skill"
              value={weakest?.name ?? '–'}
              note={weakest ? `Team average ${weakest.average.toFixed(0)}` : undefined}
              small
            />
          </ul>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* By dimension */}
            <Card className="p-5">
              <h2 className="mb-1 font-semibold text-slate-900">Skills across the team</h2>
              <p className="mb-5 text-sm text-slate-600">Average score per rubric dimension, weakest first.</p>
              {dims.length === 0 ? (
                <p className="text-sm text-slate-500">No scored dimensions yet.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {dims.map((d, i) => {
                    const tone = scoreTone(d.average);
                    return (
                      <li key={d.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2 font-medium text-slate-800">
                            {d.name}
                            {i === 0 && dims.length > 1 && <Badge tone="bad">Focus area</Badge>}
                          </span>
                          <span className="tabular-nums font-semibold text-slate-900">{d.average.toFixed(0)}</span>
                        </div>
                        <div
                          className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                          role="img"
                          aria-label={`${d.name}: ${d.average.toFixed(0)} out of 100, ${scoreLabel(d.average)}`}
                        >
                          <div className={cn('h-full rounded-full transition-[width] duration-700', bar[tone])} style={{ width: `${d.average}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-600" /> Strong 80+
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" /> Developing 60-79
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-rose-600" /> Needs work below 60
                </span>
              </p>
            </Card>

            {/* Violations */}
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
                <ShieldAlert className="h-5 w-5 text-slate-500" aria-hidden /> Top compliance violations
              </h2>
              <p className="mb-5 text-sm text-slate-600">Caught in practice, before they reach a customer.</p>
              {data.top_violations.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-800">
                  <ShieldCheck className="h-4 w-4" aria-hidden /> No violations recorded.
                </p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {data.top_violations.slice(0, 6).map((v) => (
                    <li key={v.rule_id}>
                      <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span className="mr-2 font-mono font-semibold text-slate-900">{v.rule_id}</span>
                          <span className="text-slate-700">{v.message}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                          {v.count}
                          <span className="sr-only"> times</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                        <div className="h-full rounded-full bg-rose-600" style={{ width: `${(v.count / maxViolations) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* Recent sessions */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Recent sessions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Recent practice sessions</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Scenario
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">
                      Customer
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Score
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Compliance
                    </th>
                    <th scope="col" className="hidden px-5 py-2.5 font-medium sm:table-cell">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recent_sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">{s.scenario_title}</span>
                          {s.id.startsWith('sample-') && (
                            <Badge tone="warn" title="Sample team data, not a real practice session">
                              Sample
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 text-slate-600 md:table-cell">{s.persona_name}</td>
                      <td className="px-3 py-3">
                        {s.overall_score != null ? (
                          <span className="flex items-center gap-2">
                            <span className="w-7 tabular-nums font-semibold text-slate-900">{s.overall_score}</span>
                            <Badge tone={scoreTone(s.overall_score)}>{scoreLabel(s.overall_score)}</Badge>
                          </span>
                        ) : (
                          <Badge tone="neutral">In progress</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {s.compliance_passed == null ? (
                          <span className="text-slate-400">&ndash;</span>
                        ) : s.compliance_passed ? (
                          <Badge tone="good">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Pass
                          </Badge>
                        ) : (
                          <Badge tone="bad">
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Fail
                          </Badge>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3 text-slate-600 sm:table-cell">{formatDate(s.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Container>
  );
}

function Kpi({
  icon,
  label,
  value,
  suffix,
  note,
  highlight,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  note?: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <li>
      <Card className={cn('h-full p-5', highlight && 'border-emerald-200 bg-emerald-50/50')}>
        <div className={cn('mb-2 flex items-center gap-2 text-sm font-medium', highlight ? 'text-emerald-800' : 'text-slate-600')}>
          {icon}
          {label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn('font-bold tabular-nums tracking-tight text-slate-900', small ? 'text-xl' : 'text-3xl')}>{value}</span>
          {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
        </div>
        {note && <div className="mt-1 text-xs text-slate-600">{note}</div>}
      </Card>
    </li>
  );
}
