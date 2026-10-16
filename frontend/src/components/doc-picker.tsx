'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { ErrorState, Skeleton } from './ui';

/** Checkbox list of knowledge-base documents. */
export function DocPicker({ value, onChange, label = 'Documents' }: { value: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const { data, error, loading, reload } = useAsync(() => api.listDocuments(), []);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <Skeleton className="h-32" />;
  if (!data?.length)
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
        No documents yet.{' '}
        <Link href="/knowledge" className="font-medium text-brand-700 underline-offset-2 hover:underline">
          Upload your manuals and policies
        </Link>{' '}
        first.
      </p>
    );

  const all = value.length === data.length;
  return (
    <div role="group" aria-labelledby="doc-picker-label" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span id="doc-picker-label" className="text-sm font-medium text-slate-800">
          {label} <span className="font-normal text-slate-500">({value.length} selected)</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(all ? [] : data.map((d) => d.id))}
          className="rounded text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {all ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.map((d) => {
          const checked = value.includes(d.id);
          return (
            <li key={d.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors',
                  checked ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600"
                  checked={checked}
                  onChange={(e) => onChange(e.target.checked ? [...value, d.id] : value.filter((x) => x !== d.id))}
                />
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{d.title}</span>
                  <span className="text-xs text-slate-500">{d.chunk_count} passages</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
