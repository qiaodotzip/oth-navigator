import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levelImages, levels, planPdfs } from "../db/schema";
import { createTestDb, json } from "../testing/harness";
import { attachmentName, looksLikePdf } from "./pdf";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const pdf = new TextEncoder().encode("%PDF-1.4\n% a floor's sheet\n");
const sheet = {
  page: 1, pageCount: 1, pageSizePt: [792, 612], rotation: 90, clipPt: [117, 76, 684, 556],
  pointsPerPixel: 0.0933, metresPerPoint: 0.7505, runsAgree: 2, runsFound: 3,
};

async function plan(): Promise<{ id: string; version: number }> {
  const form = new FormData();
  form.append("file", new Blob([png(100, 100)]), "L1.jpg");
  form.append("levelId", "oth-L1");
  const res = await app.request("/api/level-images", { method: "POST", headers: { cookie }, body: form });
  return (await json<{ image: { id: string; version: number } }>(res)).image;
}

function send(id: string, { bytes = pdf, meta = sheet as unknown, expectedVersion = 0, name = "L1 Floor Plan.pdf" } = {}) {
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  form.append("sheet", JSON.stringify(meta));
  form.append("expectedVersion", String(expectedVersion));
  return app.request(`/api/level-images/${id}/source`, { method: "POST", headers: { cookie }, body: form });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-src-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("a plan's PDF", () => {
  it("is stored beside the plan, with where the plan sits on the sheet", async () => {
    const image = await plan();
    const res = await send(image.id);
    expect(res.status).toBe(200);
    const { image: row } = await json<{ image: { version: number; source: Record<string, unknown> } }>(res);
    expect(row.version).toBe(1);
    expect(row.source).toMatchObject({ ...sheet, filename: "L1 Floor Plan.pdf" });
    expect(row.source.pdfId).toMatch(/^pdf_[0-9a-f]{16}$/);
    expect(row.source.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is served back as a download that never renders on the app's own origin", async () => {
    const image = await plan();
    await send(image.id);
    const res = await app.request(`/api/level-images/${image.id}/source`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="L1 Floor Plan.pdf"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
  });

  it("refuses a file that isn't a PDF, and leaves the plan as it was", async () => {
    const image = await plan();
    const res = await send(image.id, { bytes: new TextEncoder().encode("<html>hello</html>") });
    expect(res.status).toBe(422);
    const [row] = await db.select().from(levelImages).where(eq(levelImages.id, image.id));
    expect(row?.source).toBeNull();
    expect(row?.version).toBe(0);
  });

  it("refuses a sheet the model would reject", async () => {
    const image = await plan();
    expect((await send(image.id, { meta: { ...sheet, clipPt: [0, 0, 1] } })).status).toBe(422);
    expect((await send(image.id, { meta: "not json" })).status).toBe(422);
  });

  it("409s a stale version rather than overwriting a teammate's", async () => {
    const image = await plan();
    await send(image.id);
    expect((await send(image.id, { expectedVersion: 0 })).status).toBe(409);
  });

  it("404s the PDF of a plan that came from an image", async () => {
    const image = await plan();
    expect((await app.request(`/api/level-images/${image.id}/source`, { headers: { cookie } })).status).toBe(404);
  });

  it("keeps one copy of a PDF sent twice", async () => {
    const first = await plan();
    await send(first.id);
    const second = await plan();
    await send(second.id);
    expect(await db.select().from(planPdfs)).toHaveLength(1);
  });
});

describe("looksLikePdf and attachmentName", () => {
  it("knows a PDF by its header, within the first 1024 bytes", () => {
    expect(looksLikePdf(pdf)).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode(`${"\n".repeat(900)}%PDF-1.7`))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode(`${"\n".repeat(1100)}%PDF-1.7`))).toBe(false);
  });
  it("names the download safely", () => {
    expect(attachmentName('L1 "plan"\r\n.pdf')).toBe("L1 _plan___.pdf");
    expect(attachmentName("sheet")).toBe("sheet.pdf");
  });
});
