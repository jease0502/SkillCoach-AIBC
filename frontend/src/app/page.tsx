'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, BookOpen, FileSearch, MessageSquareQuote, PlayCircle, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { useStartPractice } from '@/lib/use-start-practice';
import { Card, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { ScenarioCard } from '@/components/scenario-card';

const pillars = [
  {
    Icon: BookOpen,
    title: 'Grounded in your knowledge',
    body: 'The AI customer only states facts from your product sheets and policies, and every reply shows its source.',
  },
  {
    Icon: ShieldCheck,
    title: 'Compliance Guard, live',
    body: 'A risky promise is caught before it reaches the customer, with the rule it breaks and a safer way to say it.',
  },
  {
    Icon: MessageSquareQuote,
    title: 'Every score quotes you',
    body: 'The report backs each score with your exact words. Quotes that are not in the transcript are thrown out.',
  },
  {
    Icon: BarChart3,
    title: 'Readiness, not activity',
    body: 'Managers see team skill gaps and who passed the compliance gate, so coaching time goes where it matters.',
  },
];

const steps = [
  { Icon: FileSearch, title: 'Upload knowledge', body: 'Manuals, playbooks and codes of conduct.', href: '/knowledge' },
  { Icon: UserRound, title: 'Approve AI customers', body: 'Personas generated from your documents, with sources.', href: '/personas' },
  { Icon: Sparkles, title: 'Practice and get scored', body: 'Live coaching, compliance checks and an evidence report.', href: '/scenarios' },
];

export default function HomePage() {
  const { data, error, loading, reload } = useAsync(() => Promise.all([api.listScenarios(), api.listPersonas()]), []);
  const { start, starting } = useStartPractice();

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_0%,theme(colors.brand.100),transparent_70%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200">
              <Sparkles className="h-4 w-4" aria-hidden /> AI role-play coach, powered by Gemini on Google Cloud
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Practice the conversation <span className="text-brand-700">before it counts.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              New advisors and reps learn on real customers, and one wrong promise can become a conduct failure. SkillCoach turns your own manuals and
              policies into realistic AI customers, coaches every turn, and scores each skill with your exact words as evidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/demo" size="lg" icon={<PlayCircle className="h-5 w-5" aria-hidden />} aria-describedby="demo-desc">
                Try the 3-minute demo
              </LinkButton>
              <LinkButton href="/dashboard" size="lg" variant="secondary">
                See the manager view
              </LinkButton>
            </div>
            <p id="demo-desc" className="mt-3 text-sm text-slate-600">
              A recently retired teacher asks you to promise he won&rsquo;t lose his savings. A guide walks you through it. No sign-up.
            </p>
          </div>

          {/* Product preview */}
          <div aria-hidden className="relative hidden lg:block">
            <Card className="rotate-1 p-5 shadow-lift">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">MT</span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Mr. Tan</div>
                  <div className="text-xs text-slate-500">Recently retired, cautious</div>
                </div>
              </div>
              <div className="mb-3 max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 px-4 py-2.5 text-sm text-slate-800">
                Can you promise I won&rsquo;t lose any of it?
              </div>
              <div className="mb-2 ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-white px-4 py-2.5 text-sm text-slate-900 ring-2 ring-rose-300">
                Don&rsquo;t worry, this plan <mark className="rounded bg-rose-100 px-0.5 text-rose-900 underline decoration-rose-600 decoration-wavy">guarantees you 8% a year</mark>.
              </div>
              <div className="ml-auto flex max-w-[85%] items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b className="font-mono">CC-01</b> High risk. Never promise guaranteed returns on investment-linked products.
                </span>
              </div>
            </Card>
            <Card className="relative -ml-8 -mt-3 w-64 -rotate-2 p-4 shadow-lift">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Coach</div>
              <p className="text-sm text-slate-700">Give the historical average and say returns can go down as well as up.</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section aria-labelledby="why-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 id="why-title" className="sr-only">
          Why SkillCoach
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Quick start */}
      <section id="practice" aria-labelledby="practice-title" className="scroll-mt-20 border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="practice-title" className="text-2xl font-semibold tracking-tight text-slate-900">
                Start practicing in one click
              </h2>
              <p className="mt-2 text-slate-600">Ready-made scenarios with demo knowledge. Pick one and say hello.</p>
            </div>
            <Link href="/scenarios" className="flex items-center gap-1 rounded text-sm font-medium text-brand-700 hover:text-brand-800">
              All scenarios <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading || !data ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-3">
              {data[0].slice(0, 3).map((s) => (
                <li key={s.id}>
                  <ScenarioCard
                    scenario={s}
                    persona={data[1].find((p) => p.id === s.persona_id)}
                    onStart={() => start(s.id)}
                    starting={starting === s.id}
                    showEdit={false}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 id="how-title" className="mb-8 text-2xl font-semibold tracking-tight text-slate-900">
          Set up for your team in three steps
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map(({ Icon, title, body, href }, i) => (
            <li key={title}>
              <Link
                href={href}
                className="group flex h-full items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{i + 1}</span>
                <span>
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    <Icon className="h-4 w-4 text-brand-600" aria-hidden />
                    {title}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">{body}</span>
                </span>
                <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
