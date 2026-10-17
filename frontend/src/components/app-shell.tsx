'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BarChart3, BookOpen, FlaskConical, History, LogIn, LogOut, Menu, MessagesSquare, UserRound, X } from 'lucide-react';
import { MOCK } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/scenarios', label: 'Scenarios', Icon: MessagesSquare },
  { href: '/personas', label: 'Personas', Icon: UserRound },
  { href: '/knowledge', label: 'Knowledge', Icon: BookOpen },
  { href: '/dashboard', label: 'Dashboard', Icon: BarChart3 },
];

/** Sign-in link, or the signed-in trainee with links to their history and sign-out. */
function AccountMenu() {
  const { account, ready, signOut } = useAuth();
  const pathname = usePathname();
  if (MOCK || !ready) return null;
  if (!account) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname || '/')}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50"
      >
        <LogIn className="h-4 w-4" aria-hidden /> Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/me"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        title="My practice history"
      >
        <History className="h-4 w-4" aria-hidden />
        <span className="max-w-[9rem] truncate">{account.guest ? 'Guest' : account.name}</span>
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9l-4 3v-3.5A3 3 0 0 1 4 13z" />
          <path d="m8.5 10.5 2 2 4-4" />
        </svg>
      </span>
      SkillCoach
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="SkillCoach home" className="rounded-lg">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden flex-1 md:block">
            <ul className="flex items-center gap-1">
              {nav.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive(href) ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {MOCK && (
              <span
                className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200 sm:inline-flex"
                title="NEXT_PUBLIC_MOCK=true: data comes from local fixtures"
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                Demo data
              </span>
            )}
            <AccountMenu />
            <button
              type="button"
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-slate-200 px-4 py-2 md:hidden">
            <ul>
              {nav.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(href) ? 'page' : undefined}
                    className={cn('flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium', isActive(href) ? 'bg-brand-50 text-brand-800' : 'text-slate-700')}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6">
          <span>SkillCoach &middot; Practice the conversation before it counts.</span>
          <span>Built with Gemini on Google Cloud &middot; AI Builder Cup 2026</span>
        </div>
      </footer>
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10', className)}>{children}</div>;
}
