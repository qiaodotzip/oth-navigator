import type { RoomKind } from "@oth/model";

/**
 * Zones traced from OTH's storey plans.
 *
 * A draft, not a survey. Positions and scale are right; edges are rectangles
 * read off the drawing, because at 1:1500 a 5 m shopfront is 24 px and finer
 * detail is not in the sheet to be had. The editor exists to correct them.
 */

/**
 * One drawing, with its own calibration.
 *
 * Scale is per sheet and never global. OTH's floors were drawn at different
 * times by different people, and a later floor may well arrive at a different
 * scale, on a different sheet size, or cropped — so nothing here may assume
 * that what was true of the 1st storey is true of the 6th.
 */
export type PlanSheet = {
  id: string;
  levelId: string;
  /** The source drawing, so a mis-scaled underlay can be traced back to it. */
  file: string;
  metresPerPixel: number;
  /** The sheet pixel taken as this floor's model origin. */
  originPx: { x: number; y: number };
  /** How the scale was established, and how it was checked. */
  provenance: string;
};

/**
 * Both 2020 sheets are 1:1500 @ A3 and are registered to each other — shifting
 * one against the other peaks at dx=0, dy=0 — so they share an origin and the
 * floors stack. That is a fact about these two drawings, not a rule.
 *
 * Their printed scale bar is wrong. It measures 356 px for 25 m (0.0702 m/px),
 * out by a factor of three, probably a 1:500 bar left on a 1:1500 sheet. The
 * sheet itself is the authority: 3000x2121 matches A3 (420x297 mm) to 0.02%,
 * and 420 mm x 1500 = 630 m across 3000 px.
 */
export const PLAN_SHEETS: PlanSheet[] = [
  {
    id: "2020-1st-storey",
    levelId: "oth-L1",
    file: "1st-Storey_Updated_300DPI-3000x2121.jpg",
    metresPerPixel: 0.21,
    originPx: { x: 950, y: 1750 },
    provenance:
      "A3 at 1:1500 from the title block. Checked twice on the drawing: the " +
      "football pitch is 505 px goal to goal (106 m here, 35 m under the " +
      "printed scale bar) and the field comes out 87 x 126 m.",
  },
  {
    id: "2020-2nd-storey",
    levelId: "oth-L2",
    file: "2nd-Storey_Updated_300DPI-3000x2121.jpg",
    metresPerPixel: 0.21,
    originPx: { x: 950, y: 1750 },
    provenance:
      "Same sheet setup as the 1st storey, and registered to it, so the L2 " +
      "void sits exactly over the L1 town square.",
  },
];

export function planSheet(id: string): PlanSheet {
  const sheet = PLAN_SHEETS.find(s => s.id === id);
  if (!sheet) throw new Error(`no plan sheet ${id}`);
  return sheet;
}

export type TracedZone = {
  id: string;
  /** Which drawing this came from, and therefore which calibration applies. */
  sheetId: string;
  kind: RoomKind;
  nameEn: string;
  nameZh: string;
  /** Sheet pixels: [x0, y0, x1, y1], y measured down from the top of the image. */
  rect: [number, number, number, number];
  heightM: number;
};

/** Sheet pixels to model metres for one sheet, y flipped so north is +y. */
export function pxToModel(sheet: PlanSheet, x: number, y: number): [number, number] {
  return [
    Number(((x - sheet.originPx.x) * sheet.metresPerPixel).toFixed(2)),
    Number(((sheet.originPx.y - y) * sheet.metresPerPixel).toFixed(2)),
  ];
}

export function zoneFootprint(zone: TracedZone): [number, number][] {
  const sheet = planSheet(zone.sheetId);
  const [x0, y0, x1, y1] = zone.rect;
  const at = (x: number, y: number) => pxToModel(sheet, x, y);
  // Counter-clockwise in plan coordinates, which is what RingSchema expects.
  return [at(x0, y1), at(x1, y1), at(x1, y0), at(x0, y0)];
}

/** The level a zone belongs to, which its sheet decides. */
export function zoneLevelId(zone: TracedZone): string {
  return planSheet(zone.sheetId).levelId;
}

const L1 = "2020-1st-storey";
const L2 = "2020-2nd-storey";

export const TRACED_ZONES: TracedZone[] = [
  // ---- Level 1, from "1ST STOREY PLAN" ----
  { id: "L1-town-square", sheetId: L1, kind: "area", nameEn: "Town Square", nameZh: "市镇广场", rect: [1595, 902, 2010, 1504], heightM: 12 },
  { id: "L1-stadium", sheetId: L1, kind: "area", nameEn: "Stadium", nameZh: "体育场", rect: [1495, 890, 1595, 1510], heightM: 12 },
  { id: "L1-studio-e1", sheetId: L1, kind: "room", nameEn: "Dance/Fitness Studio (East 1)", nameZh: "舞蹈健身室", rect: [2020, 920, 2100, 1010], heightM: 4 },
  { id: "L1-studio-e2", sheetId: L1, kind: "room", nameEn: "Dance/Fitness Studio (East 2)", nameZh: "舞蹈健身室", rect: [2020, 1140, 2100, 1230], heightM: 4 },
  { id: "L1-studio-e3", sheetId: L1, kind: "room", nameEn: "Dance/Fitness Studio (East 3)", nameZh: "舞蹈健身室", rect: [2020, 1330, 2100, 1420], heightM: 4 },
  { id: "L1-studio-s1", sheetId: L1, kind: "room", nameEn: "Dance/Fitness Studio (South 1)", nameZh: "舞蹈健身室", rect: [1670, 1470, 1770, 1550], heightM: 4 },
  { id: "L1-studio-s2", sheetId: L1, kind: "room", nameEn: "Dance/Fitness Studio (South 2)", nameZh: "舞蹈健身室", rect: [1790, 1470, 1890, 1550], heightM: 4 },
  { id: "L1-community-space", sheetId: L1, kind: "area", nameEn: "Community Space", nameZh: "社区空间", rect: [1180, 800, 1330, 980], heightM: 5 },
  { id: "L1-public-service", sheetId: L1, kind: "room", nameEn: "Public Service Centre", nameZh: "公共服务中心", rect: [1330, 780, 1520, 1000], heightM: 5 },
  { id: "L1-hawker-centre", sheetId: L1, kind: "area", nameEn: "Hawker Centre", nameZh: "小贩中心", rect: [1180, 560, 1520, 720], heightM: 5 },
  { id: "L1-commercial-n", sheetId: L1, kind: "room", nameEn: "Commercial & F&B (North)", nameZh: "商业与餐饮", rect: [1780, 520, 2020, 680], heightM: 5 },
  { id: "L1-commercial-c", sheetId: L1, kind: "room", nameEn: "Commercial & F&B (Central)", nameZh: "商业与餐饮", rect: [1760, 780, 1980, 900], heightM: 5 },
  { id: "L1-interim-park", sheetId: L1, kind: "area", nameEn: "Interim Park", nameZh: "临时公园", rect: [1120, 1080, 1480, 1620], heightM: 5 },

  // ---- Level 2, from "2ND STOREY PLAN" ----
  { id: "L2-town-square-void", sheetId: L2, kind: "void", nameEn: "Town Square (open below)", nameZh: "市镇广场挑空", rect: [1595, 902, 2010, 1504], heightM: 5 },
  { id: "L2-stadium-seating", sheetId: L2, kind: "detail", nameEn: "Stadium Seating", nameZh: "看台座位", rect: [1559, 938, 1633, 1365], heightM: 3 },
  { id: "L2-library", sheetId: L2, kind: "room", nameEn: "Public Library", nameZh: "公共图书馆", rect: [2040, 1000, 2140, 1130], heightM: 5 },
  { id: "L2-interests-group", sheetId: L2, kind: "room", nameEn: "Interests Group Room", nameZh: "兴趣小组室", rect: [2050, 1160, 2140, 1250], heightM: 4 },
  { id: "L2-culinary-studio", sheetId: L2, kind: "room", nameEn: "Culinary Studio", nameZh: "烹饪工作室", rect: [2010, 1290, 2110, 1380], heightM: 4 },
  { id: "L2-heritage-gallery", sheetId: L2, kind: "room", nameEn: "Heritage Gallery", nameZh: "传统展览馆", rect: [2040, 1400, 2130, 1470], heightM: 4 },
  { id: "L2-theatre", sheetId: L2, kind: "room", nameEn: "Theatre", nameZh: "剧院", rect: [1660, 1380, 1790, 1480], heightM: 8 },
  { id: "L2-music-studios", sheetId: L2, kind: "room", nameEn: "Music Studios", nameZh: "音乐工作室", rect: [1560, 1390, 1660, 1470], heightM: 4 },
  { id: "L2-interim-park", sheetId: L2, kind: "area", nameEn: "Interim Park (upper)", nameZh: "临时公园", rect: [1120, 1150, 1420, 1620], heightM: 5 },
  { id: "L2-team-sports-hall", sheetId: L2, kind: "area", nameEn: "Team Sports Hall", nameZh: "团体运动馆", rect: [1150, 780, 1500, 1050], heightM: 10 },
  { id: "L2-holding-lounge", sheetId: L2, kind: "room", nameEn: "Holding Lounge", nameZh: "候场厅", rect: [1650, 800, 1960, 900], heightM: 5 },
  { id: "L2-hdb-office", sheetId: L2, kind: "room", nameEn: "HDB Office", nameZh: "建屋局办事处", rect: [1650, 500, 2030, 650], heightM: 5 },
  { id: "L2-enrichment", sheetId: L2, kind: "room", nameEn: "Enrichment", nameZh: "培训中心", rect: [1700, 630, 1900, 700], heightM: 4 },
  { id: "L2-sky-terrace", sheetId: L2, kind: "area", nameEn: "Sky Terrace", nameZh: "空中平台", rect: [1180, 500, 1500, 700], heightM: 5 },
];
