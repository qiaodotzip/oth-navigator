import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageNotAskedError, PdfPagePicker, askForPage } from "./PdfPagePicker";

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

  it("says at once that it could not ask when no picker is on screen to ask with", async () => {
    await expect(askForPage(choices)).rejects.toBeInstanceOf(PageNotAskedError);
  });

  it("tells a question that another took the place of that it went unasked, and shows the new one", async () => {
    render(<PdfPagePicker />);
    const first = askForPage(choices);
    const second = askForPage([{ number: 1, title: "3RD STOREY PLAN" }, { number: 2, title: "ROOF PLAN" }]);
    await expect(first).rejects.toBeInstanceOf(PageNotAskedError);
    fireEvent.click(await screen.findByRole("button", { name: "Page 2 · ROOF PLAN" }));
    expect(await second).toBe(2);
  });

  it("tells a question still open when the picker goes that it went unasked", async () => {
    const { unmount } = render(<PdfPagePicker />);
    const answer = askForPage(choices);
    await screen.findByRole("dialog");
    unmount();
    await expect(answer).rejects.toBeInstanceOf(PageNotAskedError);
  });
});
