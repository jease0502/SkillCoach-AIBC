'use client';

import Link from 'next/link';
import { Pencil, Play, ShieldCheck } from 'lucide-react';
import type { Persona, Scenario } from '@/lib/types';
import { Avatar, Button, Card, DifficultyDots, buttonClass } from './ui';

export function ScenarioCard({
  scenario,
  persona,
  onStart,
  starting,
  showEdit = true,
}: {
  scenario: Scenario;
  persona?: Persona;
  onStart: () => void;
  starting?: boolean;
  showEdit?: boolean;
}) {
  const highRules = scenario.compliance_rules.filter((r) => r.severity === 'high').length;
  return (
    <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-lift">
      <div className="mb-3 flex items-center gap-3">
        {persona ? <Avatar name={persona.name} /> : <Avatar name="?" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{persona?.name ?? 'Unknown persona'}</div>
          <div className="truncate text-xs text-slate-600">{persona?.title}</div>
        </div>
        <DifficultyDots value={scenario.difficulty} />
      </div>
      <h2 className="font-semibold leading-snug text-slate-900">{scenario.title}</h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{scenario.description}</p>
      <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <div className="flex gap-1">
          <dt>Skills scored:</dt>
          <dd className="font-medium text-slate-800">{scenario.rubric.length}</dd>
        </div>
        <div className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          <dt>Compliance rules:</dt>
          <dd className="font-medium text-slate-800">
            {scenario.compliance_rules.length}
            {highRules > 0 && ` (${highRules} high)`}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
        <Button onClick={onStart} loading={starting} className="flex-1" icon={<Play className="h-4 w-4" aria-hidden />} aria-label={`Start practice: ${scenario.title}`}>
          Start practice
        </Button>
        {showEdit && (
          <Link href={`/scenarios/${scenario.id}`} className={buttonClass('secondary', 'md', 'px-3')} aria-label={`Edit ${scenario.title}`}>
            <Pencil className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </Card>
  );
}
