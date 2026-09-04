import { useState, type FormEvent } from "react";
import type { Api, SessionUser } from "../api/client";

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
    } catch {
      // The server deliberately does not distinguish these, and nor do we.
      setError("Email or password is incorrect.");
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
