/**
 * The smoke test (spec §14): the paths that matter, end to end, on a running
 * server. The team code, signing in, tagging a frame, accepting a proposal
 * and taking it back, placing an entrance, and Publish refusing with its
 * reasons. Run by hand with `npm run e2e`, never by `npm test`.
 *
 * It is safe on the team's live server. Everything it makes carries this
 * run's stamp and is taken away again: the place a tag makes, the tag, a
 * test area and the entrance placed in it. The accept is undone through its
 * own Undo, or put back the same way if that Undo is never seen, and it never
 * presses a Publish that would go through. The last test checks nothing is
 * left, and afterAll clears up after a run that failed partway, this one's
 * and any earlier run's.
 *
 * "Nothing is left" means nothing live. Its deletes are the app's own soft
 * deletes, so the deleted rows and every audit row stay behind, as they do
 * for any teammate's edit.
 *
 *   E2E_BASE_URL  the server; default http://localhost:3055, the sandbox (never :3000)
 *   TEAM_CODE     only when the server asks for it; never printed
 *   E2E_USER      who signs in; default "Demo Author"
 *   E2E_FLOOR     which floor; default L1
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3055";
const USER = process.env.E2E_USER ?? "Demo Author";
const FLOOR = process.env.E2E_FLOOR ?? "L1";

if (new URL(BASE).port === "3000") {
  throw new Error("Never run the smoke test against :3000: that is the live dev server and its database.");
}

/** This run's stamp, on everything it makes. */
const RUN = Date.now();
const TAG_NAME = `Smoke test ${RUN}`;
const AREA_ID = `smoke-area-${RUN}`;
const AREA_NAME = `Smoke test area ${RUN}`;
/** What any run's stamp makes, so a run can clear what an earlier one left. */
const SMOKE_PLACE = /^Smoke test \d{13}$/;
const SMOKE_AREA = /^smoke-area-\d{13}$/;
/** Far from the building, so the area overlaps nothing real and a click in it can only mean it. */
const AREA_RING = [[-500, -500], [-470, -500], [-470, -470], [-500, -470]];
/** For a step that waits on the server: a deployed one can be slow to answer. */
const NETWORK = { timeout: 30_000 };

type Row = { id: string; version: number };
type Place = Row & { nameEn: string; category: string; levelId?: string; status: string };
type Model = {
  levels: (Row & { code: string })[];
  places: Place[];
  sightings: (Row & { placeId: string; status: string })[];
  rooms: Row[];
  entrances: (Row & { roomId: string })[];
};
/** A proposal as it stood before this run accepted it, the tags the accept confirmed, and the accept's answer. */
type Accepted = Pick<Place, "id" | "version" | "nameEn" | "category"> & {
  levelId: string | null;
  sightingIds: string[];
  answered: Promise<unknown>;
};

test.describe.configure({ mode: "serial" });

let page: Page;
let levelId = "";
let myId = "";
/** The real proposal Review accepted, until its Undo is seen to land. */
let accepted: Accepted | null = null;

const firstLine = (err: unknown): string => String(err).split("\n")[0] ?? "";

async function model(api: APIRequestContext): Promise<Model> {
  const res = await api.get("/api/model");
  if (!res.ok()) throw new Error(`GET /api/model answered ${res.status()}`);
  return (await res.json()) as Model;
}

async function remove(api: APIRequestContext, type: string, row: Row): Promise<void> {
  const res = await api.delete(`/api/entities/${type}/${row.id}`, { data: { expectedVersion: row.version } });
  if (!res.ok()) throw new Error(`deleting ${type} ${row.id} answered ${res.status()}`);
}

/**
 * Takes away everything any smoke run made: this run's, and what an earlier
 * one left when it stopped partway. Only rows its stamp names, and only
 * entrances in its own test areas, so nothing of a teammate's goes. Each row
 * is tried on its own, so one that fails leaves the rest to go, and the
 * failures are said together at the end. Safe to run twice.
 */
async function cleanUp(api: APIRequestContext): Promise<void> {
  const m = await model(api);
  const places = m.places.filter(p => SMOKE_PLACE.test(p.nameEn));
  const placeIds = new Set(places.map(p => p.id));
  const rows: [string, Row][] = [
    ...m.sightings.filter(s => placeIds.has(s.placeId)).map(s => ["sighting", s] as [string, Row]),
    ...places.map(p => ["place", p] as [string, Row]),
    ...m.entrances.filter(e => SMOKE_AREA.test(e.roomId)).map(e => ["entrance", e] as [string, Row]),
    ...m.rooms.filter(r => SMOKE_AREA.test(r.id)).map(r => ["room", r] as [string, Row]),
  ];
  const failed: string[] = [];
  for (const [type, row] of rows) {
    await remove(api, type, row).catch((err: unknown) => failed.push(firstLine(err)));
  }
  if (failed.length > 0) throw new Error(`${failed.length} left behind: ${failed.join("; ")}`);
}

/**
 * Puts back an accept whose Undo was never seen, through the reopen the
 * app's own Undo sends: the place as it stood, and its tags back to claims.
 * Only while it is exactly as the accept left it. Changed since, it is a
 * teammate's now, and is named rather than overwritten.
 */
async function putBack(api: APIRequestContext, was: Accepted): Promise<void> {
  // After the accept's answer: one still on its way would land after this looked.
  await was.answered;
  const now = (await model(api)).places.find(p => p.id === was.id);
  // The Undo landed after all, or the accept never did.
  if (now?.status === "proposed") return;
  if (now?.status !== "confirmed" || now.version !== was.version + 1) {
    throw new Error(`${was.nameEn} has changed since it was accepted. Check it is still waiting in ${FLOOR}'s Review.`);
  }
  const res = await api.post(`/api/places/${was.id}/reopen`, {
    data: {
      expectedVersion: was.version + 1, nameEn: was.nameEn, category: was.category,
      levelId: was.levelId, sightingIds: was.sightingIds,
    },
  });
  if (!res.ok()) throw new Error(`putting ${was.nameEn} back in the queue answered ${res.status()}`);
  console.log(`Review's Undo was never seen, so ${was.nameEn} was put back in the queue.`);
}

test.beforeAll(async ({ browser }) => {
  // A page of its own, shared by every test: `browser.newPage` does not take
  // the config's `use`, so the address and the size are given here.
  page = await browser.newPage({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
});

test.afterAll(async () => {
  if (myId) {
    if (accepted) {
      const was = accepted;
      await putBack(page.request, was).catch(err => console.log(`Putting back ${was.nameEn}: ${firstLine(err)}`));
    }
    await cleanUp(page.request).catch(err => console.log(`Cleaning up after a failed run: ${firstLine(err)}`));
  }
  await page.close();
});

test("the team code, then signing in by picking a name", async () => {
  await page.goto("/");
  const code = page.getByLabel("Team code");
  const who = page.getByLabel("Who are you?");
  await expect(code.or(who)).toBeVisible(NETWORK);
  if (await code.isVisible()) {
    const typed = process.env.TEAM_CODE;
    if (!typed) {
      throw new Error("This server asks for the team code. Run with TEAM_CODE set: `railway run` passes it without printing it.");
    }
    const proceed = page.getByRole("button", { name: "Continue" });
    await expect(proceed).toBeVisible();
    // Set, sent and cleared in one step, never filled. A fill that fails
    // prints its value in Playwright's call log, and an expect that fails
    // while this page is up writes the page, field values and all, to
    // error-context.md. Continue's click builds the form's body before it
    // returns, so the field cleared after it still sends the code.
    await code.evaluate((input, value) => {
      const field = input as HTMLInputElement;
      field.value = value;
      field.form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      field.value = "";
    }, typed);
  }
  await expect(who).toBeVisible(NETWORK);
  const names = (await who.locator("option").allInnerTexts()).filter(n => n !== "Pick your name");
  if (!names.includes(USER)) throw new Error(`${USER} isn't on this server's team (${names.join(", ")}). Set E2E_USER.`);
  await who.selectOption({ label: USER });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Floors" })).toBeVisible(NETWORK);

  myId = ((await (await page.request.get("/api/auth/me")).json()) as { user: { id: string } }).user.id;
  levelId = (await model(page.request)).levels.find(l => l.code === FLOOR)?.id ?? "";
  expect(levelId, `this server has no floor ${FLOOR}`).not.toBe("");
});

test("Survey: tag a frame, then take the tag off again", async () => {
  await page.goto(`/floors/${FLOOR}/survey`);
  const frame = page.getByText(/^Frame \d+ of \d+/).first();
  const unfiled = page.getByText(/isn't filed under a floor/).first();
  await expect(frame.or(unfiled).first()).toBeVisible(NETWORK);
  if (!(await frame.isVisible())) {
    throw new Error(`${FLOOR} has no footage filed under it: import with --file-under ${FLOOR}, or press File under ${FLOOR} in Survey.`);
  }
  // The frame on screen goes into the address, so tagging it cannot move the view on.
  await expect(page).toHaveURL(/[?&]frame=/);
  const where = await frame.innerText();
  await page.getByLabel("Place name").fill(TAG_NAME);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  // The panel's × carries this name, and so does the frame's, for a boxed tag.
  const untag = page.getByRole("button", { name: `Remove tag ${TAG_NAME} from this frame` });
  await expect(untag.first()).toBeVisible(NETWORK);
  await expect(frame).toHaveText(where);
  await untag.first().click();
  // First: Radix also renders a toast's words once more, for screen readers.
  await expect(page.getByText(`Deleted the tag ${TAG_NAME}`).first()).toBeVisible(NETWORK);
  await expect(untag).toHaveCount(0, NETWORK);
});

test("Review: accept a proposal, then Undo puts it back", async () => {
  await page.goto(`/floors/${FLOOR}/review`);
  const accept = page.getByRole("button", { name: /^Accept/ });
  const nothing = page.getByText(`Nothing waiting on ${FLOOR}.`);
  await expect(accept.or(nothing).first()).toBeVisible(NETWORK);
  if (await nothing.isVisible()) throw new Error(`${FLOOR} has no proposals waiting, so there is nothing to accept.`);
  const name = (await page.getByLabel("Name", { exact: true }).inputValue()).trim();

  // Everything as it stood, so an accept whose Undo is never seen can be put
  // back. The accept's own request says which proposal it was.
  const before = await model(page.request);
  const sent = page.waitForRequest(r => r.method() === "POST" && /^\/api\/places\/[^/]+\/accept$/.test(new URL(r.url()).pathname));
  await accept.click();
  const request = await sent;
  const id = decodeURIComponent(new URL(request.url()).pathname.split("/")[3] ?? "");
  const place = before.places.find(p => p.id === id);
  if (!place) throw new Error(`Review accepted ${id}, which wasn't among the places a moment before.`);
  accepted = {
    id, version: place.version, nameEn: place.nameEn, category: place.category, levelId: place.levelId ?? null,
    sightingIds: before.sightings.filter(s => s.placeId === id && s.status === "proposed").map(s => s.id),
    answered: request.response().catch(() => null),
  };

  // The Undo on the toast that says so, pressed the moment it shows: it goes after eight seconds.
  await page.getByTestId("toast-info").filter({ hasText: `Accepted ${name}` })
    .getByRole("button", { name: "Undo" }).click(NETWORK);
  await expect(page.getByText(/is back in the queue$/).first()).toBeVisible(NETWORK);
  await expect.poll(async () => (await model(page.request)).places.find(p => p.id === id)?.status, NETWORK).toBe("proposed");
  accepted = null;
});

test("Build: place an entrance in the Entrances & lifts step", async () => {
  const made = await page.request.post("/api/entities/room", {
    data: {
      data: {
        id: AREA_ID, levelId, kind: "area", walkable: true, heightM: 4,
        nameEn: AREA_NAME, footprint: AREA_RING,
      },
    },
  });
  expect(made.ok(), `making the test area answered ${made.status()}`).toBeTruthy();

  // The link selects the area and zooms to it, which puts its middle in the canvas's middle.
  await page.goto(`/floors/${FLOOR}/build?step=entrances&select=room:${AREA_ID}`);
  const guide = page.getByRole("region", { name: "Entrances & lifts guide" });
  await expect(guide).toBeVisible(NETWORK);
  await expect(page.getByRole("region", { name: "Selection" }).getByLabel("Name", { exact: true })).toHaveValue(AREA_NAME, NETWORK);
  // The zoom lands in the render after the selection.
  await page.waitForTimeout(500);

  await guide.getByRole("button", { name: /^Entrance/ }).click();
  const surface = await page.getByTestId("plan-surface").boundingBox();
  if (!surface) throw new Error("the plan is not on screen");
  await page.mouse.click(surface.x + surface.width / 2, surface.y + surface.height / 2);

  await expect
    .poll(async () => (await model(page.request)).entrances.filter(e => e.roomId === AREA_ID).length, NETWORK)
    .toBe(1);
});

test("Publish is refused, and says what to fix", async () => {
  // Until the check's report arrives the button reads "Publish ▾" as well, so it is waited for first.
  const checked = page.waitForResponse(r => new URL(r.url()).pathname === "/api/model/validate", NETWORK);
  await page.goto("/floors");
  expect((await checked).ok(), "the publish check failed").toBeTruthy();
  // Checked and blocked, the button opens the list of what to fix. The one
  // that would publish reads "Publish" alone, and is never pressed.
  await page.getByRole("button", { name: "Publish ▾", exact: true }).click(NETWORK);
  await expect(page.getByText(/before publishing:$/)).toBeVisible(NETWORK);
  await expect(page.getByRole("link", { name: /→/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("leaves nothing of itself behind", async () => {
  await cleanUp(page.request);
  const m = await model(page.request);
  expect(m.places.filter(p => SMOKE_PLACE.test(p.nameEn))).toEqual([]);
  expect(m.rooms.filter(r => SMOKE_AREA.test(r.id))).toEqual([]);
  expect(m.entrances.filter(e => SMOKE_AREA.test(e.roomId))).toEqual([]);
});
