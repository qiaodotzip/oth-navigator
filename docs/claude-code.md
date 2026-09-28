# Claude Code on the map

Your own Claude Code can read the map, tag frames, review places, and draw and edit, all under your name. The frames and floorplans it reads go to your Claude Code session.

1. **Make a token.** In the app, open **Team**, then **Claude Code → Create token**. Name it for the machine, such as *Wei's laptop*. Leave **May publish** off unless Claude should publish without you.
2. **Connect.** Copy the command it shows and paste it into a terminal. The token is shown only once, and the command keeps it in your own Claude Code settings, never in the repo.
3. **Ask.** Start Claude Code anywhere: *"List the floors"*, *"Tag the untagged frames on L2"*.

**What Claude can and can't do.**
- It goes through the same checks as the app. It never overwrites a teammate's change, and leaves alone anything a teammate has open.
- Its tags arrive as proposals, for Review. It can accept its own proposals when you ask it to, and they then count as confirmed.
- Its deletes are soft, and every change is recorded as *you via Claude Code*.
- It publishes only with a token made with **May publish** ticked. Without it, Claude's changes still go out with the next Publish anyone presses. Nothing in the app marks them as Claude's; the record is on the server's audit trail.
- It can't make tokens, add teammates, change floor owners, or turn a room draft into a room.

**Revoke** a token on the Team page when it leaks or you're done with it: it stops working at once. A token lasts 90 days. To take it out of Claude Code too, run `claude mcp remove oth`.

**If it stops working** (Claude Code shows **oth** as needing authentication, or failed), the token was revoked or has run out. Make a new token on the Team page, run `claude mcp remove oth`, then paste the new command. Don't press **Authenticate**: the map has no sign-in for it.
