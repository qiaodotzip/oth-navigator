import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { ValidationPanel } from "./ValidationPanel";

beforeEach(() => useEditorStore.getState().reset());

describe("ValidationPanel", () => {
  it("says the model is clean when there are no issues", () => {
    useEditorStore.getState().setReport({ issues: [], errorCount: 0, warningCount: 0, ok: true });
    render(<ValidationPanel />);
    expect(screen.getByText(/no problems/i)).toBeTruthy();
  });

  it("lists errors with their message", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "error", code: "room.unreachable",
        message: 'Room "L1-a" cannot be reached from any entrance.',
        entityType: "room", entityId: "L1-a",
      }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<ValidationPanel />);
    expect(screen.getByText(/cannot be reached/i)).toBeTruthy();
  });

  it("shows that errors block publishing", () => {
    useEditorStore.getState().setReport({
      issues: [{ severity: "error", code: "x", message: "bad", entityType: "room", entityId: "a" }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<ValidationPanel />);
    expect(screen.getByText(/blocks publishing/i)).toBeTruthy();
  });

  it("shows warnings without claiming they block anything", () => {
    useEditorStore.getState().setReport({
      issues: [{ severity: "warning", code: "room.name.missing", message: "no name", entityType: "room", entityId: "a" }],
      errorCount: 0, warningCount: 1, ok: true,
    });
    render(<ValidationPanel />);
    expect(screen.queryByText(/blocks publishing/i)).toBeNull();
  });
});
