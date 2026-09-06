import type { RoomKind } from "@oth/model";

/**
 * Zones traced from OTH's 2020 storey plans.
 *
 * A draft, not a survey. Positions and scale are right; edges are rectangles
 * read off the drawing, because at 1:1500 a 5 m shopfront is 24 px and finer
 * detail is not in the sheet to be had. The editor exists to correct them.
 */

/**
 * Metres per pixel on both sheets.
 *
 * NOT the drawn scale bar, which measures 356 px for 25 m (0.0702) and is wrong
 * by a factor of three — probably a 1:500 bar left on a 1:1500 sheet. The sheet
 * itself is the authority: the raster is 3000x2121, matching A3 (420x297 mm) to
 * 0.02%, and the title block says 1:1500 @ A3. So 420 mm x 1500 = 630 m across
 * 3000 px.
 *
 * Checked against the drawing: the football pitch measures 505 px goal line to
 * goal line, which is 106 m here and 35 m under the scale bar. Trusting the bar
 * would have made every footprint a third of its real size, silently, and the
 * model would still have validated and published.
 */
export const PLAN_MPP = 0.21;

/** Sheet pixel taken as the model origin. Both sheets are registered, so floors stack. */
export const PLAN_ORIGIN_PX = { x: 950, y: 1750 } as const;

export type TracedZone = {
  id: string;
  levelId: string;
  kind: RoomKind;
  nameEn: string;
  nameZh: string;
  /** Sheet pixels: [x0, y0, x1, y1], y measured down from the top of the image. */
  rect: [number, number, number, number];
  heightM: number;
};

/** Sheet pixels to model metres, y flipped so north is +y. */
export function pxToModel(x: number, y: number): [number, number] {
  return [
    Number(((x - PLAN_ORIGIN_PX.x) * PLAN_MPP).toFixed(2)),
    Number(((PLAN_ORIGIN_PX.y - y) * PLAN_MPP).toFixed(2)),
  ];
}

export function zoneFootprint(zone: TracedZone): [number, number][] {
  const [x0, y0, x1, y1] = zone.rect;
  // Counter-clockwise in plan coordinates, which is what RingSchema expects.
  return [pxToModel(x0, y1), pxToModel(x1, y1), pxToModel(x1, y0), pxToModel(x0, y0)];
}

const L1 = "oth-L1";
const L2 = "oth-L2";

export const TRACED_ZONES: TracedZone[] = [
  // ---- Level 1, from "1ST STOREY PLAN" ----
  { id: "L1-town-square", levelId: L1, kind: "area", nameEn: "Town Square", nameZh: "市镇广场", rect: [1595, 902, 2010, 1504], heightM: 12 },
  { id: "L1-stadium", levelId: L1, kind: "area", nameEn: "Stadium", nameZh: "体育场", rect: [1495, 890, 1595, 1510], heightM: 12 },
  { id: "L1-studio-e1", levelId: L1, kind: "room", nameEn: "Dance/Fitness Studio (East 1)", nameZh: "舞蹈健身室", rect: [2020, 920, 2100, 1010], heightM: 4 },
  { id: "L1-studio-e2", levelId: L1, kind: "room", nameEn: "Dance/Fitness Studio (East 2)", nameZh: "舞蹈健身室", rect: [2020, 1140, 2100, 1230], heightM: 4 },
  { id: "L1-studio-e3", levelId: L1, kind: "room", nameEn: "Dance/Fitness Studio (East 3)", nameZh: "舞蹈健身室", rect: [2020, 1330, 2100, 1420], heightM: 4 },
  { id: "L1-studio-s1", levelId: L1, kind: "room", nameEn: "Dance/Fitness Studio (South 1)", nameZh: "舞蹈健身室", rect: [1670, 1470, 1770, 1550], heightM: 4 },
  { id: "L1-studio-s2", levelId: L1, kind: "room", nameEn: "Dance/Fitness Studio (South 2)", nameZh: "舞蹈健身室", rect: [1790, 1470, 1890, 1550], heightM: 4 },
  { id: "L1-community-space", levelId: L1, kind: "area", nameEn: "Community Space", nameZh: "社区空间", rect: [1180, 800, 1330, 980], heightM: 5 },
  { id: "L1-public-service", levelId: L1, kind: "room", nameEn: "Public Service Centre", nameZh: "公共服务中心", rect: [1330, 780, 1520, 1000], heightM: 5 },
  { id: "L1-hawker-centre", levelId: L1, kind: "area", nameEn: "Hawker Centre", nameZh: "小贩中心", rect: [1180, 560, 1520, 720], heightM: 5 },
  { id: "L1-commercial-n", levelId: L1, kind: "room", nameEn: "Commercial & F&B (North)", nameZh: "商业与餐饮", rect: [1780, 520, 2020, 680], heightM: 5 },
  { id: "L1-commercial-c", levelId: L1, kind: "room", nameEn: "Commercial & F&B (Central)", nameZh: "商业与餐饮", rect: [1760, 780, 1980, 900], heightM: 5 },
  { id: "L1-interim-park", levelId: L1, kind: "area", nameEn: "Interim Park", nameZh: "临时公园", rect: [1120, 1080, 1480, 1620], heightM: 5 },

  // ---- Level 2, from "2ND STOREY PLAN" ----
  { id: "L2-town-square-void", levelId: L2, kind: "void", nameEn: "Town Square (open below)", nameZh: "市镇广场挑空", rect: [1595, 902, 2010, 1504], heightM: 5 },
  { id: "L2-stadium-seating", levelId: L2, kind: "detail", nameEn: "Stadium Seating", nameZh: "看台座位", rect: [1559, 938, 1633, 1365], heightM: 3 },
  { id: "L2-library", levelId: L2, kind: "room", nameEn: "Public Library", nameZh: "公共图书馆", rect: [2040, 1000, 2140, 1130], heightM: 5 },
  { id: "L2-interests-group", levelId: L2, kind: "room", nameEn: "Interests Group Room", nameZh: "兴趣小组室", rect: [2050, 1160, 2140, 1250], heightM: 4 },
  { id: "L2-culinary-studio", levelId: L2, kind: "room", nameEn: "Culinary Studio", nameZh: "烹饪工作室", rect: [2010, 1290, 2110, 1380], heightM: 4 },
  { id: "L2-heritage-gallery", levelId: L2, kind: "room", nameEn: "Heritage Gallery", nameZh: "传统展览馆", rect: [2040, 1400, 2130, 1470], heightM: 4 },
  { id: "L2-theatre", levelId: L2, kind: "room", nameEn: "Theatre", nameZh: "剧院", rect: [1660, 1380, 1790, 1480], heightM: 8 },
  { id: "L2-music-studios", levelId: L2, kind: "room", nameEn: "Music Studios", nameZh: "音乐工作室", rect: [1560, 1390, 1660, 1470], heightM: 4 },
  { id: "L2-interim-park", levelId: L2, kind: "area", nameEn: "Interim Park (upper)", nameZh: "临时公园", rect: [1120, 1150, 1420, 1620], heightM: 5 },
  { id: "L2-team-sports-hall", levelId: L2, kind: "area", nameEn: "Team Sports Hall", nameZh: "团体运动馆", rect: [1150, 780, 1500, 1050], heightM: 10 },
  { id: "L2-holding-lounge", levelId: L2, kind: "room", nameEn: "Holding Lounge", nameZh: "候场厅", rect: [1650, 800, 1960, 900], heightM: 5 },
  { id: "L2-hdb-office", levelId: L2, kind: "room", nameEn: "HDB Office", nameZh: "建屋局办事处", rect: [1650, 500, 2030, 650], heightM: 5 },
  { id: "L2-enrichment", levelId: L2, kind: "room", nameEn: "Enrichment", nameZh: "培训中心", rect: [1700, 630, 1900, 700], heightM: 4 },
  { id: "L2-sky-terrace", levelId: L2, kind: "area", nameEn: "Sky Terrace", nameZh: "空中平台", rect: [1180, 500, 1500, 700], heightM: 5 },
];
