'use client';

/**
 * Accounts with Firebase Authentication: email + password sign-up and sign-in, and a guest
 * (anonymous) sign-in. Accounts are optional: everything works without one, and judges or
 * demo visitors can practise straight away. When signed in, the API receives the Firebase
 * ID token and links practice sessions to the trainee.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Auth, User } from 'firebase/auth';
import firebaseConfig from './firebase-config.json';
const MOCK = process.env.NEXT_PUBLIC_MOCK === 'true';

let authPromise: Promise<Auth> | null = null;

async function getAuthInstance(): Promise<Auth> {
  authPromise ??= (async () => {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    return getAuth(app);
  })();
  return authPromise;
}

/** The current user's ID token, for the API's Authorization header (null when signed out). */
export async function currentIdToken(): Promise<string | null> {
  if (MOCK || typeof window === 'undefined') return null;
  try {
    const auth = await getAuthInstance();
    return auth.currentUser ? await auth.currentUser.getIdToken() : null;
  } catch {
    return null;
  }
}

export interface Account {
  uid: string;
  name: string;
  email: string | null;
  guest: boolean;
}

interface AuthState {
  account: Account | null;
  ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  continueAsGuest(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function toAccount(u: User): Account {
  return {
    uid: u.uid,
    name: u.displayName || (u.email ? u.email.split('@')[0] : 'Guest'),
    email: u.email,
    guest: u.isAnonymous,
  };
}

/** Friendly messages for the Firebase errors people actually hit. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account with that email. Create one instead.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] ?? 'Sign-in failed. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(MOCK);

  useEffect(() => {
    if (MOCK) return;
    let unsubscribe = () => {};
    getAuthInstance()
      .then(async (auth) => {
        const { onAuthStateChanged } = await import('firebase/auth');
        unsubscribe = onAuthStateChanged(auth, (u) => {
          setAccount(u ? toAccount(u) : null);
          setReady(true);
        });
      })
      .catch(() => setReady(true));
    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(await getAuthInstance(), email.trim(), password);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const cred = await createUserWithEmailAndPassword(await getAuthInstance(), email.trim(), password);
    if (name.trim()) {
      await updateProfile(cred.user, { displayName: name.trim().slice(0, 60) });
      await cred.user.getIdToken(true); // refresh so the API sees the name
      setAccount(toAccount(cred.user));
    }
  }, []);

  const continueAsGuest = useCallback(async () => {
    const { signInAnonymously } = await import('firebase/auth');
    await signInAnonymously(await getAuthInstance());
  }, []);

  const signOut = useCallback(async () => {
    const { signOut: fbSignOut } = await import('firebase/auth');
    await fbSignOut(await getAuthInstance());
  }, []);

  const value = useMemo(() => ({ account, ready, signIn, signUp, continueAsGuest, signOut }), [account, ready, signIn, signUp, continueAsGuest, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
