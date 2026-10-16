'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleSlash,
  MessageSquareQuote,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { DimensionScore, Persona, Report, Scenario, Session } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate, scoreLabel, scoreTone } from '@/lib/utils';
import { Badge, Button, Card, CitationList, ErrorState, LinkButton, ScoreRing, SeverityBadge, Skeleton } from '@/components/ui';
import { TurnBubble } from '@/components/transcript';
import { useToast } from '@/components/toast';
import { GenerationProgress, REPORT_NOTE, REPORT_STAGES } from '@/components/generation-progress';

interface Loaded {
  report: Report;
  session: Session;
  scenario: Scenario | null;
  persona: Persona | null;
}

const barFill = { good: 'bg-emerald-600', warn: 'bg-amber-500', bad: 'bg-rose-600', neutral: 'bg-slate-300', brand: 'bg-brand-600' };

export function ReportView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [retrying, setRetrying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [focus, setFocus] = useState<{ turn: number; quote: string; n: number } | null>(null);
  const turnRefs = useRef(new Map<number, HTMLLIElement>());

  const state = useAsync<Loaded>(async () => {
    const session = await api.getSession(sessionId);
    let report: Report;
    try {
      report = await api.getReport(sessionId);
    } catch (err) {
      // The report may not exist yet (e.g. the session ended on max turns); generate it.
      if ((err as { status?: number }).status !== 404) throw err;
      setGenerating(true);
      try {
        report = await api.endSession(sessionId);
      } finally {
        setGenerating(false);
      }
    }
    const [scenario, persona] = await Promise.all([
      api.getScenario(session.scenario_id).catch(() => null),
      api.getPersona(session.persona_id).catch(() => null),
    ]);
    return { report, session, scenario, persona };
  }, [sessionId]);

  const jumpTo = (turn: number, quote: string) => setFocus((f) => ({ turn, quote, n: (f?.n ?? 0) + 1 }));

  // After the highlighted bubble re-mounts (restarting its flash animation), bring it into view.
  useEffect(() => {
    if (!focus) return;
    const el = turnRefs.current.get(focus.turn);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    }
  }, [focus]);

  const retry = async () => {
    setRetrying(true);
    setGenerating(true);
    try {
      await api.endSession(sessionId);
      state.reload();
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setRetrying(false);
      setGenerating(false);
    }
  };

  const practiceAgain = async () => {
    if (!state.data) return;
    setRestarting(true);
    try {
      const s = await api.createSession(state.data.session.scenario_id);
      router.push(`/practice/${s.id}`);
    } catch (err) {
      toast('error', errorMessage(err));
      setRestarting(false);
    }
  };

  if (generating) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <GenerationProgress title="Building your report" stages={REPORT_STAGES} stepMs={2200} note={REPORT_NOTE} className="bg-white shadow-card" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorState message={state.error} onRetry={retry} />
        <LinkButton href="/dashboard" variant="ghost" className="mt-4" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
          Back to dashboard
        </LinkButton>
      </div>
    );
  }

  if (state.loading || !state.data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-busy="true">
        <span className="sr-only" role="status">
          Loading report...
        </span>
        <Skeleton className="mb-6 h-48" />
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const { report, session, scenario, persona } = state.data;
  const customerName = persona?.name ?? 'Customer';
  const evidenceByTurn = new Map<number, string[]>();
  report.dimensions.forEach((d) =>
    d.evidence.filter((e) => e.verified).forEach((e) => evidenceByTurn.set(e.turn_index, [...(evidenceByTurn.get(e.turn_index) ?? []), e.quote])),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <LinkButton href="/dashboard" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
          Dashboard
        </LinkButton>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={practiceAgain} loading={restarting} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
            Practice again
          </Button>
          <LinkButton href="/dashboard" size="sm" variant="subtle" icon={<BarChart3 className="h-4 w-4" aria-hidden />}>
            Team view
          </LinkButton>
        </div>
      </div>

      {/* Hero */}
      <Card className="mb-6 overflow-hidden">
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 px-6 py-3 text-sm font-medium',
            report.compliance_passed ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900',
          )}
          role="status"
        >
          {report.compliance_passed ? (
            <ShieldCheck className="h-6 w-6 text-emerald-700" aria-hidden />
          ) : (
            <ShieldAlert className="h-6 w-6 text-rose-700" aria-hidden />
          )}
          <span
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-bold tracking-wider text-white',
              report.compliance_passed ? 'bg-emerald-700' : 'bg-rose-700',
            )}
          >
            COMPLIANCE {report.compliance_passed ? 'PASS' : 'FAIL'}
          </span>
          <span className="flex-1">
            {report.compliance_passed
              ? 'No high-severity violations. This session counts toward go-live readiness.'
              : `A high-severity violation was found, so the overall score is capped and this session cannot count toward go-live readiness.`}
          </span>
        </div>
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <ScoreRing score={report.overall_score} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge tone={scoreTone(report.overall_score)}>{scoreLabel(report.overall_score)}</Badge>
              {!report.compliance_passed && <Badge tone="bad">Score capped</Badge>}
              <span className="text-xs text-slate-500">{formatDate(report.created_at)}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{scenario?.title ?? 'Practice report'}</h1>
            <p className="mt-1 text-sm text-slate-600">
              with {customerName}
              {persona?.title ? `, ${persona.title}` : ''}
            </p>
            <p className="mt-3 max-w-3xl leading-relaxed text-slate-700">{report.summary}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-6">
          {/* Dimensions */}
          <section aria-labelledby="dims-title">
            <h2 id="dims-title" className="mb-1 text-lg font-semibold text-slate-900">
              Skills, with evidence
            </h2>
            <p className="mb-4 text-sm text-slate-600">Every score quotes your own words. Select a quote to see it in the transcript.</p>
            <ul className="flex flex-col gap-3">
              {report.dimensions.map((d) => (
                <DimensionCard key={d.rubric_id} d={d} onJump={jumpTo} />
              ))}
            </ul>
          </section>

          {/* Violations */}
          <section aria-labelledby="viol-title">
            <Card className="p-5">
              <h2 id="viol-title" className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <ShieldAlert className="h-5 w-5 text-slate-500" aria-hidden /> Compliance violations
                <Badge tone={report.compliance_violations.length ? 'bad' : 'good'}>{report.compliance_violations.length}</Badge>
              </h2>
              {report.compliance_violations.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> No compliance issues detected.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {report.compliance_violations.map((v, i) => {
                    const turn = session.turns.find((t) => t.role === 'trainee' && t.text.toLowerCase().includes(v.quote.toLowerCase()));
                    return (
                      <li key={i} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-900">{v.rule_id}</span>
                          <SeverityBadge severity={v.severity} />
                        </div>
                        <p className="text-sm text-slate-700">{v.message}</p>
                        {turn ? (
                          <QuoteButton quote={v.quote} turn={turn.index} onJump={jumpTo} tone="bad" />
                        ) : (
                          <p className="mt-2 text-sm italic text-slate-600">&ldquo;{v.quote}&rdquo;</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <Sparkles className="h-5 w-5 text-emerald-600" aria-hidden /> Strengths
              </h2>
              <ul className="flex flex-col gap-2 text-sm text-slate-700">
                {report.strengths.map((s) => (
                  <li key={s} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <TrendingUp className="h-5 w-5 text-brand-600" aria-hidden /> Next time, try
              </h2>
              <ul className="flex flex-col gap-2 text-sm text-slate-700">
                {report.improvements.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {report.knowledge_citations.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-1 font-semibold text-slate-900">Knowledge used</h2>
              <p className="mb-3 text-sm text-slate-600">Passages from your knowledge base that grounded the customer and the scoring.</p>
              <CitationList citations={report.knowledge_citations} />
            </Card>
          )}
        </div>

        {/* Transcript */}
        <section aria-labelledby="transcript-title" className="lg:sticky lg:top-20 lg:self-start">
          <Card className="flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 id="transcript-title" className="font-semibold text-slate-900">
                Transcript
              </h2>
              <span className="text-xs text-slate-500">{session.turns.length} turns</span>
            </div>
            <ol className="scrollbar-thin flex flex-col gap-4 overflow-y-auto p-4">
              {session.turns.map((t) => (
                <TurnBubble
                  key={`${t.role}-${t.index}-${focus?.turn === t.index ? focus.n : 0}`}
                  ref={(el) => {
                    if (el) turnRefs.current.set(t.index, el);
                    else turnRefs.current.delete(t.index);
                  }}
                  turn={t}
                  customerName={customerName}
                  evidence={focus?.turn === t.index ? [focus.quote] : evidenceByTurn.get(t.index)}
                  highlighted={focus?.turn === t.index}
                />
              ))}
            </ol>
          </Card>
        </section>
      </div>
    </div>
  );
}

function QuoteButton({ quote, turn, onJump, tone = 'brand', unverified }: { quote: string; turn: number; onJump: (t: number, q: string) => void; tone?: 'brand' | 'bad'; unverified?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onJump(turn, quote)}
      className={cn(
        'group mt-2 flex w-full items-start gap-2 rounded-lg border-l-4 bg-slate-50 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100',
        tone === 'bad' ? 'border-rose-400' : unverified ? 'border-slate-300' : 'border-brand-500',
      )}
    >
      <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600" aria-hidden />
      <span className="flex-1">
        <span className={cn('italic', unverified ? 'text-slate-500 line-through decoration-slate-400' : 'text-slate-800')}>&ldquo;{quote}&rdquo;</span>
        <span className="ml-2 whitespace-nowrap text-xs font-medium text-brand-700 group-hover:underline">Turn {turn} &rarr;</span>
      </span>
    </button>
  );
}

function DimensionCard({ d, onJump }: { d: DimensionScore; onJump: (t: number, q: string) => void }) {
  const verified = d.evidence.filter((e) => e.verified);
  const unverified = d.evidence.filter((e) => !e.verified);
  const noEvidence = verified.length === 0;
  const tone = noEvidence ? 'neutral' : scoreTone(d.score);
  return (
    <li>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">{d.name}</h3>
          <div className="flex items-center gap-2">
            {noEvidence ? (
              <Badge tone="neutral">
                <CircleSlash className="h-3.5 w-3.5" aria-hidden /> No evidence
              </Badge>
            ) : (
              <Badge tone={tone}>{scoreLabel(d.score)}</Badge>
            )}
            <span className={cn('text-xl font-bold tabular-nums', noEvidence ? 'text-slate-400' : 'text-slate-900')}>
              {noEvidence ? '–' : d.score}
              <span className="sr-only"> out of 100</span>
            </span>
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className={cn('h-full rounded-full', barFill[tone])} style={{ width: noEvidence ? '0%' : `${d.score}%` }} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{d.feedback}</p>
        {verified.map((e, i) => (
          <QuoteButton key={i} quote={e.quote} turn={e.turn_index} onJump={onJump} />
        ))}
        {unverified.length > 0 && (
          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer select-none rounded">
              {unverified.length} unverified quote{unverified.length > 1 ? 's' : ''} discarded
            </summary>
            <p className="mt-1">These quotes were not found word-for-word in the transcript, so they did not count toward the score.</p>
            {unverified.map((e, i) => (
              <QuoteButton key={i} quote={e.quote} turn={e.turn_index} onJump={onJump} unverified />
            ))}
          </details>
        )}
      </Card>
    </li>
  );
}
