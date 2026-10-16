'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, BookOpenCheck, MessagesSquare, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Persona } from '@/lib/types';
import { Badge, Button, Card, CitationList } from './ui';
import { PersonaForm, validatePersona } from './persona-form';
import { useToast } from './toast';

/**
 * Shared editor for new drafts and saved personas.
 * Flow: generated draft -> review sources -> save draft -> approve (only approved personas back scenarios).
 */
export function PersonaEditor({ initial, aiGenerated }: { initial: Persona; aiGenerated?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [persona, setPersona] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'draft' | 'approve' | 'delete' | null>(null);
  const [reviewed, setReviewed] = useState(persona.citations.length === 0);
  const [dirty, setDirty] = useState(!initial.id);

  const isNew = !persona.id;
  const approved = persona.status === 'approved' && !dirty;

  const update = (p: Persona) => {
    setPersona(p);
    setDirty(true);
    if (Object.keys(errors).length) setErrors(validatePersona(p));
  };

  const persist = async (): Promise<Persona | null> => {
    const errs = validatePersona(persona);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast('error', 'Fix the highlighted fields first.');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return null;
    }
    const clean: Persona = {
      ...persona,
      goals: persona.goals.filter((g) => g.trim()),
      hidden_needs: persona.hidden_needs.filter((g) => g.trim()),
      objections: persona.objections.filter((o) => o.text.trim()),
      // Editing an approved persona sends it back to review.
      status: dirty ? 'draft' : persona.status,
    };
    const saved = isNew ? await api.createPersona(clean) : await api.updatePersona(clean);
    setPersona(saved);
    setDirty(false);
    return saved;
  };

  const saveDraft = async () => {
    setSaving('draft');
    try {
      const saved = await persist();
      if (saved) {
        toast('success', `${saved.name} saved as a draft.`);
        if (isNew) router.replace(`/personas/${saved.id}`);
      }
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const approve = async () => {
    setSaving('approve');
    try {
      const saved = dirty || isNew ? await persist() : persona;
      if (!saved) return;
      const ok = await api.approvePersona(saved.id);
      setPersona(ok);
      setDirty(false);
      toast('success', `${ok.name} is approved and can be used in scenarios.`);
      if (isNew) router.replace(`/personas/${ok.id}`);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${persona.name}? Scenarios that use this persona will stop working.`)) return;
    setSaving('delete');
    try {
      await api.deletePersona(persona.id);
      toast('success', 'Persona deleted.');
      router.push('/personas');
    } catch (err) {
      toast('error', errorMessage(err));
      setSaving(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <PersonaForm value={persona} onChange={update} aiGenerated={aiGenerated} errors={errors} />

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start" aria-label="Review and save">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Status</h2>
            {approved ? (
              <Badge tone="good">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Approved
              </Badge>
            ) : (
              <Badge tone="warn">{isNew ? 'Unsaved draft' : dirty ? 'Unsaved changes' : 'Draft'}</Badge>
            )}
          </div>
          <p className="mb-4 text-sm text-slate-600">
            {approved
              ? 'This persona can be used in scenarios. Editing it sends it back to review.'
              : 'Generated content stays a draft until a person reviews the sources and approves it.'}
          </p>

          {persona.citations.length > 0 && (
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <BookOpenCheck className="h-4 w-4 text-sky-700" aria-hidden /> Grounded in {persona.citations.length} source
                {persona.citations.length > 1 ? 's' : ''}
              </h3>
              <CitationList citations={persona.citations} />
              {!approved && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" />
                  I reviewed the sources and the persona is fictional.
                </label>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {!approved && (
              <Button onClick={approve} loading={saving === 'approve'} disabled={!!saving || !reviewed} icon={<BadgeCheck className="h-4 w-4" aria-hidden />}>
                {isNew || dirty ? 'Save and approve' : 'Approve'}
              </Button>
            )}
            <Button variant="secondary" onClick={saveDraft} loading={saving === 'draft'} disabled={!!saving || (!dirty && !isNew)} icon={<Save className="h-4 w-4" aria-hidden />}>
              Save draft
            </Button>
            {approved && (
              <Button variant="subtle" onClick={() => router.push(`/scenarios/new?persona=${persona.id}`)} icon={<MessagesSquare className="h-4 w-4" aria-hidden />}>
                Use in a new scenario
              </Button>
            )}
            {!isNew && (
              <Button variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={remove} loading={saving === 'delete'} disabled={!!saving} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
                Delete persona
              </Button>
            )}
          </div>
        </Card>
      </aside>
    </div>
  );
}
