# Claude Code on the map

Your own Claude Code can read the map, tag frames, review places, and draw and edit, all under your name. The frames and floorplans it reads go to your Claude Code session.

1. **Make a token.** In the app, open **Team**, then **Claude Code → Create token**. Name it for the machine, such as *Wei's laptop*. Leave **May publish** off unless Claude should publish without you.
2. **Connect.** Copy the command it shows and paste it into a terminal. The token is shown only once, and the command keeps it in your own Claude Code settings, never in the repo.
3. **Ask.** Start Claude Code anywhere: *"List the floors"*, *"Tag the untagged frames on L2"*.

**What Claude can and can't do.**
- It goes through the same checks as the app. It never overwrites a teammate's change, and leaves alone anything a teammate has open.
- Its tags arrive as proposals, for Review.
- Its deletes are soft, and every change is recorded as *you via Claude Code*.
- It publishes only with a token made with **May publish** ticked.
- It can't make tokens, add teammates, change floor owners, or turn a room draft into a room.

**Revoke** a token on the Team page when it leaks or you're done with it: it stops working at once. A token lasts 90 days; make a new one when yours runs out. To take it out of Claude Code too, run `claude mcp remove oth`.
