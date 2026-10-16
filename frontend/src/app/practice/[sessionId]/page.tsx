import type { Metadata } from 'next';
import { PracticeView } from './practice-view';

export const metadata: Metadata = { title: 'Practice' };

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const [{ sessionId }, { demo }] = await Promise.all([params, searchParams]);
  return <PracticeView sessionId={sessionId} demo={demo === '1'} />;
}
