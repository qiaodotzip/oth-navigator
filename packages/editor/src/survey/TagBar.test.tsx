import { PathwayKindSchema, PlaceSchema, type Box } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagBar, type TagBarHandle } from "./TagBar";
import type { Tag } from "./tagging";

const L1 = "oth-L1";
const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail", levelId: L1 }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community", levelId: L1 }),
  PlaceSchema.parse({ id: "p3", nameEn: "Gate 1", category: "facility" }),
];
const levels = new Map<string, string | undefined>([["p1", L1], ["p2", L1], ["p3", undefined]]);
const counts = new Map([["p1", 7], ["p3", 1]]);
const kinds = [PathwayKindSchema.parse({ id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" })];

function setup(box: Box | null = null, candidates = places, rooms: ReadonlySet<string> = new Set()) {
  // Every tag is taken, unless a test says otherwise.
  const onTag = vi.fn<[Tag], boolean>(() => true);
  const onAddWalkwayKind = vi.fn(async () => "pk-2");
  const ref = createRef<TagBarHandle>();
  render(
    <TagBar
      ref={ref} candidates={candidates} levels={levels} levelId={L1} counts={counts}
      walkwayKinds={kinds} rooms={rooms} box={box} onTag={onTag} onAddWalkwayKind={onAddWalkwayKind}
    />,
  );
  return { onTag, onAddWalkwayKind, ref, name: screen.getByLabelText("Place name") as HTMLInputElement };
}

describe("TagBar", () => {
  it("tags the whole frame when no box is drawn", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ nameEn: "Kopitiam" }));
    expect(onTag.mock.calls[0]![0].box).toBeUndefined();
  });

  it("tags the box that was drawn", () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const { onTag, name } = setup(box);
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag.mock.calls[0]![0].box).toEqual(box);
  });

  it("ignores a box too small to have been drawn on purpose", () => {
    const { onTag, name } = setup({ x: 0.1, y: 0.2, w: 0.004, h: 0.004 });
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0].box).toBeUndefined();
  });

  it("links to a place that exists, whatever the case and spacing, rather than making a second", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "  ntuc   fairprice " } });
    fireEvent.click(screen.getByRole("button", { name: /Tag as NTUC FairPrice/ }));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ placeId: "p1" }));
  });

  it("keeps an existing place's category, rather than letting one frame change it", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Public Library" } });
    expect((screen.getByLabelText("Category") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Tag as/ }));
    expect(onTag.mock.calls[0]![0].category).toBe("community");
  });

  it("makes a new place, with the category chosen, when the name is new", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Fresh Bakery" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "lifestyle" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ placeId: null, nameEn: "Fresh Bakery", category: "lifestyle" }));
  });

  it("puts the cursor in the name instead of tagging with no name", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(name);
  });

  it("tags on Enter, since the hands are already on the keyboard", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(onTag).toHaveBeenCalledTimes(1);
  });

  it("clears the name after tagging, ready for the next thing in frame", () => {
    const { name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(name.value).toBe("");
  });

  it("keeps the name when the tag is not taken, so it can be sent again", () => {
    // A tag refused while the last change saves must not be lost with its text.
    const { onTag, name } = setup();
    onTag.mockReturnValue(false);
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(onTag).toHaveBeenCalledTimes(1);
    expect(name.value).toBe("Kopitiam");
  });

  it("suggests this floor's places first, with how often each was seen", () => {
    setup();
    const options = [...document.querySelectorAll("#place-suggestions option")] as HTMLOptionElement[];
    expect(options.map(o => [o.value, o.label])).toEqual([
      ["NTUC FairPrice", "7 frames"],
      ["Public Library", "0 frames"],
      ["Gate 1", "1 frame · no floor yet"],
    ]);
  });

  it("says whether it is about to tag the frame or the box", () => {
    setup();
    expect(screen.getByText(/tagging the whole frame/i)).toBeTruthy();
  });

  it("can be focused and submitted from the workspace's keys", () => {
    const { onTag, ref, name } = setup();
    act(() => ref.current!.focus());
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    act(() => ref.current!.submit());
    expect(onTag).toHaveBeenCalledTimes(1);
  });
});

describe("tagging a walkway", () => {
  it("tags the boxed floor as a walkway of a chosen type", () => {
    const { onTag, name } = setup();
    fireEvent.click(screen.getByTestId("what-walkway"));
    fireEvent.change(screen.getByLabelText("Walkway type"), { target: { value: "pk-1" } });
    fireEvent.change(name, { target: { value: "Festive Walk east" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0]).toMatchObject({ nameEn: "Festive Walk east", pathwayKindId: "pk-1", category: "facility" });
  });

  it("hides the tenant category, which means nothing for a walkway", () => {
    setup();
    fireEvent.click(screen.getByTestId("what-walkway"));
    expect(screen.queryByLabelText("Category")).toBeNull();
  });

  it("defines a new type in place, with no prompt", async () => {
    const { onAddWalkwayKind } = setup();
    fireEvent.click(screen.getByTestId("what-walkway"));
    fireEvent.click(screen.getByRole("button", { name: "+ New type" }));
    fireEvent.change(screen.getByLabelText("New walkway type"), { target: { value: "Ramp" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add type" })); });
    expect(onAddWalkwayKind).toHaveBeenCalledWith("Ramp");
    expect(screen.queryByLabelText("New walkway type")).toBeNull();
  });

  it("still tags an ordinary place when that is what it is", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0].pathwayKindId).toBeUndefined();
  });
});

describe("tagging an object", () => {
  const binPlace = PlaceSchema.parse({ id: "p_bin", nameEn: "Wastebin", category: "facility", objectKindId: "ok_bin" });
  const cooler = PlaceSchema.parse({ id: "p_cool", nameEn: "Water cooler", category: "facility" });
  const withObjects = [...places, binPlace, cooler];

  it("tags a new name as a kind of object, with no category to choose, and says its size is a guess", () => {
    const { onTag, name } = setup(null, withObjects);
    fireEvent.click(screen.getByTestId("what-object"));
    expect(screen.queryByLabelText("Category")).toBeNull();
    fireEvent.change(name, { target: { value: "Recycling bin" } });
    expect(screen.getByText("A new kind of object. It shows as a 0.5 × 0.5 × 1 m box until you set its size in Places.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0]).toEqual({ placeId: null, nameEn: "Recycling bin", category: "facility", object: true });
  });

  it("tags another of a kind already known", () => {
    const { onTag, name } = setup(null, withObjects);
    fireEvent.click(screen.getByTestId("what-object"));
    fireEvent.change(name, { target: { value: "wastebin" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag as Wastebin" }));
    expect(onTag.mock.calls[0]![0]).toMatchObject({ placeId: "p_bin", object: true });
  });

  it("says a place already surveyed becomes a kind of object, and its button says it will make it one", () => {
    const { onTag, name } = setup(null, withObjects);
    fireEvent.click(screen.getByTestId("what-object"));
    fireEvent.change(name, { target: { value: "water cooler" } });
    expect(screen.getByText("Water cooler becomes a kind of object.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tag as Water cooler" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Make Water cooler an object" }));
    expect(onTag.mock.calls[0]![0]).toMatchObject({ placeId: "p_cool", object: true });
  });

  it("goes back to Place once an object's tag is taken, since objects are few and far between", () => {
    const { name } = setup(null, withObjects);
    fireEvent.click(screen.getByTestId("what-object"));
    fireEvent.change(name, { target: { value: "wastebin" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(screen.getByTestId("what-place").getAttribute("aria-pressed")).toBe("true");
    // So the next name typed is a place again, and a shop is never made an object by the mode left on.
    fireEvent.change(name, { target: { value: "NTUC FairPrice" } });
    expect(screen.getByRole("button", { name: "Tag as NTUC FairPrice" })).toBeTruthy();
  });

  it("stays on Object when the tag is not taken, so it is sent again as one", () => {
    const { onTag, name } = setup(null, withObjects);
    onTag.mockReturnValue(false);
    fireEvent.click(screen.getByTestId("what-object"));
    fireEvent.change(name, { target: { value: "wastebin" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(screen.getByTestId("what-object").getAttribute("aria-pressed")).toBe("true");
  });

  describe("a place bound to a room on the map", () => {
    const starbucks = PlaceSchema.parse({ id: "p_star", nameEn: "Starbucks", category: "retail", roomId: "L1-shop" });
    const withShop = [...withObjects, starbucks];

    it("is never made an object: it says why, and tags nothing", () => {
      const { onTag, name } = setup(null, withShop, new Set(["L1-shop"]));
      fireEvent.click(screen.getByTestId("what-object"));
      fireEvent.change(name, { target: { value: "starbucks" } });
      expect(screen.getByText("Starbucks is a room on the map, so it can't be an object.")).toBeTruthy();
      const button = screen.getByRole("button", { name: "Make Starbucks an object" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.keyDown(name, { key: "Enter" });
      expect(onTag).not.toHaveBeenCalled();
      expect(name.value).toBe("starbucks");
    });

    it("can be, once its room is gone from the map", () => {
      const { onTag, name } = setup(null, withShop, new Set());
      fireEvent.click(screen.getByTestId("what-object"));
      fireEvent.change(name, { target: { value: "starbucks" } });
      fireEvent.click(screen.getByRole("button", { name: "Make Starbucks an object" }));
      expect(onTag.mock.calls[0]![0]).toMatchObject({ placeId: "p_star", object: true });
    });

    it("is still tagged as a place", () => {
      const { onTag, name } = setup(null, withShop, new Set(["L1-shop"]));
      fireEvent.change(name, { target: { value: "starbucks" } });
      fireEvent.click(screen.getByRole("button", { name: "Tag as Starbucks" }));
      expect(onTag.mock.calls[0]![0]).toMatchObject({ placeId: "p_star" });
      expect(onTag.mock.calls[0]![0].object).toBeUndefined();
    });
  });

  it("marks a kind of object among the name's suggestions", () => {
    setup(null, withObjects);
    const options = [...document.querySelectorAll("#place-suggestions option")] as HTMLOptionElement[];
    expect(options.find(o => o.value === "Wastebin")?.label).toBe("0 frames · object");
  });
});
