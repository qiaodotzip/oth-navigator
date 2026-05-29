import type { FloorId, Language } from "@/data/types";

/**
 * Map-label naming for points of interest. The raw polygon ids (e.g.
 * "L1-room-to-L2-escalator-2") are internal — never show them to a visitor.
 * This resolves a short, friendly, bilingual name for the labels worth showing,
 * and returns null for infrastructure that should stay unlabelled (lifts,
 * escalators, stairs, structural slabs) so the map reads as a place, not a CAD
 * drawing.
 */

// Infrastructure / structural pieces a visitor never navigates *to* by name.
const HIDE = /elevator|escalator|stair|lift|court-roof|^space$|void|^to-/i;

// Concise, bilingual names. Short enough to sit on a 3D map without crowding;
// the full service name lives in the bottom sheet, not on the map.
const FRIENDLY: Record<string, { en: string; zh: string }> = {
  "town-square": { en: "Town Square", zh: "市镇广场" },
  "central-plaza": { en: "Central Plaza", zh: "中央广场" },
  "interim-park": { en: "Park", zh: "公园" },
  "taxi-stand": { en: "Taxi Stand", zh: "德士站" },
  hawker: { en: "Hawker Centre", zh: "小贩中心" },
  stage: { en: "Event Stage", zh: "活动舞台" },
  stadium: { en: "Sports Field", zh: "运动场" },
  commercial: { en: "Shops", zh: "商店" },
  psc: { en: "ServiceSG", zh: "公共服务" },
  "family-nexus": { en: "Family Nexus", zh: "家庭服务站" },
  library: { en: "Library", zh: "图书馆" },
  theatre: { en: "Theatre", zh: "剧院" },
  "sky-terrace": { en: "Sky Terrace", zh: "空中花园" },
  "hdb-office": { en: "HDB Office", zh: "建屋局" },
  "heritage-gallery": { en: "Heritage Gallery", zh: "文物馆" },
  "culinary-studio": { en: "Culinary Studio", zh: "烹饪室" },
  "music-studios": { en: "Music Studios", zh: "音乐室" },
  "team-sports-hall": { en: "Sports Hall", zh: "体育馆" },
  "interest-group-room": { en: "Activity Room", zh: "活动室" },
  enrichment: { en: "Enrichment", zh: "增益课室" },
  conference: { en: "Conference", zh: "会议室" },
};

/** Strip floor prefix, "room-"/"landmark-" prefix and trailing index → a key. */
export function poiKey(id: string, floorId: FloorId): string {
  let s = id.startsWith(`${floorId}-`) ? id.slice(floorId.length + 1) : id;
  s = s.replace(/^(room|landmark)-/, "");
  s = s.replace(/-\d+$/, "");
  return s.toLowerCase();
}

function humanize(key: string): string {
  return key
    .split("-")
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * The label to show for a polygon, or null to leave it unlabelled.
 */
export function poiLabel(id: string, floorId: FloorId, lang: Language): string | null {
  const key = poiKey(id, floorId);
  if (HIDE.test(key)) return null;
  const friendly = FRIENDLY[key];
  if (friendly) return lang === "zh" ? friendly.zh : friendly.en;
  return humanize(key);
}
