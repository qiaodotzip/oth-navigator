import { RoomSchema } from "@oth/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser } from "../auth/users";
import { currentVia } from "../entities/via";
import { createTestDb } from "../testing/harness";
import type { ToolContext } from "./context";
import { Refusal, SERVER_FAILED, conflictText, reply, runTool, singaporeTime } from "./results";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubContext(): ToolContext {
  return {
    db: undefined as never,
    dataDir: "",
    user: { id: "u_wei", email: "wei@example.com", displayName: "Wei" },
    token: { id: "tok_1", name: "Wei's laptop", mayPublish: false },
    limits: undefined as never,
    now: () => new Date(),
    seenOn: vi.fn(),
  };
}

describe("singaporeTime", () => {
  it("gives the time in Singapore, whatever zone the server runs in", () => {
    expect(singaporeTime("2026-09-28T06:02:00.000Z")).toBe("14:02 on 28 Sep");
  });
});

describe("conflictText", () => {
  it("says whose change it met, when, and what the thing is now", async () => {
    const db = await createTestDb();
    const amy = await createUser(db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    const current = { id: "L1-shop-12", version: 7, updatedBy: amy.id, updatedAt: "2026-09-28T06:02:00.000Z", nameEn: "Shop 12" };
    expect(await conflictText(db, { type: "room", id: "L1-shop-12", sent: 5 }, current)).toBe(
      `Not saved: room L1-shop-12 is at version 7 and you sent 5. Amy changed it at 14:02 on 28 Sep. ` +
      `Its current value is ${JSON.stringify(current)}. Read it again and decide.`,
    );
  });

  it("names the one of several things that conflicted", async () => {
    const db = await createTestDb();
    const text = await conflictText(db, [
      { type: "place", id: "pl_1", sent: 2 },
      { type: "room", id: "L1-shop-12", sent: 4 },
    ], { id: "L1-shop-12", version: 5 });
    expect(text).toMatch(/^Not saved: room L1-shop-12 is at version 5 and you sent 4\. Its current value is/);
  });

  it("says something it depends on changed when the conflict is elsewhere", async () => {
    const db = await createTestDb();
    expect(await conflictText(db, { type: "place", id: "pl_1", sent: 2 }, { id: "sg_9", version: 3 })).toBe(
      "Not saved: something place pl_1 depends on changed while this ran. Read it again and decide.",
    );
  });
});

describe("runTool", () => {
  it("runs the call through its token, so every audit row it writes says via", async () => {
    let seen: string | null = null;
    await runTool(stubContext(), async () => {
      seen = currentVia();
      return reply("ok");
    });
    expect(seen).toBe("tok_1");
  });

  it("shows the person's Claude as the call arrives", async () => {
    const ctx = stubContext();
    await runTool(ctx, async () => reply("ok"));
    expect(ctx.seenOn).toHaveBeenCalledWith(null);
  });

  it("answers a refusal as a refusal", async () => {
    expect(await runTool(stubContext(), async () => { throw new Refusal("There is no floor L9."); })).toEqual({
      isError: true, content: [{ type: "text", text: "There is no floor L9." }],
    });
  });

  it("answers a schema rejection with what was wrong", async () => {
    const out = await runTool(stubContext(), async () => {
      RoomSchema.parse({ id: "r1", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [1, 1]], heightM: 4 });
      return reply("ok");
    });
    expect(out.isError).toBe(true);
    expect((out.content[0] as { text: string }).text).toMatch(/^Not saved: footprint: a ring needs at least three points/);
  });

  it("answers anything unexpected with no detail, and logs it without the token", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = `oth_pat_${"z".repeat(43)}`;
    const out = await runTool(stubContext(), async () => { throw new Error(`connection to ${secret} dropped`); });
    expect(out).toEqual({ isError: true, content: [{ type: "text", text: SERVER_FAILED }] });
    const printed = logged.mock.calls.flat().map(a => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" ");
    expect(printed).not.toContain(secret);
  });
});
