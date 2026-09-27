import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type Api, type SessionUser, type TeamMember } from "../api/client";
import { Button } from "../ui/Button";
import { recall, remember } from "../ui/remember";

/**
 * Why a sign-in failed, in the words of someone who has to fix it.
 *
 * A bare catch here used to report every failure as bad credentials, so a
 * server that was not running looked exactly like the wrong choice — and the
 * honest response to that is to show what the server actually said.
 */
export function signInError(err: unknown): string {
  if (err instanceof ApiError) {
    const message = (err.body as { error?: string } | null)?.error;
    if (message) return message;
    return `The server refused the sign-in (HTTP ${err.status}).`;
  }
  return "Can't reach the server. Check your connection and try again.";
}

type PeopleState =
  | { status: "loading" }
  | { status: "unreachable" }
  | { status: "loaded"; people: TeamMember[] };

/** The form alone, so the full-page screen and the expired-session dialog share it. */
export function LoginForm({ api, onSignedIn }: { api: Api; onSignedIn: (u: SessionUser) => void }) {
  const [state, setState] = useState<PeopleState>({ status: "loading" });
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.people()
      .then(people => {
        if (!alive) return;
        setState({ status: "loaded", people });
        const last = recall("lastSignedInUserId");
        setSelected(last && people.some(p => p.id === last) ? last : "");
      })
      .catch(() => {
        if (alive) setState({ status: "unreachable" });
      });
    return () => {
      alive = false;
    };
  }, [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(selected);
      remember("lastSignedInUserId", user.id);
      onSignedIn(user);
    } catch (err) {
      setError(signInError(err));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") {
    return <p className="text-sm text-stone-500">Loading the team…</p>;
  }

  if (state.status === "unreachable") {
    return <p role="alert" className="text-sm text-danger">Can't reach the server. Check your connection and try again.</p>;
  }

  if (state.people.length === 0) {
    return <p className="text-sm text-stone-600">No one is on the team yet. Ask whoever runs the server to add you.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        Who are you?
        <select
          className="mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5"
          value={selected}
          required
          onChange={e => setSelected(e.target.value)}
        >
          {!selected && <option value="" disabled>Pick your name</option>}
          {state.people.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy || !selected} className="w-full">
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
