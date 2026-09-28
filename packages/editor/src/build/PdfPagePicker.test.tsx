import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdfPagePicker, askForPage } from "./PdfPagePicker";

const choices = [{ number: 1, title: "1ST STOREY PLAN" }, { number: 2, title: "2ND STOREY PLAN" }];

describe("PdfPagePicker", () => {
  it("asks which page is the floor's plan, and answers with the one you choose", async () => {
    render(<PdfPagePicker />);
    const answer = askForPage(choices);
    fireEvent.click(await screen.findByRole("button", { name: "Page 2 · 2ND STOREY PLAN" }));
    expect(await answer).toBe(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("answers nothing when you close it", async () => {
    render(<PdfPagePicker />);
    const answer = askForPage(choices);
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(await answer).toBeNull();
  });

  it("answers nothing at once when no picker is on screen to ask with", async () => {
    expect(await askForPage(choices)).toBeNull();
  });
});
