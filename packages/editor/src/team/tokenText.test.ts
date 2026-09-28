import { describe, expect, it } from "vitest";
import { connectCommand, dayMonth } from "./tokenText";

describe("connectCommand", () => {
  it("is the command that connects Claude Code, kept in the user's own settings", () => {
    expect(connectCommand("https://oth.up.railway.app/", "oth_pat_abc")).toBe(
      'claude mcp add --transport http --scope user oth https://oth.up.railway.app/mcp --header "Authorization: Bearer oth_pat_abc"',
    );
  });
});

describe("dayMonth", () => {
  it("is the day and the month", () => {
    expect(dayMonth("2026-10-03T12:00:00Z")).toBe("3 Oct");
    expect(dayMonth("2027-01-01T12:00:00Z")).toBe("1 Jan");
  });
});
