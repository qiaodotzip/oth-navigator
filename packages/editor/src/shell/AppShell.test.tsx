import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { AppShell } from "./AppShell";

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("AppShell", () => {
  // T11 / I2: the presence-and-locks poll must not run while nobody is signed
  // in — otherwise it is a stream of 401s for as long as the session stays
  // expired or the visitor stays signed out.
  it("does not poll presence while signed out", async () => {
    const api = fakeApi();
    const saver = createSaver(api);
    render(
      <AppShell api={api} saver={saver} route={{ name: "floors" }}>
        <p>content</p>
      </AppShell>,
    );
    await new Promise(r => setTimeout(r, 30));
    expect(api.heartbeat).not.toHaveBeenCalled();
  });

  it("polls presence once someone is signed in", async () => {
    const api = fakeApi();
    const saver = createSaver(api);
    useEditorStore.getState().setUser({ id: "u1", email: "ada@oth.local", displayName: "Ada" });
    render(
      <AppShell api={api} saver={saver} route={{ name: "floors" }}>
        <p>content</p>
      </AppShell>,
    );
    await waitFor(() => expect(api.heartbeat).toHaveBeenCalled());
  });
});
