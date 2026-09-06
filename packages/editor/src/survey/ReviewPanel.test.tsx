import { parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { ReviewPanel } from "./ReviewPanel";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  captures: [{ id: "cap_1", kind: "video", filename: "a.mp4" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 64, heightPx: 48 },
    { id: "kf_2", captureId: "cap_1", timeMs: 1000, imageId: "kf_2", widthPx: 64, heightPx: 48 },
  ],
  places: [
    { id: "p1", nameEn: "NTUC FairPrice", category: "retail", levelId: "oth-L1", status: "proposed", proposedBy: "claude-code", notes: "sign partly obscured" },
    { id: "p2", nameEn: "Mine already", category: "retail", status: "confirmed" },
  ],
  sightings: [
    { id: "s1", placeId: "p1", keyframeId: "kf_1", status: "proposed" },
    { id: "s2", placeId: "p1", keyframeId: "kf_2", status: "proposed" },
  ],
});

const api = { keyframeFileUrl: (id: string) => `/api/keyframes/${id}/file` } as unknown as Api;

function setup() {
  const saver = {
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
  } as unknown as Saver;
  render(<ReviewPanel api={api} saver={saver} />);
  return saver as unknown as { update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("ReviewPanel", () => {
  it("queues what an agent proposed, and not what is already mine", () => {
    setup();
    expect(screen.getByTestId("review-p1")).toBeTruthy();
    expect(screen.queryByTestId("review-p2")).toBeNull();
  });

  it("shows the frames it was read from, which is what settles it", () => {
    setup();
    expect(screen.getByAltText("frame kf_1")).toBeTruthy();
    expect(screen.getByAltText("frame kf_2")).toBeTruthy();
  });

  it("says how sure to be: who proposed it, and what they were unsure about", () => {
    setup();
    const card = screen.getByTestId("review-p1");
    expect(card.textContent).toContain("claude-code");
    expect(card.textContent).toContain("sign partly obscured");
  });

  it("confirms the place and its sightings together on accept", async () => {
    // Leaving the sightings proposed would put the place back in the queue.
    const saver = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledTimes(3));
    expect(saver.update.mock.calls[0]![3]).toMatchObject({ status: "confirmed" });
    expect(saver.update.mock.calls[1]![0]).toBe("sighting");
  });

  it("keeps a correction made before accepting", async () => {
    const saver = setup();
    fireEvent.change(screen.getByLabelText("Name for p1"), { target: { value: "NTUC Finest" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(saver.update).toHaveBeenCalled());
    expect(saver.update.mock.calls[0]![3]).toMatchObject({ nameEn: "NTUC Finest" });
  });

  it("will not accept a name someone has emptied", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name for p1"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Accept" }).hasAttribute("disabled")).toBe(true);
  });

  it("bins the sightings with the place on reject", async () => {
    const saver = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(saver.remove).toHaveBeenCalledTimes(3));
  });

  it("says the queue is clear rather than showing nothing", () => {
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      places: [{ id: "p2", nameEn: "Mine", category: "retail", status: "confirmed" }],
    }));
    setup();
    expect(screen.getByText(/1 place confirmed/i)).toBeTruthy();
  });

  it("explains how to fill an empty queue when nothing has been labelled", () => {
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    }));
    setup();
    expect(screen.getByText(/label a capture/i)).toBeTruthy();
  });
});
