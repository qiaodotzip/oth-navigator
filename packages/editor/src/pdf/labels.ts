import type { BBox, RoomKind } from "@oth/model";
import { AREA_WORDS, FIXUPS, JUNK_NAME, LEVEL_LINE, LEVEL_NOTE, SERVICE_CODE, SERVICE_WORDS, hasWordIn, wordsIn } from "./words";

/** A line of text on the plan, in model metres (y north), with its centre. */
export type ModelLine = { text: string; box: BBox; x: number; y: number };
export type Label = { text: string; x: number; y: number };

/** Lines of one name sit within this much of each other across, and less than this apart down. */
const LINE_ALIGN_M = 1.2;
const LINE_GAP_M = 2.0;

/** Whether a line is lettering to read and erase, and not a floor level printed under a name. */
export const isWording = (text: string) => text !== "" && !LEVEL_LINE.test(text);

/**
 * Printed labels, grouped back into the multi-line names they were (the
 * script's `labels`). Top line first: the script sorted by x first, so a
 * second line printed right of centre started a name of its own.
 */
export function groupLabels(lines: readonly ModelLine[]): Label[] {
  const kept = lines.filter(l => isWording(l.text)).sort((a, b) => b.y - a.y || a.x - b.x);
  const used = kept.map(() => false);
  const out: Label[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (used[i]) continue;
    const group = [kept[i]!];
    used[i] = true;
    for (let j = i + 1; j < kept.length; j++) {
      if (used[j]) continue;
      const next = kept[j]!;
      const last = group[group.length - 1]!;
      const below = last.y - next.y;
      if (Math.abs(next.x - last.x) < LINE_ALIGN_M && below > 0 && below < LINE_GAP_M) {
        group.push(next);
        used[j] = true;
      }
    }
    out.push({
      text: group.map(g => g.text).join(" ").replace(/\s+/g, " ").trim(),
      x: group.reduce((s, g) => s + g.x, 0) / group.length,
      y: group.reduce((s, g) => s + g.y, 0) / group.length,
    });
  }
  return out;
}

/**
 * Python's str.title(), except that a letter after an apostrophe stays small:
 * "Cleaner's", not the script's "Cleaner'S".
 */
export function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** A label as a name (the script's `tidy`): no level notes or service codes, in title case. */
export function tidy(text: string): string {
  let t = text.replace(/\s*\((?:SSC|CC)\)/g, "");
  t = t.replace(LEVEL_NOTE, " ").replace(SERVICE_CODE, " ");
  t = t.replace(/\s+/g, " ").replace(/^[ \-|/,]+|[ \-|/,]+$/g, "");
  t = titleCase(t);
  for (const [from, to] of Object.entries(FIXUPS)) t = t.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  return t;
}

/** The longest of the names that flooded one space, then the first alphabetically, as the script chose. */
export function bestName(labels: readonly string[]): string | null {
  const names = labels.map(tidy).filter(n => n !== "");
  names.sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  return names[0] ?? null;
}

/** A draft's kind (the script's `classify`), and `void` for a void, which Part B keeps (spec §5.2). */
export function kindOf(name: string): RoomKind {
  if (wordsIn(name).has("VOID")) return "void";
  if (hasWordIn(name, SERVICE_WORDS)) return "service";
  if (hasWordIn(name, AREA_WORDS)) return "area";
  return "room";
}

export function isJunk(name: string): boolean {
  return JUNK_NAME.test(name);
}
