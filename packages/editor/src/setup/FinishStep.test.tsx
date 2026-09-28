import type { Level } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { FinishStep } from "./FinishStep";

const L1 = sampleModel.levels[0] as Level;

beforeEach(() => {
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(sampleModel);
  s.setTeam(sampleTeam);
  s.setActiveLevel("oth-L1");
});

describe("FinishStep", () => {
  it("hands the floor over to normal editing", () => {
    const onFinish = vi.fn();
    render(<FinishStep api={fakeApi()} level={L1} state={null} left={[]} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and open Build" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("offers the floor as a 3D model", () => {
    render(<FinishStep api={fakeApi()} level={L1} state={null} left={[]} onFinish={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Download 3D model" })).toBeEnabled();
  });

  it("says who finished it, once someone has, and still links to Build", () => {
    const state = {
      step: "finish" as const, status: "done" as const, note: "",
      finishedBy: "u_wei", finishedVia: null, finishedAt: new Date().toISOString(),
    };
    render(<FinishStep api={fakeApi()} level={L1} state={state} left={[]} onFinish={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("✓ Done by Wei Kang, just now");
    expect(screen.queryByRole("button", { name: /Finish setup/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Open Build" }).getAttribute("href")).toBe("/floors/L1/build");
  });

  it("says the floor is set up only when every step before it is done or skipped", () => {
    const { unmount } = render(<FinishStep api={fakeApi()} level={L1} state={null} left={[]} onFinish={vi.fn()} />);
    expect(screen.getByText(/^L1 is set up\. From here the team edits it as usual/)).toBeTruthy();
    unmount();
    render(<FinishStep api={fakeApi()} level={L1} state={null} left={[5, 7]} onFinish={vi.fn()} />);
    expect(screen.queryByText(/L1 is set up/)).toBeNull();
    expect(screen.getByText(/^Steps 5 and 7 aren't done yet\. Finish setup hands L1 over as it is\./)).toBeTruthy();
  });

  it("says which step was left when the floor was handed over with one not done", () => {
    const state = {
      step: "finish" as const, status: "done" as const, note: "",
      finishedBy: "u_wei", finishedVia: null, finishedAt: new Date().toISOString(),
    };
    render(<FinishStep api={fakeApi()} level={L1} state={state} left={[6]} onFinish={vi.fn()} />);
    expect(screen.getByText(/^L1 was handed over with step 6 not done\./)).toBeTruthy();
  });

  it("keeps its status line in place, empty until the floor is handed over", () => {
    render(<FinishStep api={fakeApi()} level={L1} state={null} left={[]} onFinish={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
