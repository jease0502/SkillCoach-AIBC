'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, inputClass } from './ui';

/** Small tag marking a field as AI-generated until a human edits it. */
export function AiTag({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-inset ring-violet-200">
      <Sparkles className="h-3 w-3" aria-hidden />
      AI draft
    </span>
  );
}

export function FormSection({ title, description, children, aside }: { title: string; description?: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={id} className="font-semibold text-slate-900">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** Editable list of strings, one input per row. */
export function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  addLabel = 'Add',
  aside,
  multiline,
  rowAside,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  aside?: ReactNode;
  multiline?: boolean;
  rowAside?: (index: number) => ReactNode;
}) {
  const groupId = useId();
  return (
    <div role="group" aria-labelledby={groupId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span id={groupId} className="text-sm font-medium text-slate-800">
          {label}
        </span>
        {aside}
      </div>
      {values.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
      <ul className="flex flex-col gap-2">
        {values.map((v, i) => (
          <li key={i} className="flex items-start gap-2">
            {multiline ? (
              <textarea
                aria-label={`${label} ${i + 1}`}
                className={cn(inputClass, 'min-h-[60px]')}
                value={v}
                placeholder={placeholder}
                onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ) : (
              <input
                aria-label={`${label} ${i + 1}`}
                className={inputClass}
                value={v}
                placeholder={placeholder}
                onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
              />
            )}
            {rowAside && <span className="flex shrink-0 items-center pt-1.5">{rowAside(i)}</span>}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 px-0 text-slate-500"
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => onChange([...values, ''])}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** Comma/Enter separated tags. */
export function TagInput({ id, values, onChange, placeholder }: { id: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const commit = () => {
    const parts = text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length) onChange([...values, ...parts.filter((p) => !values.includes(p))]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-brand-600">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-sm text-slate-800">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="rounded p-0.5 text-slate-500 hover:bg-slate-200">
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={values.length ? '' : placeholder}
        className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm focus:outline-none focus:ring-0 focus-visible:outline-none"
      />
    </div>
  );
}

/** Range slider paired with a numeric input so values can be typed precisely. */
export function SliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  describedBy,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  describedBy?: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={describedBy}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-brand-600"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label}, exact value`}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        className={cn(inputClass, 'w-20 text-center tabular-nums')}
      />
    </div>
  );
}
