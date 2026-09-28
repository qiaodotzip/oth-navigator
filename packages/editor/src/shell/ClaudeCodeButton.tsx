import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { isUnauthorized, type Api, type ApiToken, type TokenList } from "../api/client";
import { followLink, href } from "../route";
import { useEditorStore } from "../state/store";
import { NewTokenDialog } from "../team/NewTokenDialog";
import { dayMonth } from "../team/tokenText";
import { Button } from "../ui/Button";
import { Popover } from "../ui/Popover";
import { relativeTime } from "../ui/relativeTime";
import { useClaudeCodePanel } from "./claudePanel";

/** The Team page's Claude Code section, where tokens are revoked. */
const TEAM_SECTION = `${href({ name: "team" })}#claude-code`;

const EXAMPLES = [
  "Tag the frames in the Gate 4 walkthrough",
  "Which L1 rooms have no place yet?",
  "Check L2 and list what blocks publishing",
];

const HINT = "text-xs text-stone-500";
const CELL = "border-b border-stone-100 py-1";

function Step({ n, title, children }: { n: number; title: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-medium text-stone-700">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** Your own tokens that still work. The server drops revoked and expired ones; expiry is checked again here. */
export function myLiveTokens(list: TokenList | null, userId: string | null, now = Date.now()): ApiToken[] {
  return (list?.tokens ?? []).filter(t => t.ownerId === userId && Date.parse(t.expiresAt) > now);
}

/**
 * Connecting your own Claude Code, from any screen: the steps, what to ask
 * it, and your tokens. A dot says you have one that still works. Tokens are
 * made with the Team page's dialog and revoked on the Team page.
 */
export function ClaudeCodeButton({ api }: { api: Api }) {
  const user = useEditorStore(s => s.user);
  const userId = user?.id ?? null;
  const [list, setList] = useState<TokenList | null>(null);
  const [failed, setFailed] = useState(false);
  const open = useClaudeCodePanel(s => s.open);
  const setOpen = useClaudeCodePanel(s => s.setOpen);
  const [creating, setCreating] = useState(false);
  const dotId = useId();

  const load = useCallback(async () => {
    try {
      setList(await api.listTokens());
      setFailed(false);
    } catch (err) {
      // A 401 already opened the session-ended dialog.
      if (!isUnauthorized(err)) setFailed(true);
    }
  }, [api]);

  // Once for the dot.
  useEffect(() => {
    if (userId) void load();
  }, [load, userId]);

  // Again each time the panel opens, however it was opened: its trigger, or the setup wizard's link.
  useEffect(() => {
    if (open && userId) void load();
  }, [open, userId, load]);

  // A session that ends with the panel open must not reopen it on sign-in.
  useEffect(() => {
    if (!user && open) setOpen(false);
  }, [user, open, setOpen]);

  // The panel is this button's: gone with it, so it never springs open on the next mount.
  useEffect(() => () => setOpen(false), [setOpen]);

  // The list is the whole team's.
  const mine = myLiveTokens(list, userId);
  const live = mine.length > 0;

  return (
    <>
      <span id={dotId} hidden>You have a live token.</span>
      <Popover
        align="end"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button size="sm" className="shrink-0 whitespace-nowrap" aria-describedby={live ? dotId : undefined}>
            {live && <span data-dot aria-hidden className="h-2 w-2 rounded-full bg-confirmed" />}
            Claude Code
          </Button>
        }
      >
        <div className="w-96 p-2">
          <h2 className="font-semibold">Connect Claude Code</h2>
          <ol aria-label="Steps" className="mt-3 space-y-3">
            <Step n={1} title="Create a token.">
              <p className={HINT}>
                Leave <strong className="font-medium text-stone-700">May publish</strong> off unless Claude should publish without you.
                It still can't publish while the map has errors.
              </p>
              <Button
                size="sm"
                className="mt-1.5"
                disabled={list === null}
                onClick={() => {
                  // The panel steps aside: a modal over an open popover would leave the popover undimmed above it.
                  setOpen(false);
                  setCreating(true);
                }}
              >
                Create token
              </Button>
            </Step>
            <Step n={2} title="Copy the command and paste it into a terminal.">
              <p className={HINT}>The token dialog shows the command, with a Copy command button.</p>
            </Step>
            <Step n={3} title={<>Start Claude Code and run <code className="font-mono">/mcp</code>.</>}>
              <p className={HINT}>
                You should see <strong className="font-medium text-stone-700">oth</strong> connected.
              </p>
            </Step>
          </ol>

          <div className="mt-3 border-t border-stone-200 pt-3">
            <p className={HINT}>Then ask it, for example:</p>
            <ul className="mt-1 space-y-0.5 text-stone-700">
              {EXAMPLES.map(ask => <li key={ask}>“{ask}”</li>)}
            </ul>
            <p className={`mt-2 ${HINT}`}>Its places and tags arrive as proposals in Review.</p>
            <p className={`mt-1 ${HINT}`}>
              Replacing a token? Run <code className="font-mono">claude mcp remove oth</code> first.
            </p>
          </div>

          {failed ? (
            <p role="alert" className="mt-3 border-t border-stone-200 pt-3 text-danger">
              Couldn't load your tokens. Check your connection and try again.
            </p>
          ) : live && (
            <div className="mt-3 border-t border-stone-200 pt-3">
              <table aria-label="Your tokens" className="w-full border-separate border-spacing-0">
                <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className={`${CELL} font-medium`}>Your tokens</th>
                    <th className={`${CELL} font-medium`}>Last used</th>
                    <th className={`${CELL} font-medium`}>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map(token => (
                    <tr key={token.id} aria-label={token.name}>
                      <td className={`${CELL} max-w-40 truncate pr-2`}>{token.name}</td>
                      <td className={CELL}>{token.lastUsedAt ? relativeTime(token.lastUsedAt) : "Never"}</td>
                      <td className={CELL}>{dayMonth(token.expiresAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`mt-2 ${HINT}`}>
                To revoke one, go to{" "}
                <a
                  href={TEAM_SECTION}
                  className="text-accent underline"
                  onClick={event => {
                    // Closed by hand: followLink's preventDefault also stops a PopoverClose.
                    followLink(TEAM_SECTION)(event);
                    setOpen(false);
                    // A pushState never scrolls to its #, so this does, once the Team page is drawn.
                    if (event.defaultPrevented) {
                      requestAnimationFrame(() => document.getElementById("claude-code")?.scrollIntoView({ block: "start" }));
                    }
                  }}
                >
                  Team → Claude Code
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </Popover>

      {creating && list && (
        <NewTokenDialog
          api={api}
          mayPublishByDefault={list.mayPublishByDefault}
          origin={window.location.origin}
          onClose={() => {
            setCreating(false);
            // Back to the steps: step 3 is still to do, and a new token shows in the list.
            setOpen(true);
          }}
          onMade={() => void load()}
        />
      )}
    </>
  );
}
