import { useCallback, useEffect, useState } from "react";
import { isUnauthorized, type Api, type ApiToken, type TokenList } from "../api/client";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { relativeTime } from "../ui/relativeTime";
import { toast } from "../ui/toast";
import { NewTokenDialog } from "./NewTokenDialog";
import { dayMonth } from "./tokenText";

const HEAD = "border-b border-stone-200 py-2";
const CELL = "border-b border-stone-100 py-2";

/**
 * "Wei Kang's Laptop". Anyone may revoke anyone's token, and two people's may
 * share a name, so a Revoke button and its toast say whose.
 */
const whose = (token: ApiToken) => `${token.ownerName}'s ${token.name}`;

/**
 * The Team page's Claude Code section (spec §6.1). You make a token for
 * your own Claude Code, and see and revoke everyone's. The team is flat, so
 * anyone may revoke any token, as anyone may add a teammate.
 */
export function ClaudeCode({ api }: { api: Api }) {
  const [list, setList] = useState<TokenList | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setList(await api.listTokens());
      setFailed(false);
    } catch (err) {
      // A 401 already opened the session-ended dialog.
      if (!isUnauthorized(err)) setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function revoke(token: ApiToken): Promise<void> {
    setRevoking(token.id);
    try {
      await api.revokeToken(token.id);
      toast({ tone: "success", message: `Revoked ${whose(token)}. Claude Code can no longer reach the map with it.` });
      await reload();
    } catch (err) {
      reportFailure(err, { doing: `revoke ${whose(token)}`, retry: () => revoke(token) });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section aria-labelledby="claude-code" className="mt-10">
      <div className="flex items-center">
        <div>
          <h2 id="claude-code" className="text-base font-semibold">Claude Code</h2>
          <p className="text-xs text-stone-500">
            Connect your own Claude Code to the map. It works under your name, and every change it makes says it came through Claude.
          </p>
        </div>
        <Button className="ml-auto" disabled={list === null} onClick={() => setCreating(true)}>Create token</Button>
      </div>

      {failed ? (
        <p role="alert" className="mt-3 text-sm text-danger">Couldn't load the tokens. Check your connection, then reload the page.</p>
      ) : list === null ? (
        <p className="mt-3 text-sm text-stone-500">Loading tokens…</p>
      ) : list.tokens.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">No tokens yet.</p>
      ) : (
        <table aria-label="Claude Code tokens" className="mt-3 w-full border-separate border-spacing-0 text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className={HEAD}>Whose</th>
              <th className={HEAD}>Name</th>
              <th className={HEAD}>Made</th>
              <th className={HEAD}>Last used</th>
              <th className={HEAD}>Expires</th>
              <th className={HEAD}><span className="sr-only">Revoke</span></th>
            </tr>
          </thead>
          <tbody>
            {list.tokens.map(token => (
              <tr key={token.id} aria-label={`${token.ownerName}: ${token.name}`}>
                <td className={CELL}>{token.ownerName}</td>
                <td className={CELL}>
                  {token.name}
                  {token.mayPublish && <span className="ml-2 rounded bg-stone-100 px-1.5 text-xs text-stone-700">May publish</span>}
                </td>
                <td className={CELL}>{dayMonth(token.createdAt)}</td>
                <td className={CELL}>{token.lastUsedAt ? relativeTime(token.lastUsedAt) : "Never"}</td>
                <td className={CELL}>{dayMonth(token.expiresAt)}</td>
                <td className={`${CELL} text-right`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={revoking === token.id ? `Revoking ${whose(token)}…` : `Revoke ${whose(token)}`}
                    disabled={revoking === token.id}
                    onClick={() => void revoke(token)}
                  >
                    {revoking === token.id ? "Revoking…" : "Revoke"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && list && (
        <NewTokenDialog
          api={api}
          mayPublishByDefault={list.mayPublishByDefault}
          origin={window.location.origin}
          onClose={() => setCreating(false)}
          onMade={() => void reload()}
        />
      )}
    </section>
  );
}
