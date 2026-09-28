import type { ValidationReport } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToasts } from "../ui/toast";
import { recheck } from "./recheck";
import { useEditorStore } from "./store";

const report = (warningCount: number): ValidationReport => ({ issues: [], errorCount: 0, warningCount, ok: true });

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("recheck", () => {
  it("puts the fresh report in the store", async () => {
    await recheck({ validate: vi.fn().mockResolvedValue(report(3)) }, "check the places again");
    expect(useEditorStore.getState().report).toEqual(report(3));
  });

  it("keeps a report a save brought meanwhile, which is newer", async () => {
    let answer!: (r: ValidationReport) => void;
    const validate = vi.fn(() => new Promise<ValidationReport>(resolve => { answer = resolve; }));
    const pending = recheck({ validate }, "check the places again");
    useEditorStore.getState().setReport(report(5));
    answer(report(3));
    await pending;
    expect(useEditorStore.getState().report).toEqual(report(5));
  });

  it("says what it was doing when it fails, and offers Retry", async () => {
    const validate = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(report(1));
    await recheck({ validate }, "check the places again");
    const [failed] = useToasts.getState().toasts;
    expect(failed?.message).toBe("Couldn't check the places again. Check your connection, then retry.");
    await failed?.action?.run();
    expect(useEditorStore.getState().report).toEqual(report(1));
  });

  it("says nothing once nobody is listening", async () => {
    await recheck({ validate: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }, "check the places again", () => false);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
