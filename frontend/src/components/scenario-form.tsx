'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { Citation, Persona, Scenario, Severity } from '@/lib/types';
import { cn, difficultyLabel, newId } from '@/lib/utils';
import { Avatar, Button, CitationList, Field, SeverityBadge, inputClass } from './ui';
import { FormSection, SliderField, StringListEditor } from './form-bits';

export function validateScenario(s: Scenario): Record<string, string> {
  const e: Record<string, string> = {};
  if (!s.title.trim()) e.title = 'Add a title.';
  if (!s.persona_id) e.persona_id = 'Pick a persona.';
  if (!s.trainee_goal.trim()) e.trainee_goal = 'Describe what the trainee should achieve.';
  if (!s.rubric.some((r) => r.name.trim())) e.rubric = 'Add at least one rubric dimension.';
  return e;
}

function citesFor(citations: Citation[], all: Citation[], supports: string) {
  return [...citations, ...all.filter((c) => c.supports === supports)];
}

export function ScenarioForm({
  value,
  onChange,
  persona,
  errors = {},
}: {
  value: Scenario;
  onChange: (s: Scenario) => void;
  persona?: Persona | null;
  errors?: Record<string, string>;
}) {
  const set = <K extends keyof Scenario>(k: K, v: Scenario[K]) => onChange({ ...value, [k]: v });
  const allRuleCites = value.compliance_rules.flatMap((r) => r.citations);
  const totalWeight = value.rubric.reduce((a, r) => a + (Number(r.weight) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Overview">
        {persona && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <Avatar name={persona.name} size="sm" />
            <div className="text-sm">
              <span className="font-medium text-slate-900">{persona.name}</span>
              <span className="text-slate-600">, {persona.title}</span>
            </div>
          </div>
        )}
        <Field label="Title" error={errors.title}>
          {(p) => <input {...p} className={inputClass} value={value.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label="Description" hint="Shown on the scenario card.">
          {(p) => <textarea {...p} rows={2} className={inputClass} value={value.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <Field label="Trainee goal" error={errors.trainee_goal}>
          {(p) => <textarea {...p} rows={2} className={inputClass} value={value.trainee_goal} onChange={(e) => set('trainee_goal', e.target.value)} />}
        </Field>
        <Field label="Context" hint="Where and why the conversation happens.">
          {(p) => <textarea {...p} rows={2} className={inputClass} value={value.context} onChange={(e) => set('context', e.target.value)} />}
        </Field>
        <Field
          label="Opening line override"
          hint={
            persona?.opening_line
              ? `Leave empty to use ${persona.name}'s line: "${persona.opening_line}"`
              : 'Spoken verbatim as the first customer turn. Leave empty to use the persona’s opening line.'
          }
        >
          {(p) => (
            <textarea {...p} rows={2} className={inputClass} value={value.opening_line ?? ''} onChange={(e) => set('opening_line', e.target.value || null)} />
          )}
        </Field>
        <StringListEditor label="Success criteria" values={value.success_criteria} onChange={(v) => set('success_criteria', v)} addLabel="Add criterion" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={<span>Difficulty: <span className="font-normal text-slate-600">{difficultyLabel(value.difficulty)}</span></span>}>
            {(p) => <SliderField id={p.id} label="Difficulty" min={1} max={5} value={value.difficulty} onChange={(v) => set('difficulty', v)} />}
          </Field>
          <Field label="Maximum trainee turns">
            {(p) => <SliderField id={p.id} label="Maximum trainee turns" min={3} max={30} value={value.max_turns} onChange={(v) => set('max_turns', v)} />}
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Scoring rubric"
        description="The dimensions the final report scores. Every score must quote the trainee's own words."
        aside={<span className="text-xs text-slate-500">Total weight {totalWeight.toFixed(1)}</span>}
      >
        {errors.rubric && <p className="text-sm font-medium text-rose-700">{errors.rubric}</p>}
        <ul className="flex flex-col gap-3">
          {value.rubric.map((r, i) => (
            <li key={r.id} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[180px_1fr_90px_auto]">
              <input
                aria-label={`Rubric ${i + 1} name`}
                className={inputClass}
                value={r.name}
                placeholder="Name"
                onChange={(e) => set('rubric', value.rubric.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
              />
              <input
                aria-label={`Rubric ${i + 1} description`}
                className={inputClass}
                value={r.description}
                placeholder="What good looks like"
                onChange={(e) => set('rubric', value.rubric.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)))}
              />
              <input
                aria-label={`Rubric ${i + 1} weight`}
                type="number"
                step={0.5}
                min={0}
                className={cn(inputClass, 'tabular-nums')}
                value={r.weight}
                onChange={(e) => set('rubric', value.rubric.map((x) => (x.id === r.id ? { ...x, weight: Number(e.target.value) } : x)))}
              />
              <Button variant="ghost" size="sm" className="h-9 w-9 px-0 text-slate-500" aria-label={`Remove rubric ${r.name || i + 1}`} onClick={() => set('rubric', value.rubric.filter((x) => x.id !== r.id))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
              {citesFor([], allRuleCites, `rubric:${r.id}`).length > 0 && (
                <div className="sm:col-span-4">
                  <CitationList citations={citesFor([], allRuleCites, `rubric:${r.id}`)} />
                </div>
              )}
            </li>
          ))}
        </ul>
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => set('rubric', [...value.rubric, { id: newId('r'), name: '', description: '', weight: 1 }])}
          >
            Add dimension
          </Button>
        </div>
      </FormSection>

      <FormSection title="Compliance rules" description="Checked on every trainee message. High-severity rules are held back by the Compliance Guard and fail the report gate.">
        <ul className="flex flex-col gap-3">
          {value.compliance_rules.map((r, i) => (
            <li key={`${r.id}-${i}`} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="grid gap-2 sm:grid-cols-[110px_1fr_140px_auto]">
                <input
                  aria-label={`Rule ${i + 1} id`}
                  className={cn(inputClass, 'font-mono')}
                  value={r.id}
                  onChange={(e) => set('compliance_rules', value.compliance_rules.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
                />
                <input
                  aria-label={`Rule ${i + 1} text`}
                  className={inputClass}
                  value={r.rule}
                  placeholder="Never promise guaranteed returns"
                  onChange={(e) => set('compliance_rules', value.compliance_rules.map((x, j) => (j === i ? { ...x, rule: e.target.value } : x)))}
                />
                <select
                  aria-label={`Rule ${i + 1} severity`}
                  className={inputClass}
                  value={r.severity}
                  onChange={(e) => set('compliance_rules', value.compliance_rules.map((x, j) => (j === i ? { ...x, severity: e.target.value as Severity } : x)))}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 px-0 text-slate-500"
                  aria-label={`Remove rule ${r.id || i + 1}`}
                  onClick={() => set('compliance_rules', value.compliance_rules.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <SeverityBadge severity={r.severity} />
                {r.citations.length > 0 ? (
                  <>
                    Source: <CitationList citations={r.citations} />
                  </>
                ) : (
                  <span>No source passage. Consider adding the policy to the knowledge base.</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() =>
              set('compliance_rules', [
                ...value.compliance_rules,
                { id: `R-${String(value.compliance_rules.length + 1).padStart(2, '0')}`, rule: '', severity: 'medium', citations: [] },
              ])
            }
          >
            Add rule
          </Button>
        </div>
      </FormSection>

      <FormSection title="Branch events" description="Twists the customer introduces when a condition is met, for example turn >= 4 or trust < 30.">
        <ul className="flex flex-col gap-2">
          {value.branch_events.map((b, i) => (
            <li key={b.id} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
              <input
                aria-label={`Branch ${i + 1} trigger`}
                className={cn(inputClass, 'font-mono')}
                value={b.trigger}
                placeholder="trust < 30"
                onChange={(e) => set('branch_events', value.branch_events.map((x) => (x.id === b.id ? { ...x, trigger: e.target.value } : x)))}
              />
              <input
                aria-label={`Branch ${i + 1} event`}
                className={inputClass}
                value={b.event}
                placeholder="Mentions a cheaper competitor"
                onChange={(e) => set('branch_events', value.branch_events.map((x) => (x.id === b.id ? { ...x, event: e.target.value } : x)))}
              />
              <Button variant="ghost" size="sm" className="h-9 w-9 px-0 text-slate-500" aria-label={`Remove branch ${i + 1}`} onClick={() => set('branch_events', value.branch_events.filter((x) => x.id !== b.id))}>
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
            onClick={() => set('branch_events', [...value.branch_events, { id: newId('b'), trigger: '', event: '' }])}
          >
            Add branch event
          </Button>
        </div>
      </FormSection>
    </div>
  );
}
