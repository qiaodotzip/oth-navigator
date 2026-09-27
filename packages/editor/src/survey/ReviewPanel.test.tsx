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

const api = {
  keyframeFileUrl: (id: string, w?: number) => `/api/keyframes/${id}/file${w ? `?w=${w}` : ""}`,
  acceptPlace: vi.fn().mockResolvedValue({ sightings: 2 }),
  rejectPlace: vi.fn().mockResolvedValue({ sightings: 2 }),
};

function setup() {
  const saver = {
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    // Runs the request, then reloads once — the saver's usual guard.
    apply: vi.fn(async (_type: string, _id: string, run: () => Promise<unknown>) => {
      await run();
      return true;
    }),
  };
  render(<ReviewPanel api={api as unknown as Api} saver={saver as unknown as Saver} />);
  return saver;
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  api.acceptPlace.mockClear();
  api.rejectPlace.mockClear();
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

  it("shows the evidence as small, lazily loaded frames", () => {
    // 185 cards of up to six 4K frames each is not a queue anyone can load.
    setup();
    const img = screen.getByAltText("frame kf_1");
    expect(img.getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=320");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("says how sure to be: who proposed it, and what they were unsure about", () => {
    setup();
    const card = screen.getByTestId("review-p1");
    expect(card.textContent).toContain("claude-code");
    expect(card.textContent).toContain("sign partly obscured");
  });

  it("accepts the place and its sightings in one request, not one per sighting", async () => {
    // One claim, one write, one reload: it was a round trip per sighting,
    // each followed by reloading the whole model.
    const saver = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledTimes(1));
    expect(api.acceptPlace).toHaveBeenCalledWith("p1", 0, { nameEn: "NTUC FairPrice", category: "retail" });
    expect(saver.apply).toHaveBeenCalledTimes(1);
    expect(saver.update).not.toHaveBeenCalled();
  });

  it("keeps a correction made before accepting", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name for p1"), { target: { value: "NTUC Finest" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalled());
    expect(api.acceptPlace.mock.calls[0]![2]).toMatchObject({ nameEn: "NTUC Finest" });
  });

  it("will not accept a name someone has emptied", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name for p1"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Accept" }).hasAttribute("disabled")).toBe(true);
  });

  it("bins the place with its sightings in one request on reject", async () => {
    const saver = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(api.rejectPlace).toHaveBeenCalledWith("p1", 0));
    expect(saver.remove).not.toHaveBeenCalled();
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
