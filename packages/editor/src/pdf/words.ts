/**
 * The word lists of `scripts/extract-storey-plan.py`, which decide what a
 * printed line is. Verbatim, except where Part B departs from the script on
 * purpose (spec §5.2): a void is a draft, so "Void" is not junk here;
 * escalators and stairs are left out and reported; and an outer line is not
 * a name.
 */

/** A grid dimension: one bay, in millimetres. */
export const GRID_MM = /^\d{3,5}$/;

export const ROOMY: ReadonlySet<string> = new Set([
  "STALL", "RESTAURANT", "KITCHEN", "SHOP", "TOILET", "CORRIDOR", "STORAGE",
  "STORE", "ROOM", "STUDIO", "CHANGING", "LOUNGE", "CONCESSION", "REFEREE",
  "TUNNEL", "HALLWAY", "SEATING", "LOBBY", "SHOWER", "KIOSK", "PLAZA",
  "WALKWAY", "FIELD", "POOL", "RECREATIONAL", "TERRACE", "LIBRARY",
  "THEATRE", "GALLERY", "HALL", "OFFICE", "NURSING", "FAMILY", "SECURITY",
  "CARETAKER", "CLEANER", "AID", "SERVER", "CHAMBER", "REFUSE", "TRAY",
  "WASH", "TAXI", "DECK", "VOID", "ESCALATOR", "PANTRY", "CENTRE", "AREA",
  "COMMAND", "LAN", "MDF", "AHU", "SWITCH", "CHEMICAL", "SPRINKLER",
  "FIRST", "MEDIA", "VIP", "TEAM", "PLAYER'S", "MULTI", "FITNESS",
  "COMMUNITY", "DANCE", "HOCKEY", "TENNIS", "FUTSAL", "SWIMMING", "STADIUM",
]);

export const SERVICE_WORDS: ReadonlySet<string> = new Set([
  "STORAGE", "STORE", "LAN", "MDF", "AHU", "SWITCH", "CHAMBER", "SHAFT",
  "RISER", "REFUSE", "PUMP", "WASH", "TRAY", "CLEANER", "ELEC", "CHEMICAL",
  "SPRINKLER", "COMMAND", "SECURITY", "SERVER", "CARETAKER", "CHUTE",
]);

export const AREA_WORDS: ReadonlySet<string> = new Set([
  "CORRIDOR", "HALLWAY", "LOBBY", "TUNNEL", "RECREATIONAL", "CONCOURSE", "SEATING", "PLAZA", "WALKWAY",
]);

/** Named as open, and the drawing never closes it: both tests must pass. */
export const OPEN_WORDS: ReadonlySet<string> = new Set([
  "PLAZA", "WALK", "WALKWAY", "FIELD", "DECK", "TAXI", "SEATING", "ARRIVAL", "EVENT", "POOL",
]);

/** Left out and reported: flooded, L1's escalators came out as walled rooms. Part D draws them as flights. */
export const FLIGHT_WORDS: ReadonlySet<string> = new Set(["ESCALATOR", "ESCALATORS", "STAIR", "STAIRS", "STAIRCASE"]);

/**
 * The script's list, which reads from the start of a line, and one more that
 * does not: L1 marks a tunnel's edge "TUNNEL OUTER LINE", which leads with a
 * room word and names no space. None of L1's rooms came from it.
 */
export const NOT_A_NAME = new RegExp(
  "^(FFL|SFL|SLL|CLL|RL|FALL|GRADIENT|RWDP|LINE OF|DOUBLE SLAB|MIN HEADROOM|" +
    "BOUNDARY|BASEMENT|ROOF LINE|UP TO|UP FROM|RAMP UP|STEP UP|SHUTTER GATE|" +
    "OPERABLE|TO \\+)|\\bOUTER LINE\\b",
  "i",
);

/** A floor level, printed under half the names on a sheet: not part of any name, and not erased. */
export const LEVEL_LINE = /^(FFL|SFL|SLL|CLL|RL)\b|^[+-]?[\d.,]+$/i;
/** Global: only ever used with `replace`, which resets it. */
export const LEVEL_NOTE = /\b(?:FFL|SFL|SLL|CLL|RL)\b\s*[+-]?[\d.,]*/gi;
/** Global: only ever used with `replace`, which resets it. */
export const SERVICE_CODE = /\b(?:WTR|SAN|TEL|ELV|FAD|EAD|KEAD|KFAD|RWDP|IEP|MV|BI|SCV|VRF|HR|DR|FU)\b/g;
/** Not a space at all. The script dropped "Void" too; Part B keeps voids as drafts. */
export const JUNK_NAME = /^(Field|Slab Above|Step Up|Shutter|Ramp|Fall)\b/i;
export const FIXUPS: Readonly<Record<string, string>> = {
  Hcp: "HCP", Vip: "VIP", Ahu: "AHU", Lan: "LAN", Mdf: "MDF", Fm: "FM", Sppg: "SPPG", Ht: "HT",
};

/** A label's words as the script reads them: runs of two or more letters, an apostrophe counting as one. */
export function wordsIn(text: string): Set<string> {
  return new Set(text.toUpperCase().match(/[A-Z']{2,}/g) ?? []);
}

export function hasWordIn(text: string, list: ReadonlySet<string>): boolean {
  for (const w of wordsIn(text)) if (list.has(w)) return true;
  return false;
}

/** Whether a printed line reads as the name of a space. */
export function isRoomLabel(text: string): boolean {
  return !NOT_A_NAME.test(text) && hasWordIn(text, ROOMY);
}
