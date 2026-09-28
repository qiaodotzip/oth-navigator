import type { User } from "../auth/users";
import type { Database } from "../db/client";
import type { TokenInfo } from "../tokens/service";
import type { TokenLimits } from "./limits";

/** Everything a tool call knows: whose it is, through which token. Built fresh for each request. */
export type ToolContext = {
  db: Database;
  dataDir: string;
  user: User;
  token: TokenInfo;
  limits: TokenLimits;
  now: () => Date;
  /**
   * Shows "Wei (Claude)" in presence (spec §6.4). Tools call it with the
   * floor once they know it. `runTool` calls it with null as each call
   * arrives, which keeps the floor it was last on.
   */
  seenOn: (levelId: string | null) => void;
};
