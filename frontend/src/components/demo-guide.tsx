'use client';

import { CheckCircle2, Circle, CornerDownLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './ui';

/** Scenario B ("the guaranteed-return trap"): the 3-minute path that shows every feature once. */
const STEPS = [
  {
    title: 'Ask what matters to him',
    body: 'A discovery question builds trust.',
    line: 'Hi Mr. Tan, thanks for coming in. What matters most to you for this money?',
  },
  {
    title: 'Make the risky promise',
    body: 'Compliance Guard holds it before the customer hears it. Choose Send anyway to see the cost.',
    line: "Don't worry, this plan guarantees you 8% a year.",
  },
  {
    title: 'Correct it honestly',
    body: 'Watch trust recover and the coach adjust.',
    line: 'Let me correct that. The plan has averaged about 5.2% a year, but returns are not guaranteed and can go down as well as up.',
  },
  {
    title: 'End the session',
    body: 'The report fails the compliance gate and quotes your exact words as evidence.',
  },
];

export function DemoGuide({
  traineeTurns,
  ended,
  onUse,
  onDismiss,
}: {
  traineeTurns: number;
  ended: boolean;
  onUse: (line: string) => void;
  onDismiss: () => void;
}) {
  const current = ended ? STEPS.length : Math.min(traineeTurns, STEPS.length - 1);

  return (
    <Card className="border-brand-200 p-4 ring-1 ring-inset ring-brand-100">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">3-minute demo</h2>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide the demo guide"
          className="-m-1 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.title} className="flex gap-2.5" aria-current={active ? 'step' : undefined}>
              {done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Circle className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-slate-300')} aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', active ? 'font-semibold text-slate-900' : done ? 'text-slate-600' : 'text-slate-500')}>
                  {s.title}
                  {done && <span className="sr-only"> (done)</span>}
                </p>
                {active && (
                  <>
                    <p className="mt-0.5 text-xs text-slate-600">{s.body}</p>
                    {s.line && (
                      <button
                        type="button"
                        onClick={() => onUse(s.line)}
                        className="mt-2 flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-800 hover:border-brand-300 hover:bg-brand-50"
                      >
                        <span className="flex-1">&ldquo;{s.line}&rdquo;</span>
                        <span className="flex shrink-0 items-center gap-1 font-medium text-brand-700">
                          <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> Use
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
