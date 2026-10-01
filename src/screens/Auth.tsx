import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button, FieldError, Label, Segmented, inputClass } from '../components/ui';

function message(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password don’t match.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email. Sign in instead.';
    case 'auth/weak-password':
      return 'Use at least 6 characters.';
    case 'auth/invalid-email':
      return 'That doesn’t look like an email address.';
    case 'auth/network-request-failed':
      return 'No connection. Signing in needs one the first time on each device.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    default:
      return 'Something went wrong. Try again.';
  }
}

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  const submit = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password);
      else await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(message((e as { code?: string }).code ?? ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-[28px] font-semibold tracking-tight">Logbook</h1>
      <p className="mt-1 text-[15px] text-ink-2">Sign in once on each device. After that, it works offline.</p>

      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Segmented
          label="Mode"
          value={mode}
          onChange={(m) => { setMode(m); setError(null); }}
          options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
        />
        <div>
          <Label htmlFor="email">Email</Label>
          <input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <FieldError>{error}</FieldError>
          {info && <p className="mt-1.5 text-[13px] text-ink-2">{info}</p>}
        </div>
        {!online && <p className="text-[13px] text-ink-3">You’re offline. Connect to sign in on this device.</p>}
        <Button type="submit" variant="primary" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
        {mode === 'signin' && (
          <Button
            variant="ghost"
            disabled={!email}
            onClick={() => {
              sendPasswordResetEmail(auth, email.trim())
                .then(() => setInfo('If that account exists, a reset link is on its way.'))
                .catch((e) => setError(message(e.code)));
            }}
          >
            Email me a password reset link
          </Button>
        )}
      </form>
    </main>
  );
}
