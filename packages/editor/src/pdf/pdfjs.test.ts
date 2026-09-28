import { describe, expect, it } from "vitest";
import { PdfUnreadableError, looksLikePdf, openPdf, readBytes } from "./pdfjs";
import { planSheet, syntheticPdf } from "./testing/syntheticPdf";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("looksLikePdf", () => {
  it("knows a PDF by its header, which readers accept anywhere in the first 1024 bytes", () => {
    expect(looksLikePdf(bytes("%PDF-1.7\n"))).toBe(true);
    expect(looksLikePdf(bytes(`${" ".repeat(500)}%PDF-1.4`))).toBe(true);
    expect(looksLikePdf(bytes(`${" ".repeat(1100)}%PDF-1.4`))).toBe(false);
    expect(looksLikePdf(bytes("%PDF"))).toBe(false);
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
  });
});

describe("openPdf", () => {
  it("opens a PDF and leaves the caller's bytes whole, so they can still be uploaded", async () => {
    const pdf = syntheticPdf([{ width: 400, height: 300, content: planSheet() }]);
    const length = pdf.byteLength;
    const { doc, close } = await openPdf(pdf);
    expect(doc.numPages).toBe(1);
    await close();
    expect(pdf.byteLength).toBe(length);
  });

  it("says a file it cannot read is unreadable, rather than failing as a lost connection would", async () => {
    await expect(openPdf(bytes("%PDF-1.4\nnot really"))).rejects.toBeInstanceOf(PdfUnreadableError);
  });
});

describe("readBytes", () => {
  it("reads a dropped file, which in some browsers (and jsdom) has no arrayBuffer()", async () => {
    const file = new File([new Uint8Array([37, 80, 68, 70, 45])], "L2.pdf", { type: "application/pdf" });
    expect(Array.from(await readBytes(file))).toEqual([37, 80, 68, 70, 45]);
  });
});
