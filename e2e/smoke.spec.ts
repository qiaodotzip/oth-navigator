/**
 * The smoke test (spec §14): the paths that matter, end to end, on a running
 * server. The team code, signing in, tagging a frame, accepting a proposal
 * and taking it back, placing an entrance, and Publish refusing with its
 * reasons. Run by hand with `npm run e2e`, never by `npm test`.
 *
 * It is safe on the team's live server. Everything it makes carries this
 * run's stamp and is taken away again: the place a tag makes, the tag, a
 * test area and the entrance placed in it. The accept is undone through its
 * own Undo, and it never presses a Publish that would go through. The last
 * test checks nothing is left, and afterAll clears up after a run that
 * failed partway.
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
/** Far from the building, so the area overlaps nothing real and a click in it can only mean it. */
const AREA_RING = [[-500, -500], [-470, -500], [-470, -470], [-500, -470]];

type Row = { id: string; version: number; updatedBy?: string };
type Model = {
  levels: (Row & { code: string })[];
  places: (Row & { nameEn: string })[];
  sightings: (Row & { placeId: string })[];
  rooms: Row[];
  entrances: (Row & { roomId: string })[];
};

test.describe.configure({ mode: "serial" });

let page: Page;
let levelId = "";
let myId = "";
/**
 * The real proposal Review accepted, until its Undo is seen to put it back.
 * cleanUp cannot take an accept back, so a run that stops in between names
 * it for a person to check.
 */
let acceptedNotUndone = "";

async function model(api: APIRequestContext): Promise<Model> {
  const res = await api.get("/api/model");
  if (!res.ok()) throw new Error(`GET /api/model answered ${res.status()}`);
  return (await res.json()) as Model;
}

async function remove(api: APIRequestContext, type: string, row: Row): Promise<void> {
  const res = await api.delete(`/api/entities/${type}/${row.id}`, { data: { expectedVersion: row.version } });
  if (!res.ok()) throw new Error(`deleting ${type} ${row.id} answered ${res.status()}`);
}

/** An entrance this run placed: in its area or, if a click missed, anywhere, by this user, since the run began. */
function placedByThisRun(e: Model["entrances"][number]): boolean {
  if (e.roomId === AREA_ID) return true;
  const at = Number(e.id.split("-entrance-")[1]);
  return e.updatedBy === myId && Number.isFinite(at) && at >= RUN;
}

/** Takes away everything this run made. Safe to run twice. */
async function cleanUp(api: APIRequestContext): Promise<void> {
  const m = await model(api);
  for (const place of m.places.filter(p => p.nameEn === TAG_NAME)) {
    for (const s of m.sightings.filter(s => s.placeId === place.id)) await remove(api, "sighting", s);
    await remove(api, "place", place);
  }
  for (const e of m.entrances.filter(placedByThisRun)) await remove(api, "entrance", e);
  for (const r of m.rooms.filter(r => r.id === AREA_ID)) await remove(api, "room", r);
}

test.beforeAll(async ({ browser }) => {
  // A page of its own, shared by every test: `browser.newPage` does not take
  // the config's `use`, so the address and the size are given here.
  page = await browser.newPage({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
});

test.afterAll(async () => {
  if (acceptedNotUndone) {
    console.log(
      `Review may have accepted ${acceptedNotUndone}, and no Undo was seen to put it back. ` +
      `Check that it is still waiting in ${FLOOR}'s Review.`,
    );
  }
  if (myId) {
    await cleanUp(page.request).catch(err => console.log(`Cleaning up after a failed run: ${String(err).split("\n")[0]}`));
  }
  await page.close();
});

test("the team code, then signing in by picking a name", async () => {
  await page.goto("/");
  const code = page.getByLabel("Team code");
  const who = page.getByLabel("Who are you?");
  await expect(code.or(who)).toBeVisible();
  if (await code.isVisible()) {
    const typed = process.env.TEAM_CODE;
    if (!typed) {
      throw new Error("This server asks for the team code. Run with TEAM_CODE set: `railway run` passes it without printing it.");
    }
    // Set rather than filled: a fill that fails prints what it was filling
    // in Playwright's call log, and this value must never reach a terminal.
    await code.evaluate((input, value) => { (input as HTMLInputElement).value = value; }, typed);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(who).toBeVisible();
  const names = (await who.locator("option").allInnerTexts()).filter(n => n !== "Pick your name");
  if (!names.includes(USER)) throw new Error(`${USER} isn't on this server's team (${names.join(", ")}). Set E2E_USER.`);
  await who.selectOption({ label: USER });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Floors" })).toBeVisible();

  myId = ((await (await page.request.get("/api/auth/me")).json()) as { user: { id: string } }).user.id;
  levelId = (await model(page.request)).levels.find(l => l.code === FLOOR)?.id ?? "";
  expect(levelId, `this server has no floor ${FLOOR}`).not.toBe("");
});

test("Survey: tag a frame, then take the tag off again", async () => {
  await page.goto(`/floors/${FLOOR}/survey`);
  const frame = page.getByText(/^Frame \d+ of \d+/).first();
  const unfiled = page.getByText(/isn't filed under a floor/).first();
  await expect(frame.or(unfiled).first()).toBeVisible({ timeout: 30_000 });
  if (!(await frame.isVisible())) {
    throw new Error(`${FLOOR} has no footage filed under it: import with --file-under ${FLOOR}, or press File under ${FLOOR} in Survey.`);
  }
  // Picked in the strip, so the address names it. With no frame in the
  // address, Survey shows the first frame with no tag, and once this one is
  // tagged that is the next frame: the tag would be out of sight.
  await page.getByTestId("filmstrip").locator('[aria-current="true"]').click();
  await expect(page).toHaveURL(/[?&]frame=/);
  await page.getByLabel("Place name").fill(TAG_NAME);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  // The panel's × carries this name, and so does the frame's, for a boxed tag.
  const untag = page.getByRole("button", { name: `Remove tag ${TAG_NAME} from this frame` });
  await expect(untag.first()).toBeVisible({ timeout: 15_000 });
  await untag.first().click();
  // First: Radix also renders a toast's words once more, for screen readers.
  await expect(page.getByText(`Deleted the tag ${TAG_NAME}`).first()).toBeVisible();
  await expect(untag).toHaveCount(0, { timeout: 15_000 });
});

test("Review: accept a proposal, then Undo puts it back", async () => {
  await page.goto(`/floors/${FLOOR}/review`);
  const accept = page.getByRole("button", { name: /^Accept/ });
  const nothing = page.getByText(`Nothing waiting on ${FLOOR}.`);
  await expect(accept.or(nothing).first()).toBeVisible({ timeout: 30_000 });
  if (await nothing.isVisible()) throw new Error(`${FLOOR} has no proposals waiting, so there is nothing to accept.`);
  const name = (await page.getByLabel("Name", { exact: true }).inputValue()).trim();
  acceptedNotUndone = name;
  await accept.click();
  await expect(page.getByText(`Accepted ${name}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/is back in the queue$/).first()).toBeVisible({ timeout: 15_000 });
  acceptedNotUndone = "";
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
  await expect(guide).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Selection" }).getByLabel("Name", { exact: true })).toHaveValue(AREA_NAME);
  // The zoom lands in the render after the selection.
  await page.waitForTimeout(500);

  await guide.getByRole("button", { name: /^Entrance/ }).click();
  const surface = await page.getByTestId("plan-surface").boundingBox();
  if (!surface) throw new Error("the plan is not on screen");
  await page.mouse.click(surface.x + surface.width / 2, surface.y + surface.height / 2);

  await expect
    .poll(async () => (await model(page.request)).entrances.filter(e => e.roomId === AREA_ID).length, { timeout: 15_000 })
    .toBe(1);
});

test("Publish is refused, and says what to fix", async () => {
  await page.goto("/floors");
  const publish = page.getByRole("button", { name: /^Publish/ });
  // Only the blocked button carries ▾. One that would publish is never pressed.
  await expect(publish).toHaveText(/▾/, { timeout: 15_000 });
  await publish.click();
  await expect(page.getByText(/before publishing:$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /→/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("leaves nothing of itself behind", async () => {
  await cleanUp(page.request);
  const m = await model(page.request);
  expect(m.places.filter(p => p.nameEn === TAG_NAME)).toEqual([]);
  expect(m.rooms.filter(r => r.id === AREA_ID)).toEqual([]);
  expect(m.entrances.filter(placedByThisRun)).toEqual([]);
});
