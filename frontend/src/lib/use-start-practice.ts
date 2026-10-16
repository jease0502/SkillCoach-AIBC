'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { api, errorMessage } from './api';

/** Create a session for a scenario and open the practice screen. */
export function useStartPractice() {
  const router = useRouter();
  const toast = useToast();
  const [starting, setStarting] = useState<string | null>(null);

  /** `demo` opens the practice screen with the guided 3-minute demo panel. */
  const start = async (scenarioId: string, { demo = false }: { demo?: boolean } = {}) => {
    setStarting(scenarioId);
    try {
      const session = await api.createSession(scenarioId);
      router.push(`/practice/${session.id}${demo ? '?demo=1' : ''}`);
    } catch (err) {
      toast('error', errorMessage(err));
      setStarting(null);
    }
  };

  return { start, starting };
}
