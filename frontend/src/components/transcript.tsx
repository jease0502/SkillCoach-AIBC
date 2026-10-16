'use client';

import { forwardRef, type ReactNode } from 'react';
import { ShieldAlert, ShieldQuestion } from 'lucide-react';
import type { ComplianceFlag, Turn } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, CitationList, SeverityBadge } from './ui';

interface Range {
  start: number;
  end: number;
  kind: 'high' | 'medium' | 'low' | 'evidence';
  label: string;
}

function findRanges(text: string, flags: ComplianceFlag[], evidenceQuotes: string[]): Range[] {
  const lower = text.toLowerCase();
  const ranges: Range[] = [];
  const add = (quote: string, kind: Range['kind'], label: string) => {
    const q = quote.trim().toLowerCase();
    if (!q) return;
    const start = lower.indexOf(q);
    if (start === -1) return;
    const end = start + q.length;
    if (ranges.some((r) => start < r.end && end > r.start)) return; // keep first, avoid overlaps
    ranges.push({ start, end, kind, label });
  };
  flags.forEach((f) => add(f.quote, f.severity, `Compliance flag ${f.rule_id}`));
  evidenceQuotes.forEach((q) => add(q, 'evidence', 'Quoted as evidence'));
  return ranges.sort((a, b) => a.start - b.start);
}

const markClass: Record<Range['kind'], string> = {
  high: 'bg-rose-100 text-rose-900 decoration-rose-600',
  medium: 'bg-amber-100 text-amber-950 decoration-amber-600',
  low: 'bg-slate-200 text-slate-900 decoration-slate-500',
  evidence: 'bg-brand-100 text-brand-900 decoration-brand-600',
};

/** Render text with compliance quotes and evidence quotes highlighted inline. */
export function HighlightedText({ text, flags = [], evidence = [] }: { text: string; flags?: ComplianceFlag[]; evidence?: string[] }) {
  const ranges = findRanges(text, flags, evidence);
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    out.push(
      <mark key={i} className={cn('rounded px-0.5 underline decoration-2 underline-offset-2', r.kind === 'evidence' ? '' : 'decoration-wavy', markClass[r.kind])}>
        <span className="sr-only">{r.label}: </span>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

export function FlagList({ flags }: { flags: ComplianceFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5" aria-label="Compliance flags on this message">
      {flags.map((f, i) => (
        <li
          key={`${f.rule_id}-${i}`}
          className={cn(
            'flex animate-fade-up items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs',
            f.severity === 'high' ? 'border-rose-200 bg-rose-50' : f.severity === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50',
          )}
        >
          <ShieldAlert className={cn('mt-0.5 h-4 w-4 shrink-0', f.severity === 'high' ? 'text-rose-700' : f.severity === 'medium' ? 'text-amber-700' : 'text-slate-600')} aria-hidden />
          <div className="flex-1 text-slate-800">
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono font-semibold">{f.rule_id}</span>
              <SeverityBadge severity={f.severity} />
            </div>
            {f.message}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface BubbleProps {
  turn: Turn;
  customerName: string;
  evidence?: string[];
  highlighted?: boolean;
  children?: ReactNode;
}

export const TurnBubble = forwardRef<HTMLLIElement, BubbleProps>(function TurnBubble({ turn, customerName, evidence, highlighted, children }, ref) {
  const isTrainee = turn.role === 'trainee';
  return (
    <li
      ref={ref}
      id={`turn-${turn.index}`}
      tabIndex={-1}
      aria-label={`Turn ${turn.index}, ${isTrainee ? 'you' : customerName}`}
      className={cn('flex animate-fade-up scroll-mt-24 gap-3 rounded-xl focus:outline-none', isTrainee ? 'flex-row-reverse' : 'flex-row', highlighted && 'animate-flash')}
    >
      {isTrainee ? (
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          You
        </span>
      ) : (
        <Avatar name={customerName} size="sm" />
      )}
      <div className={cn('flex max-w-[85%] flex-col sm:max-w-[75%]', isTrainee ? 'items-end' : 'items-start')}>
        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{isTrainee ? 'You' : customerName}</span>
          <span aria-hidden>&middot;</span>
          <span>Turn {turn.index}</span>
        </div>
        <div
          className={cn(
            'whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
            !isTrainee
              ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-900'
              : turn.compliance.length > 0
                ? 'rounded-tr-sm bg-white text-slate-900 ring-2 ring-rose-300'
                : 'rounded-tr-sm bg-brand-600 text-white',
            highlighted && 'ring-2 ring-brand-500 ring-offset-2',
          )}
        >
          <HighlightedText text={turn.text} flags={turn.compliance} evidence={evidence} />
          {children}
        </div>
        {isTrainee && <FlagList flags={turn.compliance} />}
        {!isTrainee && turn.compliance.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1" aria-label="Grounding check on this reply">
            {turn.compliance.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-900">
                <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">Unverified claim:</span> {f.message}
                </span>
              </li>
            ))}
          </ul>
        )}
        {turn.citations.length > 0 && <CitationList citations={turn.citations} className="mt-2" />}
      </div>
    </li>
  );
});
