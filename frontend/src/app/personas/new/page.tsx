'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, Check, FileSearch, PenLine, Sparkles, Wand2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Persona } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Container } from '@/components/app-shell';
import { Avatar, Badge, Button, Card, CitationList, DifficultyDots, ErrorState, Field, LinkButton, PageHeader, inputClass } from '@/components/ui';
import { LOCALES, PersonaSummary, emptyPersona } from '@/components/persona-form';
import { PersonaEditor } from '@/components/persona-editor';
import { DocPicker } from '@/components/doc-picker';
import { GenerationProgress } from '@/components/generation-progress';

type Path = 'brief' | 'documents' | 'manual';
type Step = 0 | 1 | 2;

const STEPS = ['Choose a starting point', 'Generate', 'Review and approve'];
const BRIEF_STAGES = ['Reading your brief', 'Searching your documents', 'Drafting the persona', 'Verifying citations'];
const DOC_STAGES = ['Reading your documents', 'Finding customer segments', 'Drafting personas', 'Verifying citations'];

const paths: { key: Path; title: string; description: string; Icon: typeof Sparkles }[] = [
  { key: 'brief', title: 'Describe a customer', description: 'One line in, a full persona out. Example: "cautious 45-year-old SME owner who already has insurance".', Icon: Wand2 },
  { key: 'documents', title: 'Find customers in my documents', description: 'Gemini reads your manuals and proposes 3 realistic customer types, each with sources.', Icon: FileSearch },
  { key: 'manual', title: 'Start blank', description: 'Fill in the form yourself. Best when you already know the customer well.', Icon: PenLine },
];

export default function NewPersonaPage() {
  const [step, setStep] = useState<Step>(0);
  const [path, setPath] = useState<Path>('brief');
  const [brief, setBrief] = useState('');
  const [locale, setLocale] = useState('en-US');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Persona[] | null>(null);
  const [picked, setPicked] = useState(0);
  const [result, setResult] = useState<{ persona: Persona; ai: boolean; n: number } | null>(null);
  const requestId = useRef(0);

  const choose = (p: Path) => {
    setPath(p);
    setError(null);
    setDrafts(null);
    if (p === 'manual') {
      setResult({ persona: emptyPersona(), ai: false, n: Date.now() });
      setStep(2);
    } else setStep(1);
  };

  const generate = async () => {
    const id = ++requestId.current;
    setGenerating(true);
    setError(null);
    try {
      if (path === 'brief') {
        const p = await api.generatePersona({ brief: brief.trim(), document_ids: docIds.length ? docIds : undefined, locale });
        if (id !== requestId.current) return;
        setResult({ persona: p, ai: true, n: Date.now() });
        setStep(2);
      } else {
        const list = await api.generatePersonasFromDocs({ document_ids: docIds.length ? docIds : undefined, count: 3, locale });
        if (id !== requestId.current) return;
        setDrafts(list);
        setPicked(0);
      }
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setGenerating(false);
    }
  };

  const cancel = () => {
    requestId.current++;
    setGenerating(false);
  };

  const confirmPick = () => {
    if (!drafts?.[picked]) return;
    setResult({ persona: drafts[picked], ai: true, n: Date.now() });
    setStep(2);
  };

  return (
    <Container>
      <LinkButton href="/personas" variant="ghost" size="sm" className="mb-4 -ml-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
        All personas
      </LinkButton>
      <PageHeader eyebrow="New persona" title="Create an AI customer" description="Every generated detail links back to the passage it came from, so you can check it before approving." />

      {/* Stepper */}
      <nav aria-label="Progress" className="mb-8">
        <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={label} className="flex items-center sm:flex-1">
                <button
                  type="button"
                  disabled={i > step || generating}
                  onClick={() => setStep(i as Step)}
                  aria-current={current ? 'step' : undefined}
                  className="flex items-center gap-2 rounded-lg py-1 pr-2 text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      done ? 'bg-brand-600 text-white' : current ? 'bg-white text-brand-700 ring-2 ring-brand-600' : 'bg-white text-slate-500 ring-1 ring-slate-300',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                  </span>
                  <span className={cn('text-sm font-medium', current ? 'text-slate-900' : 'text-slate-600')}>
                    {label}
                    {done && <span className="sr-only"> (completed)</span>}
                  </span>
                </button>
                {i < STEPS.length - 1 && <span aria-hidden className={cn('mx-3 hidden h-px flex-1 sm:block', done ? 'bg-brand-600' : 'bg-slate-200')} />}
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 0 && (
        <ul className="grid gap-4 md:grid-cols-3">
          {paths.map(({ key, title, description, Icon }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => choose(key)}
                className="group flex h-full w-full flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700 group-hover:bg-brand-100">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="font-semibold text-slate-900">{title}</span>
                <span className="text-sm leading-relaxed text-slate-600">{description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!generating) void generate();
              }}
              className="flex flex-col gap-5"
            >
              {path === 'brief' && (
                <Field label="Describe the customer in one line" hint="Who they are, what they want, and what makes them hard to convince.">
                  {(p) => (
                    <textarea
                      {...p}
                      rows={3}
                      required
                      className={inputClass}
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      placeholder="Cautious 45-year-old SME owner who already has insurance and thinks advisors are pushy"
                    />
                  )}
                </Field>
              )}
              <DocPicker
                value={docIds}
                onChange={setDocIds}
                label={path === 'brief' ? 'Ground it in documents (optional)' : 'Documents to read'}
              />
              <Field label="Voice language" className="sm:max-w-xs">
                {(p) => (
                  <select {...p} className={inputClass} value={locale} onChange={(e) => setLocale(e.target.value)}>
                    {LOCALES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={generating} disabled={path === 'brief' && !brief.trim()} icon={<Sparkles className="h-4 w-4" aria-hidden />}>
                  {path === 'brief' ? 'Generate persona' : drafts ? 'Regenerate 3 drafts' : 'Generate 3 drafts'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(0)} disabled={generating}>
                  Back
                </Button>
              </div>
            </form>
          </Card>

          {generating && (
            <GenerationProgress
              title={path === 'brief' ? 'Designing your persona' : 'Finding customers in your documents'}
              stages={path === 'brief' ? BRIEF_STAGES : DOC_STAGES}
              onCancel={cancel}
            />
          )}
          {error && <ErrorState message={error} onRetry={generate} />}

          {drafts && !generating && (
            <section aria-labelledby="drafts-title">
              <h2 id="drafts-title" className="mb-1 text-lg font-semibold text-slate-900">
                Pick a customer to refine
              </h2>
              <p className="mb-4 text-sm text-slate-600">Each draft cites the passages it is based on. Select a source to read it.</p>
              <div role="radiogroup" aria-labelledby="drafts-title" className="grid gap-4 lg:grid-cols-3">
                {drafts.map((d, i) => (
                  <DraftCard key={i} persona={d} selected={picked === i} onSelect={() => setPicked(i)} index={i} />
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <Button onClick={confirmPick} icon={<Check className="h-4 w-4" aria-hidden />}>
                  Use {drafts[picked]?.name ?? 'this persona'}
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {step === 2 && result && (
        <>
          {result.ai && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden />
              <p>
                <span className="font-semibold">This is an AI draft.</span> Fields marked &ldquo;AI draft&rdquo; were generated. Source chips show the passage each
                objection or hidden need came from. Edit anything, check the sources, then approve.
              </p>
            </div>
          )}
          <PersonaEditor key={result.n} initial={result.persona} aiGenerated={result.ai} />
        </>
      )}
    </Container>
  );
}

function DraftCard({ persona, selected, onSelect, index }: { persona: Persona; selected: boolean; onSelect: () => void; index: number }) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={selected || index === 0 ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onSelect();
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const radios = Array.from((e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []) as HTMLElement[]);
          const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
          const next = radios[(index + delta + radios.length) % radios.length];
          next?.focus();
          next?.click();
        }
      }}
      className={cn(
        'flex cursor-pointer flex-col gap-3 rounded-xl border-2 bg-white p-5 shadow-card transition-all',
        selected ? 'border-brand-600 ring-4 ring-brand-100' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={persona.name} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">{persona.name}</div>
          <div className="text-sm text-slate-600">{persona.title}</div>
        </div>
        <span
          aria-hidden
          className={cn('flex h-5 w-5 items-center justify-center rounded-full border-2', selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300')}
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
      </div>
      <PersonaSummary persona={persona} />
      {persona.objections.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Typical objections</div>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {persona.objections.slice(0, 3).map((o) => (
              <li key={o.id}>{o.text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <CitationList citations={persona.citations} />
          {persona.citations.length === 0 && <Badge tone="warn">No sources</Badge>}
        </div>
        <DifficultyDots value={persona.difficulty} />
      </div>
    </div>
  );
}
