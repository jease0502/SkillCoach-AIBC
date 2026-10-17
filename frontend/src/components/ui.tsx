'use client';

import Link from 'next/link';
import { forwardRef, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { AlertCircle, AlertOctagon, AlertTriangle, BookOpen, Info, Loader2, X } from 'lucide-react';
import type { Citation, Severity } from '@/lib/types';
import { avatarClass, cn, initials, scoreTone, type Tone } from '@/lib/utils';

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-hover shadow-[0_1px_2px_rgba(30,30,35,0.12)] hover:shadow-[0_3px_9px_rgba(30,30,35,0.18)] disabled:bg-ink/60',
  secondary: 'bg-white/90 text-slate-800 ring-1 ring-inset ring-slate-200 hover:bg-white shadow-card',
  ghost: 'text-slate-700 hover:bg-slate-100',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors whitespace-nowrap',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variantClass[variant],
    sizeClass[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

// ---------- Layout primitives ----------

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('rounded-xl border border-glass bg-white/80 shadow-card backdrop-blur-xl', className)} {...rest} />;
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-base font-semibold text-slate-900">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-medium text-brand-700">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Status ----------

const toneClass: Record<Tone, string> = {
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  bad: 'bg-rose-50 text-rose-800 ring-rose-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
};

export function Badge({ tone = 'neutral', className, ...rest }: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', toneClass[tone], className)}
      {...rest}
    />
  );
}

const severityMeta: Record<Severity, { tone: Tone; label: string; Icon: typeof AlertOctagon }> = {
  high: { tone: 'bad', label: 'High risk', Icon: AlertOctagon },
  medium: { tone: 'warn', label: 'Medium risk', Icon: AlertTriangle },
  low: { tone: 'neutral', label: 'Low risk', Icon: Info },
};

/** Severity is always icon + text, never color alone. */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const { tone, label, Icon } = severityMeta[severity];
  return (
    <Badge tone={tone} className={className}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Badge>
  );
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-12 text-slate-500', className)}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}...</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
      <div className="flex items-center gap-2 font-medium">
        <AlertCircle className="h-5 w-5" aria-hidden />
        Something went wrong
      </div>
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-600">{description}</p>}
      {action}
    </div>
  );
}

// ---------- Forms ----------

export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  aside,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- Data display ----------

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm';
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', s, avatarClass(name), className)}>
      {initials(name) || '?'}
    </span>
  );
}

export function DifficultyDots({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('h-1.5 w-3 rounded-full', i <= value ? 'bg-brand-600' : 'bg-slate-200')} />
      ))}
    </span>
  );
}

const meterFill: Record<Tone, string> = {
  good: 'bg-emerald-600',
  warn: 'bg-amber-500',
  bad: 'bg-rose-600',
  neutral: 'bg-slate-400',
  brand: 'bg-brand-600',
};

/** Accessible horizontal meter with numeric label (value is never conveyed by color alone). */
export function Meter({
  label,
  value,
  tone,
  delta,
  icon,
  description,
}: {
  label: string;
  value: number;
  tone?: Tone;
  delta?: number | null;
  icon?: ReactNode;
  description?: string;
}) {
  const t = tone ?? scoreTone(value);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-slate-800">
          {icon}
          {label}
        </span>
        <span className="flex items-center gap-2 tabular-nums">
          {delta ? (
            <span key={`${value}-${delta}`} className={cn('animate-fade-up text-xs font-semibold', delta > 0 ? 'text-emerald-700' : 'text-rose-700')}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          ) : null}
          <span className="font-semibold text-slate-900">{value}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value} out of 100${description ? `, ${description}` : ''}`}
        className="h-2 overflow-hidden rounded-full bg-slate-100"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', meterFill[t])} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const ringStroke: Record<Tone, string> = {
  good: 'stroke-emerald-600',
  warn: 'stroke-amber-500',
  bad: 'stroke-rose-600',
  neutral: 'stroke-slate-400',
  brand: 'stroke-brand-600',
};

export function ScoreRing({ score, size = 132, label = 'Overall score' }: { score: number; size?: number; label?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${label}: ${score} out of 100`}>
        <circle cx="60" cy="60" r={r} className="fill-none stroke-slate-100" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className={cn('fill-none transition-[stroke-dashoffset] duration-700', ringStroke[tone])}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-slate-900">{score}</span>
        <span className="text-xs text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

/** Small source chip that reveals the cited passage in a popover. Keyboard: Enter/Space opens, Escape closes. */
/** One chip per source document; the popover lists every distinct quote cited from it. */
export function CitationChip({ title, citations, index }: { title: string; citations: Citation[]; index?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={popId}
        className="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200 hover:bg-sky-100"
      >
        <BookOpen className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">
          {index != null && <span className="sr-only">Source {index + 1}: </span>}
          {title}
        </span>
        {citations.length > 1 && (
          <span className="rounded bg-sky-100 px-1 tabular-nums text-sky-900">
            {citations.length}
            <span className="sr-only"> quotes</span>
          </span>
        )}
      </button>
      {open && (
        <span
          id={popId}
          role="dialog"
          aria-label={`Source: ${title}`}
          className="absolute left-0 top-full z-30 mt-1.5 block max-h-80 w-72 animate-fade-up overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lift"
        >
          <span className="mb-1 flex items-start justify-between gap-2">
            <span className="font-semibold text-slate-900">{title}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close source" className="rounded p-0.5 text-slate-500 hover:bg-slate-100">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
          {citations.map((c, i) => (
            <span key={`${c.chunk_id}-${i}`} className={cn('block', i > 0 && 'mt-2.5')}>
              <span className="block border-l-2 border-sky-300 pl-2 italic leading-relaxed">&ldquo;{c.quote}&rdquo;</span>
              <span className="mt-1 block font-mono text-[10px] text-slate-500">{c.chunk_id}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export function CitationList({ citations, className }: { citations: Citation[]; className?: string }) {
  if (!citations.length) return null;
  // Merge citations from the same document and drop repeated quotes, keeping first-seen order.
  const groups = new Map<string, Citation[]>();
  for (const c of citations) {
    const group = groups.get(c.document_title) ?? [];
    if (!group.some((g) => g.quote.trim() === c.quote.trim())) group.push(c);
    groups.set(c.document_title, group);
  }
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Sources">
      {[...groups].map(([title, group], i) => (
        <li key={title}>
          <CitationChip title={title} citations={group} index={i} />
        </li>
      ))}
    </ul>
  );
}
