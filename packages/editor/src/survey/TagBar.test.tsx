import { PathwayKindSchema, PlaceSchema, type Box } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagBar, type TagBarHandle } from "./TagBar";

const L1 = "oth-L1";
const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail", levelId: L1 }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community", levelId: L1 }),
  PlaceSchema.parse({ id: "p3", nameEn: "Gate 1", category: "facility" }),
];
const levels = new Map<string, string | undefined>([["p1", L1], ["p2", L1], ["p3", undefined]]);
const counts = new Map([["p1", 7], ["p3", 1]]);
const kinds = [PathwayKindSchema.parse({ id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" })];

function setup(box: Box | null = null) {
  const onTag = vi.fn();
  const onAddWalkwayKind = vi.fn(async () => "pk-2");
  const ref = createRef<TagBarHandle>();
  render(
    <TagBar
      ref={ref} candidates={places} levels={levels} levelId={L1} counts={counts}
      walkwayKinds={kinds} box={box} onTag={onTag} onAddWalkwayKind={onAddWalkwayKind}
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
