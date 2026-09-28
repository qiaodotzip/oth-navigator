import type { ValidationReport } from "@oth/model";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToasts } from "../ui/toast";
import { recheck, useRecheck } from "./recheck";
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

  // StrictMode mounts twice in development, so two checks overlap, and either can answer first.
  it.each([["older", "newer"], ["newer", "older"]] as const)(
    "keeps the latest check's answer when two overlap and the %s answers first",
    async (...landing) => {
      const answers: Array<(r: ValidationReport) => void> = [];
      const validate = vi.fn(() => new Promise<ValidationReport>(resolve => { answers.push(resolve); }));
      const checks = { older: recheck({ validate }, "check the places again"), newer: recheck({ validate }, "check the places again") };
      const [older, newer] = answers;
      const answer = { older: () => older!(report(3)), newer: () => newer!(report(5)) };
      for (const which of landing) {
        answer[which]();
        await checks[which];
      }
      expect(useEditorStore.getState().report).toEqual(report(5));
    },
  );

  it("says nothing when an older check fails while a newer one is on its way", async () => {
    let fail!: (err: unknown) => void;
    let answer!: (r: ValidationReport) => void;
    const validate = vi.fn()
      .mockImplementationOnce(() => new Promise<ValidationReport>((_, reject) => { fail = reject; }))
      .mockImplementationOnce(() => new Promise<ValidationReport>(resolve => { answer = resolve; }));
    const older = recheck({ validate }, "check the places again");
    const newer = recheck({ validate }, "check the places again");
    fail(new TypeError("Failed to fetch"));
    await older;
    answer(report(5));
    await newer;
    expect(useToasts.getState().toasts).toHaveLength(0);
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

describe("useRecheck", () => {
  it("checks once as a screen opens, and not again as it renders", async () => {
    const api = { validate: vi.fn().mockResolvedValue(report(2)) };
    const { rerender } = renderHook(() => useRecheck(api, "check the places again"));
    await waitFor(() => expect(useEditorStore.getState().report).toEqual(report(2)));
    rerender();
    expect(api.validate).toHaveBeenCalledTimes(1);
  });

  it("says what it was doing when the check fails while the screen is open", async () => {
    const api = { validate: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) };
    renderHook(() => useRecheck(api, "refresh the to-do list"));
    await waitFor(() => expect(useToasts.getState().toasts).toHaveLength(1));
    expect(useToasts.getState().toasts[0]?.message).toBe("Couldn't refresh the to-do list. Check your connection, then retry.");
  });

  it("says nothing of a failure that lands after the screen has closed", async () => {
    let fail!: (err: unknown) => void;
    const api = { validate: vi.fn(() => new Promise<ValidationReport>((_, reject) => { fail = reject; })) };
    const { unmount } = renderHook(() => useRecheck(api, "check the places again"));
    unmount();
    await act(async () => fail(new TypeError("Failed to fetch")));
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
