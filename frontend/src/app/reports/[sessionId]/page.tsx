import type { Metadata } from 'next';
import { ReportView } from './report-view';

export const metadata: Metadata = { title: 'Report' };

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ReportView sessionId={sessionId} />;
}
