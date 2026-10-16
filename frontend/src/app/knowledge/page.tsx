'use client';

import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { CheckCircle2, ClipboardPaste, FileText, Loader2, Search, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { SearchHit } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate } from '@/lib/utils';
import { Container } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorState, Field, PageHeader, Skeleton, inputClass } from '@/components/ui';
import { useToast } from '@/components/toast';

const ACCEPT = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown';
const MAX_MB = 20;

interface UploadItem {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  detail?: string;
}

export default function KnowledgePage() {
  const toast = useToast();
  const docs = useAsync(() => api.listDocuments(), []);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      if (!/\.(pdf|txt|md)$/i.test(file.name)) {
        setUploads((u) => [{ key, name: file.name, status: 'error', detail: 'Only PDF, TXT and Markdown files are supported.' }, ...u]);
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setUploads((u) => [{ key, name: file.name, status: 'error', detail: `Larger than ${MAX_MB} MB.` }, ...u]);
        continue;
      }
      setUploads((u) => [{ key, name: file.name, status: 'uploading' }, ...u]);
      try {
        const doc = await api.uploadDocument(file);
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: 'done', detail: `${doc.chunk_count} passages indexed` } : x)));
        docs.setData((d) => [doc, ...(d ?? []).filter((x) => x.id !== doc.id)]);
      } catch (err) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: 'error', detail: errorMessage(err) } : x)));
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
  };

  const onPaste = async (e: FormEvent) => {
    e.preventDefault();
    setPasting(true);
    try {
      const doc = await api.addTextDocument(pasteTitle.trim(), pasteText.trim());
      docs.setData((d) => [doc, ...(d ?? [])]);
      toast('success', `"${doc.title}" added with ${doc.chunk_count} passages.`);
      setPasteTitle('');
      setPasteText('');
      setShowPaste(false);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setPasting(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? Personas and scenarios that cite it keep their copies of the quotes.`)) return;
    setDeleting(id);
    try {
      await api.deleteDocument(id);
      docs.setData((d) => (d ?? []).filter((x) => x.id !== id));
      toast('success', `"${title}" deleted.`);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      setHits(await api.search(query.trim(), 5));
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const totalChunks = docs.data?.reduce((a, d) => a + d.chunk_count, 0) ?? 0;

  return (
    <Container>
      <PageHeader
        eyebrow="Knowledge base"
        title="Company knowledge"
        description="Upload product sheets, playbooks and policies. The AI customer only states facts from here, and every score cites it."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          {/* Upload */}
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Add documents</h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60',
              )}
            >
              <UploadCloud className={cn('h-10 w-10', dragging ? 'text-brand-600' : 'text-slate-400')} aria-hidden />
              <div>
                <p className="font-medium text-slate-900">Drag files here, or</p>
                <p className="text-sm text-slate-600">PDF, TXT or Markdown, up to {MAX_MB} MB each</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => fileRef.current?.click()} icon={<UploadCloud className="h-4 w-4" aria-hidden />}>
                  Choose files
                </Button>
                <Button variant="secondary" onClick={() => setShowPaste((s) => !s)} aria-expanded={showPaste} aria-controls="paste-form" icon={<ClipboardPaste className="h-4 w-4" aria-hidden />}>
                  Paste text
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-label="Upload documents"
                onChange={(e) => {
                  if (e.target.files) void uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {showPaste && (
              <form id="paste-form" onSubmit={onPaste} className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 p-4">
                <Field label="Title">
                  {(p) => <input {...p} required className={inputClass} value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Code of Conduct" />}
                </Field>
                <Field label="Text" hint="Separate sections with a blank line for cleaner passages.">
                  {(p) => <textarea {...p} required rows={6} className={inputClass} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />}
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={pasting} disabled={!pasteTitle.trim() || !pasteText.trim()}>
                    Add to knowledge base
                  </Button>
                  <Button variant="ghost" onClick={() => setShowPaste(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {uploads.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2" aria-live="polite" aria-label="Upload progress">
                {uploads.map((u) => (
                  <li key={u.key} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {u.status === 'uploading' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />
                    ) : u.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-600" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{u.name}</span>
                    <span className={cn('text-xs', u.status === 'error' ? 'text-rose-700' : 'text-slate-500')}>
                      {u.status === 'uploading' ? 'Extracting and embedding...' : u.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Documents */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Documents</h2>
              {docs.data && (
                <span className="text-sm text-slate-600">
                  {docs.data.length} documents &middot; {totalChunks} passages
                </span>
              )}
            </div>
            {docs.error ? (
              <div className="p-5">
                <ErrorState message={docs.error} onRetry={docs.reload} />
              </div>
            ) : docs.loading ? (
              <div className="flex flex-col gap-2 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : !docs.data?.length ? (
              <div className="p-5">
                <EmptyState icon={<FileText className="h-10 w-10" aria-hidden />} title="No documents yet" description="Start with a product sheet and a policy document." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Knowledge base documents</caption>
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 font-medium">
                        Title
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Passages
                      </th>
                      <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">
                        Added
                      </th>
                      <th scope="col" className="px-5 py-2.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docs.data.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900">{d.title}</div>
                              {d.filename && <div className="truncate text-xs text-slate-500">{d.filename}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={d.chunk_count > 0 ? 'good' : 'warn'}>{d.chunk_count}</Badge>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-3 text-slate-600 sm:table-cell">{formatDate(d.created_at, false)}</td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 px-0 text-slate-500 hover:text-rose-700"
                            aria-label={`Delete ${d.title}`}
                            loading={deleting === d.id}
                            onClick={() => remove(d.id, d.title)}
                          >
                            {deleting === d.id ? null : <Trash2 className="h-4 w-4" aria-hidden />}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Search tester */}
        <aside className="lg:sticky lg:top-20 lg:self-start" aria-labelledby="search-title">
          <Card className="p-5">
            <h2 id="search-title" className="mb-1 font-semibold text-slate-900">
              Test a search
            </h2>
            <p className="mb-4 text-sm text-slate-600">See which passages the AI customer and the coach will retrieve.</p>
            <form onSubmit={search} role="search" className="flex gap-2">
              <label htmlFor="kb-query" className="sr-only">
                Search query
              </label>
              <input
                id="kb-query"
                type="search"
                className={inputClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Can I promise a return?"
              />
              <Button type="submit" loading={searching} disabled={!query.trim()} className="w-10 shrink-0 px-0" aria-label="Search">
                {searching ? null : <Search className="h-4 w-4" aria-hidden />}
              </Button>
            </form>
            {searchError && <p className="mt-3 text-sm text-rose-700">{searchError}</p>}
            {hits && (
              <ol className="mt-4 flex flex-col gap-3" aria-label="Search results">
                {hits.length === 0 && <li className="text-sm text-slate-600">No matching passages.</li>}
                {hits.map((h, i) => (
                  <li key={h.chunk.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-slate-800">
                        {i + 1}. {h.document_title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-slate-600">
                        <span aria-hidden className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-100">
                          <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.round(h.score * 100)}%` }} />
                        </span>
                        {h.score.toFixed(2)}
                        <span className="sr-only"> relevance</span>
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">{h.chunk.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </Container>
  );
}
