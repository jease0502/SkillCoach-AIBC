'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { findDemoScenario } from '@/lib/demo';
import { ErrorState } from '@/components/ui';

/**
 * Entry point for the home page's "Try the 3-minute demo" link. A plain link works even before the
 * home page hydrates; this page then creates the session and replaces itself with the practice screen.
 */
export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    try {
      const scenario = findDemoScenario(await api.listScenarios());
      if (!scenario) throw new Error('No demo scenario is available yet.');
      const session = await api.createSession(scenario.id);
      router.replace(`/practice/${session.id}?demo=1`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      {error ? (
        <ErrorState message={error} onRetry={start} />
      ) : (
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden />
          <h1 className="font-semibold text-slate-900">Starting your demo</h1>
          <p className="text-sm text-slate-600">Setting up a conversation with Mr. Tan, a recently retired customer.</p>
        </div>
      )}
    </div>
  );
}
