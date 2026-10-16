'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Citation, KnowledgeLevel, Persona } from '@/lib/types';
import { cn, difficultyLabel, newId } from '@/lib/utils';
import { Button, CitationList, Field, inputClass } from './ui';
import { AiTag, FormSection, SliderField, StringListEditor, TagInput } from './form-bits';

export const LOCALES = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'en-SG', label: 'English (Singapore)' },
  { value: 'en-IN', label: 'English (India)' },
];

export function emptyPersona(): Persona {
  return {
    id: '',
    name: '',
    title: '',
    age: null,
    industry: null,
    locale: 'en-US',
    summary: '',
    personality: [],
    communication_style: '',
    goals: [],
    hidden_needs: [],
    objections: [],
    knowledge_level: 'intermediate',
    difficulty: 3,
    initial_trust: 40,
    initial_patience: 70,
    opening_line: '',
    voice: null,
    avatar: null,
    source: 'manual',
    source_document_ids: [],
    citations: [],
    status: 'draft',
    created_at: new Date().toISOString(),
  };
}

export function validatePersona(p: Persona): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!p.name.trim()) errors.name = 'Give the persona a name.';
  if (!p.title.trim()) errors.title = 'Describe their role, for example "Owner of a 12-person bakery".';
  if (!p.summary.trim()) errors.summary = 'Add a short public summary.';
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(JSON.stringify(p)) || /\+?\d[\d\s-]{8,}\d/.test(p.summary + p.opening_line))
    errors.summary = errors.summary ?? 'Remove email addresses or phone numbers. Personas must be fictional.';
  return errors;
}

type Key = keyof Persona;

// Citation.supports uses singular attribute names: "objection:obj-2", "hidden_need:0", "goal:1", "summary".
const supportKind: Partial<Record<Key, string>> = {
  objections: 'objection',
  hidden_needs: 'hidden_need',
  goals: 'goal',
  personality: 'personality',
};

/** Citations backing a whole field ("summary") or one item of a list field ("hidden_need:0"). */
export function citationsFor(citations: Citation[], field: Key, item?: string | number) {
  const kind = supportKind[field] ?? field;
  return citations.filter((c) => {
    if (!c.supports) return false;
    const [k, ref] = c.supports.split(':');
    if (k !== kind && k !== field) return false;
    return item === undefined ? ref === undefined : ref === String(item);
  });
}

function RowSources({ citations }: { citations: Citation[] }) {
  return citations.length ? <CitationList citations={citations} /> : null;
}

export function PersonaForm({
  value,
  onChange,
  aiGenerated,
  errors = {},
}: {
  value: Persona;
  onChange: (p: Persona) => void;
  aiGenerated?: boolean;
  errors?: Record<string, string>;
}) {
  const [touched, setTouched] = useState<Set<Key>>(new Set());
  const set = <K extends Key>(k: K, v: Persona[K]) => {
    if (!touched.has(k)) setTouched((t) => new Set(t).add(k));
    onChange({ ...value, [k]: v });
  };
  const ai = (k: Key) => <AiTag show={!!aiGenerated && !touched.has(k)} />;
  const aside = (k: Key) => {
    const cites = citationsFor(value.citations, k);
    return (
      <span className="flex items-center gap-1.5">
        {cites.length > 0 && <CitationList citations={cites} />}
        {ai(k)}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Public profile" description="What the trainee sees before the session starts.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" error={errors.name} aside={aside('name')}>
            {(p) => <input {...p} className={inputClass} value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="Dana Kim" />}
          </Field>
          <Field label="Role" error={errors.title} aside={aside('title')}>
            {(p) => <input {...p} className={inputClass} value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="CFO of a 200-person logistics company" />}
          </Field>
          <Field label="Age" aside={aside('age')}>
            {(p) => (
              <input
                {...p}
                type="number"
                min={18}
                max={99}
                className={inputClass}
                value={value.age ?? ''}
                onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)}
              />
            )}
          </Field>
          <Field label="Industry" aside={aside('industry')}>
            {(p) => <input {...p} className={inputClass} value={value.industry ?? ''} onChange={(e) => set('industry', e.target.value || null)} placeholder="Insurance" />}
          </Field>
        </div>
        <Field label="Summary" error={errors.summary} aside={aside('summary')} hint="One or two sentences. Visible to the trainee.">
          {(p) => <textarea {...p} rows={3} className={inputClass} value={value.summary} onChange={(e) => set('summary', e.target.value)} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Voice language" hint="Used for speech recognition and the customer's voice.">
            {(p) => (
              <select {...p} className={inputClass} value={value.locale} onChange={(e) => set('locale', e.target.value)}>
                {LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Product knowledge" aside={aside('knowledge_level')}>
            {(p) => (
              <select {...p} className={inputClass} value={value.knowledge_level} onChange={(e) => set('knowledge_level', e.target.value as KnowledgeLevel)}>
                <option value="novice">Novice: needs plain explanations</option>
                <option value="intermediate">Intermediate: knows the basics</option>
                <option value="expert">Expert: tests the details</option>
              </select>
            )}
          </Field>
        </div>
      </FormSection>

      <FormSection title="How they talk" description="Personality and the line that opens every session.">
        <Field
          label="Opening line"
          aside={aside('opening_line')}
          hint="Spoken verbatim as the customer's first turn, so every session starts the same way. Scenarios can override it."
        >
          {(p) => (
            <textarea
              {...p}
              rows={2}
              className={inputClass}
              value={value.opening_line}
              onChange={(e) => set('opening_line', e.target.value)}
              placeholder="I have ten minutes. Why should I pay more?"
            />
          )}
        </Field>
        <Field label="Personality traits" hint="3 to 5 adjectives. Press Enter or comma to add." aside={aside('personality')}>
          {(p) => <TagInput id={p.id} values={value.personality} onChange={(v) => set('personality', v)} placeholder="skeptical, direct, busy" />}
        </Field>
        <Field label="Communication style" aside={aside('communication_style')}>
          {(p) => (
            <textarea
              {...p}
              rows={2}
              className={inputClass}
              value={value.communication_style}
              onChange={(e) => set('communication_style', e.target.value)}
              placeholder="Short sentences. Interrupts vague answers."
            />
          )}
        </Field>
      </FormSection>

      <FormSection title="Hidden layer" description="Only the AI customer, coach and scorer see this. The trainee has to discover it.">
        <StringListEditor
          label="Goals"
          values={value.goals}
          onChange={(v) => set('goals', v)}
          addLabel="Add goal"
          aside={aside('goals')}
          rowAside={(i) => <RowSources citations={citationsFor(value.citations, 'goals', i)} />}
        />
        <StringListEditor
          label="Hidden needs"
          values={value.hidden_needs}
          onChange={(v) => set('hidden_needs', v)}
          addLabel="Add hidden need"
          aside={aside('hidden_needs')}
          rowAside={(i) => <RowSources citations={citationsFor(value.citations, 'hidden_needs', i)} />}
          multiline
          placeholder="Revealed only when the trainee earns trust"
        />
        <div role="group" aria-labelledby="objections-label" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span id="objections-label" className="text-sm font-medium text-slate-800">
              Objections
            </span>
            {aside('objections')}
          </div>
          {value.objections.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <ul className="flex flex-col gap-2">
            {value.objections.map((o, i) => (
              <li key={o.id} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_200px_auto]">
                {(() => {
                  const cites = [...citationsFor(value.citations, 'objections', o.id), ...citationsFor(value.citations, 'objections', i)];
                  return cites.length ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-3">
                      Source: <CitationList citations={cites} />
                    </div>
                  ) : null;
                })()}
                <input
                  aria-label={`Objection ${i + 1} text`}
                  className={inputClass}
                  value={o.text}
                  placeholder="What they say"
                  onChange={(e) => set('objections', value.objections.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
                />
                <input
                  aria-label={`Objection ${i + 1} trigger`}
                  className={inputClass}
                  value={o.trigger}
                  placeholder="When, e.g. price is mentioned"
                  onChange={(e) => set('objections', value.objections.map((x) => (x.id === o.id ? { ...x, trigger: e.target.value } : x)))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 px-0 text-slate-500"
                  aria-label={`Remove objection ${i + 1}`}
                  onClick={() => set('objections', value.objections.filter((x) => x.id !== o.id))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              onClick={() => set('objections', [...value.objections, { id: newId('o'), text: '', trigger: '' }])}
            >
              Add objection
            </Button>
          </div>
        </div>
      </FormSection>

      <FormSection title="Difficulty and starting mood" description="Lower trust and patience make the customer harder to win over.">
        <Field label={<span>Difficulty: <span className="font-normal text-slate-600">{difficultyLabel(value.difficulty)}</span></span>} aside={aside('difficulty')}>
          {(p) => <SliderField id={p.id} label="Difficulty" min={1} max={5} value={value.difficulty} onChange={(v) => set('difficulty', v)} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Initial trust" hint="0 to 100">
            {(p) => <SliderField id={p.id} label="Initial trust" min={0} max={100} value={value.initial_trust} onChange={(v) => set('initial_trust', v)} />}
          </Field>
          <Field label="Initial patience" hint="0 to 100">
            {(p) => <SliderField id={p.id} label="Initial patience" min={0} max={100} value={value.initial_patience} onChange={(v) => set('initial_patience', v)} />}
          </Field>
        </div>
      </FormSection>
    </div>
  );
}

/** Compact preview card used in the persona list and the draft picker. */
export function PersonaSummary({ persona, className }: { persona: Persona; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-sm leading-relaxed text-slate-700">{persona.summary}</p>
      {persona.personality.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Personality">
          {persona.personality.map((t) => (
            <li key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
