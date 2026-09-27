import { useState, type FormEvent } from "react";
import { ApiError, type Api, type SessionUser } from "../api/client";
import { Button } from "../ui/Button";

/**
 * Why a sign-in failed, in the words of someone who has to fix it.
 *
 * A bare catch here used to report every failure as bad credentials, so a
 * server that was not running looked exactly like a wrong password — and the
 * honest response to that is to reset a password that was never the problem.
 */
export function signInError(err: unknown): string {
  if (err instanceof ApiError) {
    // The server deliberately does not say which of the two was wrong.
    if (err.status === 401) return "Email or password is incorrect.";
    return `The server refused the sign-in (HTTP ${err.status}).`;
  }
  return "Can't reach the server. Check your connection and try again.";
}

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

/** The form alone, so the full-page screen and the expired-session dialog share it. */
export function LoginForm({ api, onSignedIn }: { api: Api; onSignedIn: (u: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.login(email, password));
    } catch (err) {
      setError(signInError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        Email
        <input className={FIELD} type="email" autoComplete="username" spellCheck={false} value={email} required onChange={e => setEmail(e.target.value)} />
      </label>
      <label className="block text-sm">
        Password
        <input className={FIELD} type="password" autoComplete="current-password" value={password} required onChange={e => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function LoginScreen({ api, onSignedIn }: { api: Api; onSignedIn: (u: SessionUser) => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-stone-100">
      <div className="w-80 rounded-lg bg-white p-6 shadow">
        <h1 className="mb-1 text-lg font-semibold">OTH Map</h1>
        <p className="mb-4 text-xs text-stone-500">Survey and build Our Tampines Hub, floor by floor.</p>
        <LoginForm api={api} onSignedIn={onSignedIn} />
      </div>
    </div>
  );
}
