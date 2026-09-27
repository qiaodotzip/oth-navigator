import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { useEditorStore } from "./state/store";
import { fakeApi } from "./testing/fakeApi";

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("App", () => {
  // AuthGate keeps the Build screen mounted through an expired session (no
  // user). A real embedded Build tab needs WebGL for its preview, which
  // jsdom cannot give it, so this pins the underlying rule directly: no
  // early return on `user` blanks the layout. Workspace.test.tsx covers the
  // full behaviour with a real (Survey) tab.
  it("renders its layout even with no signed-in user", () => {
    render(<App api={fakeApi()} />);
    expect(screen.getByText("OTH Map Editor")).toBeTruthy();
  });
});
