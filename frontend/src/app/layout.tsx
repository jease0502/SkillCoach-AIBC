import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { ToastProvider } from '@/components/toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SkillCoach: practice the conversation before it counts', template: '%s · SkillCoach' },
  description:
    'AI role-play practice grounded in your company knowledge. Live compliance guard, live coaching and evidence-cited scoring, powered by Gemini on Google Cloud.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#4f46e5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
