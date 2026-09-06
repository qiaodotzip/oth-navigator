import { useState, type FormEvent } from "react";
import { ApiError, type Api, type SessionUser } from "../api/client";

/**
 * Why a sign-in failed, in the words of someone who has to fix it.
 *
 * A bare catch here used to report every failure as bad credentials, so a
 * server that was not running looked exactly like a wrong password — and the
 * honest response to that is to reset a password that was never the problem.
 * This team starts the server by hand, which makes "it is not running" the
 * single most likely cause, so it must never be disguised as anything else.
 */
export function signInError(err: unknown): string {
  if (err instanceof ApiError) {
    // The server deliberately does not say which of the two was wrong.
    if (err.status === 401) return "Email or password is incorrect.";
    return `The server refused the sign-in (HTTP ${err.status}).`;
  }
  return "Could not reach the server. Is it running on the expected port?";
}

export function LoginScreen({
  api, onSignedIn,
}: {
  api: Api;
  onSignedIn: (u: SessionUser) => void;
}) {
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
    <div className="flex h-full items-center justify-center bg-stone-100">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-lg font-semibold">OTH Map Editor</h1>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            type="email" value={email} required
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            type="password" value={password} required
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full rounded bg-stone-800 py-1.5 text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
