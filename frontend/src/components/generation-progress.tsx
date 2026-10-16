'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui';

/**
 * Staged progress for long Gemini generations (20-50 s). The server does not stream progress,
 * so stages advance on a schedule and the last one holds until the request resolves.
 */
export function GenerationProgress({
  stages,
  stepMs = 7000,
  title,
  titleId,
  note = 'Gemini usually takes 20 to 50 seconds. You can keep editing elsewhere.',
  onCancel,
  className,
}: {
  stages: string[];
  stepMs?: number;
  title: string;
  titleId?: string;
  note?: string;
  onCancel?: () => void;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(id);
  }, []);
  const active = Math.min(stages.length - 1, Math.floor(elapsed / stepMs));

  return (
    <div className={cn('rounded-xl border border-brand-200 bg-brand-50/50 p-5', className)} role="status" aria-live="polite">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={titleId} className="font-semibold text-slate-900">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-slate-600">{Math.floor(elapsed / 1000)}s</span>
      </div>
      <ol className="flex flex-col gap-2.5">
        {stages.map((s, i) => (
          <li key={s} className="flex items-center gap-2.5 text-sm">
            {i < active ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            ) : i === active ? (
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 text-slate-300" aria-hidden />
            )}
            <span className={cn(i === active ? 'font-medium text-slate-900' : i < active ? 'text-slate-700' : 'text-slate-500')}>
              {s}
              {i === active && <span className="sr-only"> (in progress)</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden>
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(95, ((active + Math.min(1, (elapsed % stepMs) / stepMs)) / stages.length) * 100)}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600">
        <span>{note}</span>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/** Stages shown while POST /api/sessions/{id}/end builds the report (typically about 10 s). */
export const REPORT_STAGES = [
  'Reading the transcript',
  'Verifying evidence quotes',
  'Scoring rubric',
  'Checking compliance gate',
  'Writing feedback',
];
export const REPORT_NOTE = 'Every quote is matched against the transcript. This usually takes about 10 seconds.';
