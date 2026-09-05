# Usable Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the editor from a toolbar of nouns into something a teammate can follow — a per-level checklist driven by validation, drawing that behaves the way the hackathon's did but better, draggable vertices, and editable placements.

**Architecture:** The validation report stops being a flat list and becomes the data source for an ordered checklist, so "L1 has no lift" is the status of a step rather than one of nine identical warnings. That mapping is a pure function with its own tests; the panel renders what it returns. Drawing and vertex dragging keep their in-progress state local to the component and hit the server once, on commit — never per mouse move.

**Tech Stack:** React, Zustand, Vitest with jsdom. No new dependencies.

**Spec:** [`docs/design-and-plans/specs/2026-09-05-editor-usability-design.md`](../specs/2026-09-05-editor-usability-design.md)

**Depends on:** [`2026-09-05-floorplan-underlay.md`](2026-09-05-floorplan-underlay.md), which supplies `levelImages` in the store, `imageForLevel`, and the fixed viewport framing.

## Global Constraints

- **The checklist guides; it never gates.** Every tool stays reachable from the toolbar at all times. Steps are a suggested order, not a lock.
- **`@oth/model` owns validity.** The checklist reports the server's report; it never decides what is valid.
- **One save per gesture.** A vertex drag writes once on release, through the existing optimistic-locked path.
- **A 409 surfaces as a conflict**, never a retry.
- **TypeScript strict**, tests beside the code.

---

## File Structure

`packages/editor/`:
- `src/flow/checklist.ts` — model + report → ordered steps
- `src/panels/ChecklistPanel.tsx` — renders them
- `src/plan/DrawingHint.tsx` — what you are doing and how to finish
- `src/plan/VertexHandles.tsx` — draggable vertices on the selected room
- `src/panels/PlacementInspector.tsx` — transform fields
- modify `src/plan/PlanCanvas.tsx` — rubber band, close-on-first-vertex, keys, handles
- modify `src/App.tsx` — sidebar order

---

## Task 1: The checklist

**Files:**
- Create: `packages/editor/src/flow/checklist.ts`, `src/flow/checklist.test.ts`

**Interfaces:**
- Produces: `StepId`, `StepStatus`, `ChecklistStep`, `levelChecklist(input): ChecklistStep[]`, `stepForCode(code): StepId | null`.
- `ChecklistStep = { id: StepId; label: string; status: StepStatus; detail: string; tool: Tool | null; issues: ValidationIssue[] }`.
- `input = { model: MapModel | null; levelId: string | null; image: LevelImage | null; report: ValidationReport | null }`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/flow/checklist.test.ts`:

```ts
import { parseModel, type ValidationIssue, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { levelChecklist, stepForCode } from "./checklist";

const image: LevelImage = {
  id: "img_1", levelId: "oth-L1", filename: "L1.png",
  widthPx: 100, heightPx: 100, sizeBytes: 10,
  metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

const room = {
  id: "L1-a", levelId: "oth-L1", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3, walkable: true,
};

function model(extra: Record<string, unknown> = {}) {
  return parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
    ...extra,
  });
}

const emptyReport: ValidationReport = { issues: [], errorCount: 0, warningCount: 0, ok: true };

function report(issues: ValidationIssue[]): ValidationReport {
  const errorCount = issues.filter(i => i.severity === "error").length;
  return { issues, errorCount, warningCount: issues.length - errorCount, ok: errorCount === 0 };
}

function steps(input: Parameters<typeof levelChecklist>[0]) {
  return Object.fromEntries(levelChecklist(input).map(s => [s.id, s]));
}

describe("levelChecklist", () => {
  it("returns the six steps in order", () => {
    const ids = levelChecklist({ model: model(), levelId: "oth-L1", image: null, report: emptyReport })
      .map(s => s.id);
    expect(ids).toEqual(["floorplan", "scale", "rooms", "connect", "entrances", "portals"]);
  });

  it("starts with everything to do", () => {
    const s = steps({ model: model(), levelId: "oth-L1", image: null, report: emptyReport });
    expect(Object.values(s).every(step => step.status === "todo")).toBe(true);
  });

  it("marks the floorplan done once an image exists", () => {
    const s = steps({ model: model(), levelId: "oth-L1", image, report: emptyReport });
    expect(s.floorplan?.status).toBe("done");
    expect(s.floorplan?.detail).toBe("L1.png");
  });

  it("keeps the scale to do until the image is measured", () => {
    expect(steps({ model: model(), levelId: "oth-L1", image, report: emptyReport }).scale?.status).toBe("todo");
  });

  it("marks the scale done once measured, showing it", () => {
    const scaled = { ...image, metresPerPixel: 0.0712 };
    const s = steps({ model: model(), levelId: "oth-L1", image: scaled, report: emptyReport });
    expect(s.scale?.status).toBe("done");
    expect(s.scale?.detail).toContain("0.071");
  });

  it("counts rooms on this level only", () => {
    const m = model({
      levels: [
        { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
        { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
      ],
      rooms: [room, { ...room, id: "L2-a", levelId: "oth-L2" }],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).rooms?.detail).toBe("1 room");
  });

  it("is not done connecting while a room is unreachable", () => {
    const r = report([{
      severity: "error", code: "room.unreachable", message: "cut off",
      entityType: "room", entityId: "L1-a", levelId: "oth-L1",
    }]);
    const s = steps({ model: model({ rooms: [room] }), levelId: "oth-L1", image: null, report: r });
    expect(s.connect?.status).toBe("todo");
    expect(s.connect?.detail).toContain("1 room");
  });

  it("counts a single room as connected, since there is nothing to connect it to", () => {
    const s = steps({ model: model({ rooms: [room] }), levelId: "oth-L1", image: null, report: emptyReport });
    expect(s.connect?.status).toBe("done");
  });

  it("treats entrances as building-wide, not per level", () => {
    const m = model({
      rooms: [room],
      entrances: [{ id: "e1", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] }],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).entrances?.status).toBe("done");
  });

  it("marks portals done when an endpoint serves this level", () => {
    const m = model({
      rooms: [room],
      portals: [{ id: "p1", kind: "lift", nameEn: "Lift", nameZh: "电梯" }],
      portalEndpoints: [
        { id: "p1-a", portalId: "p1", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] },
        { id: "p1-b", portalId: "p1", levelId: "oth-L1", roomId: "L1-a", point: [6, 6] },
      ],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).portals?.status).toBe("done");
  });

  it("files each issue under the step that owns it", () => {
    const r = report([
      { severity: "warning", code: "level.portals.none", message: "no lift", entityType: "level", entityId: "oth-L1", levelId: "oth-L1" },
      { severity: "error", code: "room.footprint.selfIntersecting", message: "bowtie", entityType: "room", entityId: "L1-a", levelId: "oth-L1" },
    ]);
    const s = steps({ model: model({ rooms: [room] }), levelId: "oth-L1", image: null, report: r });
    expect(s.portals?.issues.map(i => i.code)).toEqual(["level.portals.none"]);
    expect(s.rooms?.issues.map(i => i.code)).toEqual(["room.footprint.selfIntersecting"]);
  });

  it("ignores issues belonging to another level", () => {
    const r = report([{
      severity: "warning", code: "level.portals.none", message: "no lift",
      entityType: "level", entityId: "oth-L2", levelId: "oth-L2",
    }]);
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: r }).portals?.issues).toEqual([]);
  });

  it("keeps building-wide issues, which carry no level", () => {
    const r = report([{
      severity: "error", code: "building.entrances.none", message: "no entrance",
      entityType: "building", entityId: "oth",
    }]);
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: r }).entrances?.issues).toHaveLength(1);
  });

  it("survives a model that has not loaded yet", () => {
    expect(levelChecklist({ model: null, levelId: null, image: null, report: null })).toHaveLength(6);
  });
});

describe("stepForCode", () => {
  it("routes room geometry codes to the tracing step", () => {
    expect(stepForCode("room.footprint.degenerateArea")).toBe("rooms");
  });

  it("routes reachability to connecting", () => {
    expect(stepForCode("room.unreachable")).toBe("connect");
  });

  it("returns null for a code no step owns", () => {
    expect(stepForCode("placement.asset.missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/flow`
Expected: FAIL — cannot resolve `./checklist`.

- [ ] **Step 3: Implement**

`packages/editor/src/flow/checklist.ts`:

```ts
import type { MapModel, ValidationIssue, ValidationReport } from "@oth/model";
import type { LevelImage } from "../api/client";
import type { Tool } from "../state/store";

export type StepId = "floorplan" | "scale" | "rooms" | "connect" | "entrances" | "portals";
export type StepStatus = "todo" | "done";

export type ChecklistStep = {
  id: StepId;
  label: string;
  status: StepStatus;
  detail: string;
  /** The tool this step is done with, if any. */
  tool: Tool | null;
  issues: ValidationIssue[];
};

export type ChecklistInput = {
  model: MapModel | null;
  levelId: string | null;
  image: LevelImage | null;
  report: ValidationReport | null;
};

/**
 * Which step owns a validation code.
 *
 * This is the whole point of the checklist: nine identical
 * `level.portals.none` warnings become the status of one step per level
 * instead of a wall of text nobody reads.
 */
export function stepForCode(code: string): StepId | null {
  if (code.startsWith("room.footprint") || code.startsWith("room.hole")) return "rooms";
  if (code === "room.name.missing" || code === "room.id.duplicate") return "rooms";
  if (code === "room.unreachable" || code.startsWith("doorway.")) return "connect";
  if (code.startsWith("building.entrances") || code.startsWith("entrance.")) return "entrances";
  if (code.startsWith("level.portals") || code.startsWith("portal")) return "portals";
  return null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function levelChecklist(input: ChecklistInput): ChecklistStep[] {
  const { model, levelId, image, report } = input;

  const rooms = model && levelId ? model.rooms.filter(r => r.levelId === levelId) : [];
  const doorways = model && levelId ? model.doorways.filter(d => d.levelId === levelId) : [];
  const entrances = model?.entrances ?? [];
  const endpoints = model && levelId ? model.portalEndpoints.filter(p => p.levelId === levelId) : [];

  // Issues on this level, plus building-wide ones, which carry no level.
  const relevant = (report?.issues ?? []).filter(i => i.levelId == null || i.levelId === levelId);
  const byStep = new Map<StepId, ValidationIssue[]>();
  for (const issue of relevant) {
    const step = stepForCode(issue.code);
    if (!step) continue;
    byStep.set(step, [...(byStep.get(step) ?? []), issue]);
  }
  const issuesFor = (id: StepId) => byStep.get(id) ?? [];

  const unreachable = issuesFor("connect").filter(i => i.code === "room.unreachable");

  return [
    {
      id: "floorplan",
      label: "Add floorplan",
      status: image ? "done" : "todo",
      detail: image ? image.filename : "none yet",
      tool: null,
      issues: [],
    },
    {
      id: "scale",
      label: "Set the scale",
      status: image?.metresPerPixel != null ? "done" : "todo",
      detail: image?.metresPerPixel != null
        ? `${image.metresPerPixel.toFixed(4)} m per pixel`
        : "not set",
      tool: "calibrate",
      issues: [],
    },
    {
      id: "rooms",
      label: "Trace rooms",
      status: rooms.length > 0 ? "done" : "todo",
      detail: rooms.length > 0 ? plural(rooms.length, "room") : "none yet",
      tool: "draw-room",
      issues: issuesFor("rooms"),
    },
    {
      id: "connect",
      label: "Connect them",
      // A single room has nothing to be connected to, so it counts as done.
      status: unreachable.length === 0 && (rooms.length <= 1 || doorways.length > 0) ? "done" : "todo",
      detail: unreachable.length > 0
        ? `${plural(unreachable.length, "room")} unreachable`
        : plural(doorways.length, "doorway"),
      tool: "draw-doorway",
      issues: issuesFor("connect"),
    },
    {
      id: "entrances",
      label: "Mark entrances",
      // Building-wide: an entrance on L1 makes the whole building reachable.
      status: entrances.length > 0 ? "done" : "todo",
      detail: entrances.length > 0 ? plural(entrances.length, "entrance") : "none yet",
      tool: "place-entrance",
      issues: issuesFor("entrances"),
    },
    {
      id: "portals",
      label: "Lifts and stairs",
      status: endpoints.length > 0 ? "done" : "todo",
      detail: endpoints.length > 0 ? `${plural(endpoints.length, "endpoint")} here` : "none serving this level",
      tool: "place-portal",
      issues: issuesFor("portals"),
    },
  ];
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/flow
git add packages/editor/src/flow
git commit -m "feat(editor): derive a per-level checklist from the validation report"
```

---

## Task 2: The checklist panel

**Files:**
- Create: `packages/editor/src/panels/ChecklistPanel.tsx`, `src/panels/ChecklistPanel.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `ChecklistPanel` takes no props; reads the store.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/panels/ChecklistPanel.test.tsx`:

```tsx
import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { ChecklistPanel } from "./ChecklistPanel";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10]], heightM: 3, walkable: true }],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().setReport({ issues: [], errorCount: 0, warningCount: 0, ok: true });
});

describe("ChecklistPanel", () => {
  it("lists every step", () => {
    render(<ChecklistPanel />);
    for (const label of ["Add floorplan", "Set the scale", "Trace rooms", "Connect them", "Mark entrances", "Lifts and stairs"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("shows a step's detail", () => {
    render(<ChecklistPanel />);
    expect(screen.getByText("1 room")).toBeTruthy();
  });

  it("switches tool when a step is chosen", () => {
    render(<ChecklistPanel />);
    fireEvent.click(screen.getByText("Trace rooms"));
    expect(useEditorStore.getState().tool).toBe("draw-room");
  });

  it("marks the next unfinished step so there is always an obvious next action", () => {
    render(<ChecklistPanel />);
    // Floorplan is first and not done, so it is the one highlighted.
    expect(screen.getByTestId("step-floorplan").getAttribute("data-next")).toBe("true");
    expect(screen.getByTestId("step-rooms").getAttribute("data-next")).toBe("false");
  });

  it("shows a step's own issues under it", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "warning", code: "level.portals.none",
        message: 'Level "L1" has no lift, stair or escalator endpoint.',
        entityType: "level", entityId: "oth-L1", levelId: "oth-L1",
      }],
      errorCount: 0, warningCount: 1, ok: true,
    });
    render(<ChecklistPanel />);
    expect(screen.getByText(/no lift, stair or escalator/)).toBeTruthy();
  });

  it("selects the room an issue names, so it can be found on the canvas", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "error", code: "room.unreachable", message: "cut off",
        entityType: "room", entityId: "L1-a", levelId: "oth-L1",
      }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<ChecklistPanel />);
    fireEvent.click(screen.getByText("cut off"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/panels/ChecklistPanel.test.tsx`
Expected: FAIL — cannot resolve `./ChecklistPanel`.

- [ ] **Step 3: Implement**

`packages/editor/src/panels/ChecklistPanel.tsx`:

```tsx
import { levelChecklist } from "../flow/checklist";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";

const MARK = { done: "●", todo: "○" } as const;

export function ChecklistPanel() {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelId = useEditorStore(s => s.activeLevelId);
  const levelImages = useEditorStore(s => s.levelImages);
  const setTool = useEditorStore(s => s.setTool);
  const select = useEditorStore(s => s.select);

  const steps = levelChecklist({ model, levelId, image: imageForLevel(levelImages, levelId), report });
  // Exactly one step is "next": the first unfinished one. Without it the panel
  // is a status list, not guidance.
  const nextId = steps.find(s => s.status === "todo")?.id ?? null;

  return (
    <div className="border-b p-3 text-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        Steps for this level
      </h2>
      <ol className="space-y-1">
        {steps.map(step => (
          <li
            key={step.id}
            data-testid={`step-${step.id}`}
            data-next={String(step.id === nextId)}
            className={`rounded px-2 py-1 ${step.id === nextId ? "bg-amber-50 ring-1 ring-amber-300" : ""}`}
          >
            <button
              className="flex w-full items-baseline gap-2 text-left"
              onClick={() => step.tool && setTool(step.tool)}
            >
              <span className={step.status === "done" ? "text-emerald-600" : "text-stone-400"}>
                {MARK[step.status]}
              </span>
              <span className="flex-1">{step.label}</span>
              <span className="text-xs text-stone-500">{step.detail}</span>
            </button>

            {step.issues.length > 0 && (
              <ul className="ml-6 mt-1 space-y-0.5">
                {step.issues.map((issue, i) => (
                  <li key={`${issue.code}-${issue.entityId}-${i}`}>
                    <button
                      className="text-left text-xs hover:underline"
                      onClick={() => {
                        if (issue.entityType === "room") select({ type: "room", id: issue.entityId });
                      }}
                    >
                      <span className={issue.severity === "error" ? "text-red-700" : "text-amber-700"}>
                        {issue.severity === "error" ? "✕" : "!"}
                      </span>{" "}
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 4: Replace the warnings panel in the sidebar**

In `App.tsx`, put `ChecklistPanel` at the top of the right sidebar's scrolling area and drop `ValidationPanel` from it — the checklist now carries those issues. Keep `ValidationPanel` in the codebase; it is still the honest full view and its tests stay green.

```tsx
import { ChecklistPanel } from "./panels/ChecklistPanel";
```

```tsx
          <div className="min-h-0 flex-1 overflow-auto">
            <ChecklistPanel />
            <FloorplanPanel api={api} saver={saver} />
            <Inspector
              onRename={(id, version, nameEn) => void saver.update("room", id, version, { nameEn })}
            />
            ...
          </div>
```

- [ ] **Step 5: Run and commit**

```bash
npx vitest run packages/editor
git add packages/editor
git commit -m "feat(editor): guided per-level checklist replaces the wall of warnings"
```

---

## Task 3: Drawing that explains itself

**Files:**
- Create: `packages/editor/src/plan/DrawingHint.tsx`
- Modify: `src/plan/PlanCanvas.tsx`, `src/plan/PlanCanvas.test.tsx`

**Interfaces:**
- Produces: `DrawingHint` props `{ tool: Tool; pointCount: number }`.
- `PlanCanvas` gains: rubber band to cursor, vertex dots, close-on-first-vertex, `Backspace` undo, `Esc` cancel.

- [ ] **Step 1: Write the failing test**

Append to `PlanCanvas.test.tsx`:

```tsx
describe("drawing feedback", () => {
  beforeEach(() => useEditorStore.getState().setTool("draw-room"));

  it("explains what to do while drawing", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("drawing-hint").textContent).toMatch(/click/i);
  });

  it("shows a dot for each placed point", () => {
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(screen.getAllByTestId(/^draft-vertex-/)).toHaveLength(2);
  });

  it("rubber-bands from the last point to the cursor", () => {
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(surface, { clientX: 300, clientY: 220 });
    expect(screen.getByTestId("rubber-band")).toBeTruthy();
  });

  it("closes the shape when the first vertex is clicked", () => {
    const onCommitRoom = vi.fn();
    render(<PlanCanvas width={800} height={600} onCommitRoom={onCommitRoom} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.click(screen.getByTestId("draft-vertex-0"));
    expect(onCommitRoom).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("removes the last point on Backspace", () => {
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(useEditorStore.getState().draft).toHaveLength(1);
  });

  it("cancels the whole shape on Escape", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("shows no hint with the select tool", () => {
    useEditorStore.getState().setTool("select");
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.queryByTestId("drawing-hint")).toBeNull();
  });

  it("highlights what the cursor will snap to", () => {
    // A room already occupies 0..10 m, so a cursor near its corner snaps there.
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.mouseMove(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    expect(screen.getByTestId("snap-indicator")).toBeTruthy();
  });

  it("shows no snap indicator before the pointer has moved", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.queryByTestId("snap-indicator")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/PlanCanvas.test.tsx`
Expected: FAIL — no `drawing-hint`.

- [ ] **Step 3: Add the store action Backspace needs**

In `store.ts`:

```ts
  popDraftPoint: () => void;
```

```ts
  popDraftPoint: () =>
    set(state => ({ draft: state.draft && state.draft.length > 0 ? state.draft.slice(0, -1) : state.draft })),
```

- [ ] **Step 4: Implement the hint**

`packages/editor/src/plan/DrawingHint.tsx`:

```tsx
import type { Tool } from "../state/store";

const WHAT: Partial<Record<Tool, string>> = {
  "draw-room": "Drawing a room",
  "draw-doorway": "Drawing a doorway",
  "place-entrance": "Placing an entrance",
  "place-portal": "Placing a lift or stair",
  calibrate: "Measuring a known distance",
};

/**
 * Says what you are doing and how to finish. Without it the drawing tools are
 * discoverable only by guessing that double-click ends a shape.
 */
export function DrawingHint({ tool, pointCount }: { tool: Tool; pointCount: number }) {
  const what = WHAT[tool];
  if (!what) return null;

  const how = tool === "draw-room"
    ? pointCount === 0
      ? "Click to place the first corner."
      : pointCount < 3
        ? `${pointCount} of at least 3 corners. Backspace undoes, Esc cancels.`
        : "Click the first corner again to close, or double-click. Backspace undoes."
    : tool === "draw-doorway"
      ? pointCount === 0
        ? "Click one side of the opening."
        : "Click the other side, then double-click to finish."
      : tool === "calibrate"
        ? pointCount < 2
          ? `Click two points a known distance apart (${pointCount}/2).`
          : "Now type the real distance in the Floorplan panel."
        : "Click where it goes.";

  return (
    <div
      data-testid="drawing-hint"
      className="pointer-events-none absolute left-3 top-3 rounded bg-stone-900/85 px-3 py-2 text-xs text-white"
    >
      <div className="font-medium">{what}</div>
      <div className="opacity-80">{how}</div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the canvas changes**

In `PlanCanvas.tsx`:

Track the cursor and wire keys:

```tsx
  const [cursor, setCursor] = useState<Vec2 | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!state.draft) return;
      if (event.key === "Escape") state.clearDraft();
      if (event.key === "Backspace") {
        event.preventDefault();
        state.popDraftPoint();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);
```

Add a move handler on the surface:

```tsx
        onMouseMove={event => {
          if (state.tool === "select" || !state.draft) return;
          setCursor(pointerWorld(event));
        }}
```

Commit helper, so closing and double-click share one path:

```tsx
  function commitDraft() {
    const draft = state.draft;
    if (!draft) return;
    if (state.tool === "draw-room" && draft.length >= 3) onCommitRoom?.(draft);
    if (state.tool === "draw-doorway" && draft.length >= 2) {
      onCommitDoorway?.(draft[0]!, draft[draft.length - 1]!);
    }
    state.clearDraft();
    setCursor(null);
  }
```

and have `onSurfaceDoubleClick` call it.

Render the snap indicator, rubber band, vertex dots and hint (the hint sits outside the `<svg>`, so wrap the canvas in a `relative` container).

The snap indicator matters more than it sounds: snapping that you cannot see is
indistinguishable from the canvas moving your click somewhere you did not intend.

```tsx
      {cursor && (
        <circle
          data-testid="snap-indicator"
          cx={worldToScreen(state.viewport, cursor)[0]}
          cy={worldToScreen(state.viewport, cursor)[1]}
          r={7}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
```

```tsx
      {state.draft && state.draft.length > 0 && cursor && (
        <polyline
          data-testid="rubber-band"
          points={ringPoints([state.draft[state.draft.length - 1]!, cursor])}
          fill="none"
          stroke="#f2a33c"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      )}

      {state.draft?.map((p, i) => {
        const [cx, cy] = worldToScreen(state.viewport, p);
        return (
          <circle
            key={i}
            data-testid={`draft-vertex-${i}`}
            cx={cx}
            cy={cy}
            r={i === 0 ? 6 : 4}
            fill={i === 0 ? "#f2a33c" : "#ffffff"}
            stroke="#b45309"
            strokeWidth={2}
            style={{ cursor: i === 0 ? "pointer" : "default" }}
            onClick={event => {
              // Clicking the first vertex closes the shape.
              if (i !== 0) return;
              event.stopPropagation();
              commitDraft();
            }}
          />
        );
      })}
```

Wrap the return:

```tsx
  return (
    <div className="relative" style={{ width, height }}>
      <svg ...>...</svg>
      {state.tool !== "select" && (
        <DrawingHint tool={state.tool} pointCount={state.draft?.length ?? 0} />
      )}
    </div>
  );
```

- [ ] **Step 6: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor
git commit -m "feat(editor): rubber band, vertex dots, close-on-first-click and keyboard for drawing"
```

---

## Task 4: Vertex handles

**Files:**
- Create: `packages/editor/src/plan/VertexHandles.tsx`, `src/plan/VertexHandles.test.tsx`
- Modify: `src/plan/PlanCanvas.tsx`

**Interfaces:**
- Produces: `VertexHandles` props `{ room: Room; viewport: Viewport; toWorld: (e: {clientX:number;clientY:number}) => Vec2; onCommit: (ring: Ring) => void }`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/plan/VertexHandles.test.tsx`:

```tsx
import { RoomSchema } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VertexHandles } from "./VertexHandles";
import { DEFAULT_VIEWPORT } from "./viewport";

const room = RoomSchema.parse({
  id: "L1-a", levelId: "oth-L1", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 3, walkable: true,
});

function setup(onCommit = vi.fn()) {
  // A trivial screen-to-world so drag maths is checkable: 1 px is 1 m.
  const toWorld = (e: { clientX: number; clientY: number }): [number, number] => [e.clientX, e.clientY];
  render(
    <svg>
      <VertexHandles room={room} viewport={DEFAULT_VIEWPORT} toWorld={toWorld} onCommit={onCommit} />
    </svg>,
  );
  return { onCommit };
}

describe("VertexHandles", () => {
  it("renders a handle per vertex", () => {
    setup();
    expect(screen.getAllByTestId(/^vertex-/)).toHaveLength(4);
  });

  it("renders a midpoint per edge, for inserting", () => {
    setup();
    expect(screen.getAllByTestId(/^edge-mid-/)).toHaveLength(4);
  });

  it("commits once on release, not on every move", () => {
    const { onCommit } = setup();
    const handle = screen.getByTestId("vertex-1");
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 12, clientY: 3 });
    fireEvent.pointerMove(window, { clientX: 14, clientY: 5 });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { clientX: 14, clientY: 5 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits the moved ring", () => {
    const { onCommit } = setup();
    fireEvent.pointerDown(screen.getByTestId("vertex-1"), { clientX: 10, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 14, clientY: 5 });
    fireEvent.pointerUp(window, { clientX: 14, clientY: 5 });
    expect(onCommit.mock.calls[0]![0][1]).toEqual([14, 5]);
  });

  it("leaves the other vertices untouched", () => {
    const { onCommit } = setup();
    fireEvent.pointerDown(screen.getByTestId("vertex-1"), { clientX: 10, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 14, clientY: 5 });
    fireEvent.pointerUp(window, { clientX: 14, clientY: 5 });
    const ring = onCommit.mock.calls[0]![0];
    expect(ring[0]).toEqual([0, 0]);
    expect(ring[3]).toEqual([0, 10]);
  });

  it("inserts a vertex when an edge midpoint is clicked", () => {
    const { onCommit } = setup();
    fireEvent.click(screen.getByTestId("edge-mid-0"));
    expect(onCommit.mock.calls[0]![0]).toHaveLength(5);
  });

  it("deletes a vertex on Delete while one is selected", () => {
    const { onCommit } = setup();
    fireEvent.click(screen.getByTestId("vertex-2"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onCommit.mock.calls[0]![0]).toHaveLength(3);
  });

  it("refuses to delete below three vertices", () => {
    const onCommit = vi.fn();
    const triangle = RoomSchema.parse({ ...room, footprint: [[0, 0], [5, 0], [0, 5]] });
    const toWorld = (e: { clientX: number; clientY: number }): [number, number] => [e.clientX, e.clientY];
    render(
      <svg>
        <VertexHandles room={triangle} viewport={DEFAULT_VIEWPORT} toWorld={toWorld} onCommit={onCommit} />
      </svg>,
    );
    fireEvent.click(screen.getByTestId("vertex-0"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
```

"Commits once on release" is the load-bearing test: saving per mouse-move would issue dozens of optimistic-locked writes and every one after the first would 409.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/VertexHandles.test.tsx`
Expected: FAIL — cannot resolve `./VertexHandles`.

- [ ] **Step 3: Implement**

`packages/editor/src/plan/VertexHandles.tsx`:

```tsx
import type { Ring, Room, Vec2 } from "@oth/model";
import { useEffect, useState } from "react";
import { deleteVertex, insertVertex, MIN_RING_LENGTH, moveVertex } from "./ring";
import { worldToScreen, type Viewport } from "./viewport";

export function VertexHandles({
  room, viewport, toWorld, onCommit,
}: {
  room: Room;
  viewport: Viewport;
  toWorld: (e: { clientX: number; clientY: number }) => Vec2;
  onCommit: (ring: Ring) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [live, setLive] = useState<Ring | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const ring = live ?? room.footprint;

  // Drag maths lives on window, so the pointer can leave the small handle.
  useEffect(() => {
    if (dragging === null) return;

    const onMove = (event: PointerEvent) => {
      setLive(current => moveVertex(current ?? room.footprint, dragging, toWorld(event)));
    };
    const onUp = (event: PointerEvent) => {
      const moved = moveVertex(live ?? room.footprint, dragging, toWorld(event));
      setDragging(null);
      setLive(null);
      // One save per gesture: writing on every move would fire dozens of
      // optimistic-locked updates and every one after the first would 409.
      onCommit(moved);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, live, room.footprint, toWorld, onCommit]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (selected === null) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (room.footprint.length <= MIN_RING_LENGTH) return;
      event.preventDefault();
      onCommit(deleteVertex(room.footprint, selected));
      setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, room.footprint, onCommit]);

  return (
    <g>
      {ring.map((p, i) => {
        const [x, y] = worldToScreen(viewport, p);
        return (
          <circle
            key={`v-${i}`}
            data-testid={`vertex-${i}`}
            cx={x}
            cy={y}
            r={6}
            fill={selected === i ? "#f2a33c" : "#ffffff"}
            stroke="#57534e"
            strokeWidth={2}
            style={{ cursor: "grab" }}
            onPointerDown={event => {
              event.stopPropagation();
              setSelected(i);
              setDragging(i);
            }}
            onClick={event => {
              event.stopPropagation();
              setSelected(i);
            }}
          />
        );
      })}

      {ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const [x, y] = worldToScreen(viewport, mid);
        return (
          <circle
            key={`m-${i}`}
            data-testid={`edge-mid-${i}`}
            cx={x}
            cy={y}
            r={4}
            fill="#d6d3d1"
            stroke="#78716c"
            strokeWidth={1}
            style={{ cursor: "copy" }}
            onClick={event => {
              event.stopPropagation();
              onCommit(insertVertex(room.footprint, i, mid));
            }}
          />
        );
      })}
    </g>
  );
}
```

- [ ] **Step 4: Wire into the canvas**

In `PlanCanvas.tsx`, render handles for the selected room when the select tool is active, after the room polygons:

```tsx
      {state.tool === "select" && selectedRoom && (
        <VertexHandles
          room={selectedRoom}
          viewport={state.viewport}
          toWorld={pointerWorld}
          onCommit={ring => onReshapeRoom?.(selectedRoom, ring)}
        />
      )}
```

with, above the return:

```tsx
  const selectedRoom = state.selection?.type === "room"
    ? rooms.find(r => r.id === state.selection?.id) ?? null
    : null;
```

and a new prop:

```tsx
  onReshapeRoom?: (room: Room, ring: Ring) => void;
```

In `App.tsx`:

```tsx
            onReshapeRoom={(room, footprint) =>
              void saver.update("room", room.id, room.version, { footprint })
            }
```

- [ ] **Step 5: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor
git commit -m "feat(editor): draggable vertex handles with insert and delete"
```

---

## Task 5: Placement selection and transform editing

**Files:**
- Create: `packages/editor/src/panels/PlacementInspector.tsx`, `src/panels/PlacementInspector.test.tsx`
- Modify: `src/state/store.ts` (selection type), `src/plan/PlanCanvas.tsx`, `src/App.tsx`

**Interfaces:**
- `Selection` gains `"placement"`.
- `PlacementInspector` props `{ onChange: (placement: Placement, patch: Record<string, unknown>) => void }`.

- [ ] **Step 1: Widen the selection type**

In `store.ts`:

```ts
export type Selection =
  | { type: "room" | "doorway" | "entrance" | "portalEndpoint" | "placement"; id: string }
  | null;
```

- [ ] **Step 2: Write the failing test**

`packages/editor/src/panels/PlacementInspector.test.tsx`:

```tsx
import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { PlacementInspector } from "./PlacementInspector";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  assets: [{
    id: "asset_1", filename: "arch.glb", storagePath: "a", checksum: "c",
    sizeBytes: 10, triangleCount: 5,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  }],
  placements: [{
    id: "pl_1", levelId: "oth-L1", assetId: "asset_1",
    position: [5, 7, 0], rotationDeg: 90, scale: 2,
  }],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("PlacementInspector", () => {
  it("shows nothing when no placement is selected", () => {
    const { container } = render(<PlacementInspector onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the current transform", () => {
    useEditorStore.getState().select({ type: "placement", id: "pl_1" });
    render(<PlacementInspector onChange={vi.fn()} />);
    expect((screen.getByLabelText(/east/i) as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText(/rotation/i) as HTMLInputElement).value).toBe("90");
    expect((screen.getByLabelText(/scale/i) as HTMLInputElement).value).toBe("2");
  });

  it("names the asset, so you know what you are moving", () => {
    useEditorStore.getState().select({ type: "placement", id: "pl_1" });
    render(<PlacementInspector onChange={vi.fn()} />);
    expect(screen.getByText("arch.glb")).toBeTruthy();
  });

  it("saves a moved position", () => {
    const onChange = vi.fn();
    useEditorStore.getState().select({ type: "placement", id: "pl_1" });
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/east/i), { target: { value: "12" } });
    fireEvent.blur(screen.getByLabelText(/east/i));
    expect(onChange.mock.calls[0]![1]).toMatchObject({ position: [12, 7, 0] });
  });

  it("saves rotation and scale", () => {
    const onChange = vi.fn();
    useEditorStore.getState().select({ type: "placement", id: "pl_1" });
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/rotation/i), { target: { value: "180" } });
    fireEvent.blur(screen.getByLabelText(/rotation/i));
    expect(onChange.mock.calls[0]![1]).toMatchObject({ rotationDeg: 180 });
  });

  it("ignores a non-numeric entry rather than writing NaN", () => {
    const onChange = vi.fn();
    useEditorStore.getState().select({ type: "placement", id: "pl_1" });
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/scale/i), { target: { value: "big" } });
    fireEvent.blur(screen.getByLabelText(/scale/i));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a non-positive scale, which the model rejects anyway", () => {
    const onChange = vi.fn();
    useEditorStore.getState().select({ type: "placement", id: "pl_1" });
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/scale/i), { target: { value: "0" } });
    fireEvent.blur(screen.getByLabelText(/scale/i));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/panels/PlacementInspector.test.tsx`
Expected: FAIL — cannot resolve `./PlacementInspector`.

- [ ] **Step 4: Implement**

`packages/editor/src/panels/PlacementInspector.tsx`:

```tsx
import type { Placement } from "@oth/model";
import { useEditorStore } from "../state/store";

export function PlacementInspector({
  onChange,
}: {
  onChange: (placement: Placement, patch: Record<string, unknown>) => void;
}) {
  const model = useEditorStore(s => s.model);
  const selection = useEditorStore(s => s.selection);

  if (!model || selection?.type !== "placement") return null;
  const placement = model.placements.find(p => p.id === selection.id);
  if (!placement) return null;

  const asset = model.assets.find(a => a.id === placement.assetId);

  function axis(index: 0 | 1 | 2, label: string) {
    return (
      <label className="block flex-1 text-xs">
        {label}
        <input
          aria-label={label}
          className="mt-1 w-full rounded border px-2 py-1"
          inputMode="decimal"
          defaultValue={placement!.position[index]}
          onBlur={e => {
            const value = Number.parseFloat(e.target.value);
            if (!Number.isFinite(value)) return;
            const position = [...placement!.position] as [number, number, number];
            position[index] = value;
            onChange(placement!, { position });
          }}
        />
      </label>
    );
  }

  return (
    <div className="space-y-3 border-b p-3 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">Placement</div>
        <div>{asset?.filename ?? placement.assetId}</div>
      </div>

      <div className="flex gap-2">
        {axis(0, "East (m)")}
        {axis(1, "North (m)")}
        {axis(2, "Up (m)")}
      </div>

      <div className="flex gap-2">
        <label className="block flex-1 text-xs">
          Rotation (°)
          <input
            aria-label="Rotation in degrees"
            className="mt-1 w-full rounded border px-2 py-1"
            inputMode="decimal"
            defaultValue={placement.rotationDeg}
            onBlur={e => {
              const value = Number.parseFloat(e.target.value);
              if (!Number.isFinite(value)) return;
              onChange(placement, { rotationDeg: value });
            }}
          />
        </label>
        <label className="block flex-1 text-xs">
          Scale
          <input
            aria-label="Scale"
            className="mt-1 w-full rounded border px-2 py-1"
            inputMode="decimal"
            defaultValue={placement.scale}
            onBlur={e => {
              const value = Number.parseFloat(e.target.value);
              // The model rejects a non-positive scale; refuse before the round trip.
              if (!Number.isFinite(value) || value <= 0) return;
              onChange(placement, { scale: value });
            }}
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Make placements selectable on the canvas**

In `PlanCanvas.tsx`, after the room polygons, render a marker per placement on this level:

```tsx
      {state.model?.placements
        .filter(p => p.levelId === state.activeLevelId)
        .map(p => {
          const [x, y] = worldToScreen(state.viewport, [p.position[0], p.position[1]]);
          return (
            <rect
              key={p.id}
              data-testid={`placement-${p.id}`}
              x={x - 5}
              y={y - 5}
              width={10}
              height={10}
              fill={state.selection?.id === p.id ? "#f2a33c" : "#8b5cf6"}
              stroke="#4c1d95"
              strokeWidth={1}
              onClick={event => {
                if (state.tool !== "select") return;
                event.stopPropagation();
                state.select({ type: "placement", id: p.id });
              }}
            />
          );
        })}
```

- [ ] **Step 6: Drag a placement in plan view**

Typing coordinates is precise but slow; the spec asks for both. Add to
`PlanCanvas.test.tsx`:

```tsx
  it("drags a placement and saves once on release", () => {
    const onMovePlacement = vi.fn();
    useEditorStore.getState().setTool("select");
    render(<PlanCanvas width={800} height={600} onMovePlacement={onMovePlacement} />);
    const marker = screen.getByTestId("placement-pl_1");
    fireEvent.pointerDown(marker, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 130 });
    expect(onMovePlacement).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { clientX: 140, clientY: 130 });
    expect(onMovePlacement).toHaveBeenCalledTimes(1);
  });
```

(The test model needs a placement; reuse the one from
`PlacementInspector.test.tsx` by adding `assets` and `placements` to the model
built at the top of `PlanCanvas.test.tsx`.)

In `PlanCanvas.tsx`, add the prop and a drag effect mirroring `VertexHandles` —
window-level pointer listeners, one save on release:

```tsx
  onMovePlacement?: (placement: Placement, position: [number, number, number]) => void;
```

```tsx
  const [draggingPlacement, setDraggingPlacement] = useState<string | null>(null);

  useEffect(() => {
    if (!draggingPlacement) return;
    const placement = state.model?.placements.find(p => p.id === draggingPlacement);
    if (!placement) return;

    const onUp = (event: PointerEvent) => {
      const [x, y] = pointerWorld(event);
      setDraggingPlacement(null);
      // One save per gesture, as with vertex dragging.
      onMovePlacement?.(placement, [x, y, placement.position[2]]);
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [draggingPlacement, state.model, onMovePlacement, pointerWorld]);
```

and on the placement marker:

```tsx
              onPointerDown={event => {
                if (state.tool !== "select") return;
                event.stopPropagation();
                state.select({ type: "placement", id: p.id });
                setDraggingPlacement(p.id);
              }}
```

In `App.tsx`:

```tsx
            onMovePlacement={(placement, position) =>
              void saver.update("placement", placement.id, placement.version, { position })
            }
```

- [ ] **Step 7: Mount it**

In `App.tsx`, above `Inspector`:

```tsx
            <PlacementInspector
              onChange={(placement, patch) =>
                void saver.update("placement", placement.id, placement.version, patch)
              }
            />
```

- [ ] **Step 8: Run everything and commit**

```bash
npm test
npm run typecheck
npm run build --workspace @oth/editor
git add packages/editor
git commit -m "feat(editor): select, drag and edit the transform of placements"
```

---

## Done criteria

- `npm test` green, `npm run typecheck` clean, editor builds.
- A teammate opening a level sees an ordered checklist with exactly one step marked as next.
- The nine `level.portals.none` warnings appear as one step's status per level, not as a list.
- Drawing shows what to do, rubber-bands to the cursor, closes on clicking the first corner, and undoes with Backspace.
- A room's vertices can be dragged, inserted and deleted, issuing exactly one save per gesture.
- A placement can be selected and its transform edited.
