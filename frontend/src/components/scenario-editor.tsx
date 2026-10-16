'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Play, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Persona, Scenario } from '@/lib/types';
import { useStartPractice } from '@/lib/use-start-practice';
import { Badge, Button, Card } from './ui';
import { ScenarioForm, validateScenario } from './scenario-form';
import { useToast } from './toast';

export function ScenarioEditor({ initial, persona }: { initial: Scenario; persona?: Persona | null }) {
  const router = useRouter();
  const toast = useToast();
  const { start, starting } = useStartPractice();
  const [scenario, setScenario] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'save' | 'delete' | null>(null);
  const [dirty, setDirty] = useState(!initial.id);
  const isNew = !scenario.id;

  const update = (s: Scenario) => {
    setScenario(s);
    setDirty(true);
    if (Object.keys(errors).length) setErrors(validateScenario(s));
  };

  const save = async (): Promise<Scenario | null> => {
    const errs = validateScenario(scenario);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast('error', 'Fix the highlighted fields first.');
      return null;
    }
    setSaving('save');
    try {
      const clean: Scenario = {
        ...scenario,
        success_criteria: scenario.success_criteria.filter((c) => c.trim()),
        rubric: scenario.rubric.filter((r) => r.name.trim()),
        compliance_rules: scenario.compliance_rules.filter((r) => r.rule.trim()),
        branch_events: scenario.branch_events.filter((b) => b.trigger.trim() && b.event.trim()),
      };
      const saved = isNew ? await api.createScenario(clean) : await api.updateScenario(clean);
      setScenario(saved);
      setDirty(false);
      toast('success', 'Scenario saved.');
      if (isNew) router.replace(`/scenarios/${saved.id}`);
      return saved;
    } catch (err) {
      toast('error', errorMessage(err));
      return null;
    } finally {
      setSaving(null);
    }
  };

  const saveAndStart = async () => {
    const saved = dirty || isNew ? await save() : scenario;
    if (saved) await start(saved.id);
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${scenario.title}"?`)) return;
    setSaving('delete');
    try {
      await api.deleteScenario(scenario.id);
      toast('success', 'Scenario deleted.');
      router.push('/scenarios');
    } catch (err) {
      toast('error', errorMessage(err));
      setSaving(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <ScenarioForm value={scenario} onChange={update} persona={persona} errors={errors} />
      <aside className="lg:sticky lg:top-20 lg:self-start" aria-label="Save and practice">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Ready to practice?</h2>
            {dirty ? <Badge tone="warn">{isNew ? 'Not saved' : 'Unsaved changes'}</Badge> : <Badge tone="good">Saved</Badge>}
          </div>
          <p className="text-sm text-slate-600">
            {scenario.rubric.length} rubric dimensions, {scenario.compliance_rules.length} compliance rules, {scenario.branch_events.length} branch events.
          </p>
          <Button onClick={saveAndStart} loading={!!starting} disabled={!!saving} icon={<Play className="h-4 w-4" aria-hidden />}>
            {dirty ? 'Save and start practice' : 'Start practice'}
          </Button>
          <Button variant="secondary" onClick={save} loading={saving === 'save'} disabled={!!saving || !dirty} icon={<Save className="h-4 w-4" aria-hidden />}>
            Save
          </Button>
          {!isNew && (
            <Button variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={remove} loading={saving === 'delete'} disabled={!!saving} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
              Delete scenario
            </Button>
          )}
        </Card>
      </aside>
    </div>
  );
}
