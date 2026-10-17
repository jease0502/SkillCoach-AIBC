'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, UserPlus, UserRound } from 'lucide-react';
import { authErrorMessage, useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Container } from '@/components/app-shell';
import { Button, Card, Field, inputClass } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/scenarios';
  const { account, ready, signIn, signUp, continueAsGuest } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'form' | 'guest' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && account && !account.guest) router.replace(next);
  }, [ready, account, next, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('form');
    setError(null);
    try {
      if (mode === 'signup') await signUp(name, email, password);
      else await signIn(email, password);
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const guest = async () => {
    setBusy('guest');
    setError(null);
    try {
      await continueAsGuest();
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Container>
      <Card className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold text-slate-900">{mode === 'signup' ? 'Create your account' : 'Sign in to SkillCoach'}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your practice sessions and reports are saved to your account, and your manager sees your progress on the team dashboard.
        </p>
        <div className="mt-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium" role="tablist" aria-label="Account">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn('rounded-md py-1.5 transition-colors', mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          {mode === 'signup' && (
            <Field label="Your name">
              {(p) => <input {...p} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={60} />}
            </Field>
          )}
          <Field label="Work email">
            {(p) => <input {...p} type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}
          </Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined} error={error}>
            {(p) => (
              <input
                {...p}
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
              />
            )}
          </Field>
          <Button
            type="submit"
            loading={busy === 'form'}
            disabled={busy !== null}
            icon={mode === 'signup' ? <UserPlus className="h-4 w-4" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
          >
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
        </div>
        <Button variant="secondary" className="w-full" onClick={guest} loading={busy === 'guest'} disabled={busy !== null} icon={<UserRound className="h-4 w-4" aria-hidden />}>
          Continue as guest
        </Button>
        <p className="mt-3 text-center text-xs text-slate-500">No account needed to try the demo. Guest sessions are saved on this device only.</p>
      </Card>
    </Container>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
