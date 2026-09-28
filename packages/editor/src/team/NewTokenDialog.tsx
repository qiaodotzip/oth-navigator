import { useId, useState, type FormEvent } from "react";
import { ApiError, isUnauthorized, type Api, type ApiToken } from "../api/client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { serverWords } from "../ui/failure";
import { toast } from "../ui/toast";
import { connectCommand } from "./tokenText";

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast({ tone: "success", message: "Copied. Paste it into a terminal." });
  } catch {
    toast({ tone: "error", message: "Couldn't copy. Select the command and copy it yourself." });
  }
}

/**
 * Makes a token, then shows it once, inside the command that uses it. It is
 * mounted only while open, so closing it throws the token away: the server
 * keeps only its hash, and nothing can show it again. A stray click outside
 * never closes it, as the Dialog allows for a shown-once secret. While the
 * token is being made nothing closes it: closing then would make a token
 * whose one showing nobody sees.
 */
export function NewTokenDialog({
  api, mayPublishByDefault, origin, onClose, onMade,
}: {
  api: Api;
  mayPublishByDefault: boolean;
  origin: string;
  onClose: () => void;
  onMade: (token: ApiToken) => void;
}) {
  const [name, setName] = useState("");
  const [mayPublish, setMayPublish] = useState(mayPublishByDefault);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const made = await api.createToken(name.trim(), mayPublish);
      setSecret(made.secret);
      onMade(made.token);
    } catch (err) {
      // A 401 opened the session-ended dialog, and this would only contradict it.
      if (!isUnauthorized(err)) {
        setError(err instanceof ApiError && err.status < 500
          ? `${serverWords(err) ?? "Check the name"}.`
          : "Couldn't make the token. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const command = secret ? connectCommand(origin, secret) : "";

  return (
    <Dialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      dismissible={!busy}
      closeOnOutsideClick={false}
      title={secret ? "Connect Claude Code" : "Create a Claude Code token"}
      description={secret
        ? "Paste this into a terminal. It holds your token, and this is the only time you'll see it."
        : "Claude Code will work under your name, and every change it makes will say so."}
    >
      {secret ? (
        <div className="space-y-3">
          {/* Focused and selected as it appears, ready to copy; nothing is copied until you do. */}
          <textarea
            readOnly
            autoFocus
            aria-label="Command to connect Claude Code"
            value={command}
            rows={4}
            onFocus={e => e.currentTarget.select()}
            className="w-full rounded border border-stone-300 bg-stone-50 p-2 font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => void copy(command)}>Copy command</Button>
            <Button variant="primary" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            Name
            <input className={FIELD} placeholder="Laptop" autoComplete="off" required value={name} onChange={e => setName(e.target.value)} />
          </label>
          <div className="flex items-start gap-2 text-sm">
            <input
              id={`${ids}-publish`}
              type="checkbox"
              className="mt-1"
              aria-describedby={`${ids}-publish-hint`}
              checked={mayPublish}
              onChange={e => setMayPublish(e.target.checked)}
            />
            <div>
              <label htmlFor={`${ids}-publish`}>May publish</label>
              {/* Outside the label, so the tick's name stays "May publish" and this is read as its description. */}
              <p id={`${ids}-publish-hint`} className="text-xs text-stone-500">
                Leave this off unless Claude should publish the map without you. It still can't publish while the map has errors.
              </p>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "Creating…" : "Create token"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
