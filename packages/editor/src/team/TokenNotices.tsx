import { useEffect } from "react";
import type { Api, TokenNotice } from "../api/client";
import { href, navigate } from "../route";
import { useEditorStore } from "../state/store";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { dayMonth } from "./tokenText";

/** One token. */
export function noticeText(notice: TokenNotice): string {
  return `A Claude Code token, ${notice.name}, was made in your name on ${dayMonth(notice.createdAt)}.`;
}

async function revokeFromNotice(api: Api, notice: TokenNotice): Promise<void> {
  try {
    await api.revokeToken(notice.id);
    toast({ tone: "success", message: `Revoked ${notice.name}. Claude Code can no longer reach the map with it.` });
  } catch (err) {
    reportFailure(err, { doing: `revoke ${notice.name}` });
  }
}

/** Two or more at once. */
export function manyNoticesText(count: number): string {
  return `${count} Claude Code tokens were made in your name. See the Team page.`;
}

function show(api: Api, notices: readonly TokenNotice[]): void {
  const [first] = notices;
  if (!first) return;
  if (notices.length === 1) {
    toast({
      message: noticeText(first),
      durationMs: null,
      action: { label: "Revoke", run: () => revokeFromNotice(api, first) },
    });
    return;
  }
  // One toast, not one each: the stack holds four, and a fifth notice would
  // push the first out unseen. The Team page lists them all, with Revoke.
  toast({
    message: manyNoticesText(notices.length),
    durationMs: null,
    action: { label: "Team", run: () => navigate(href({ name: "team" })) },
  });
}

/**
 * Tells you, once, about the Claude Code tokens made in your name (spec
 * §6.1). Signing in is picking a name, so anyone past the team code could
 * make one as you, and this is how you would find out. It draws nothing
 * itself: the notice is a toast that stays until dismissed.
 */
export function TokenNotices({ api }: { api: Api }) {
  const userId = useEditorStore(s => s.user?.id ?? null);
  useEffect(() => {
    if (!userId) return;
    // No cleanup that drops the answer: the claim has already marked these
    // told, so a notice claimed must be shown, even by an effect that
    // StrictMode ran twice (the second claim finds nothing).
    api.claimTokenNotices()
      .then(notices => show(api, notices))
      // The server may have marked them told before the answer was lost, so
      // they may not come again. The Team page still lists every live token.
      .catch(() => {});
  }, [api, userId]);
  return null;
}
