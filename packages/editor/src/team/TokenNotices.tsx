import { useEffect } from "react";
import type { Api, TokenNotice } from "../api/client";
import { useEditorStore } from "../state/store";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { dayMonth } from "./tokenText";

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

/**
 * Tells you, once, about each Claude Code token made in your name (spec
 * §6.1). Signing in is picking a name, so anyone past the team code could
 * make one as you, and this is how you would find out. It draws nothing
 * itself: each notice is a toast that stays until dismissed, with Revoke.
 */
export function TokenNotices({ api }: { api: Api }) {
  const userId = useEditorStore(s => s.user?.id ?? null);
  useEffect(() => {
    if (!userId) return;
    // No cleanup that drops the answer: the claim has already marked these
    // told, so a notice claimed must be shown, even by an effect that
    // StrictMode ran twice (the second claim finds nothing).
    api.claimTokenNotices()
      .then(notices => {
        for (const notice of notices) {
          toast({
            message: noticeText(notice),
            durationMs: null,
            action: { label: "Revoke", run: () => revokeFromNotice(api, notice) },
          });
        }
      })
      // A failed claim marked nothing told, so the notices wait for the next sign-in.
      .catch(() => {});
  }, [api, userId]);
  return null;
}
