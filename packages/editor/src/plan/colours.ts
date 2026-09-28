/**
 * Selection on the plan, in the accent (spec §12). Teal marks what is selected
 * everywhere; the SVG cannot use Tailwind's names, so these are the same values
 * as `accent` and `accent.ring`.
 */
export const SELECTED_STROKE = "#0f766e";
export const SELECTED_FILL = "#14b8a6";

/** A space's edge, and the rim of its corner handles: stone-600. */
export const SPACE_STROKE = "#57534e";

/**
 * The floor below's outlines, which a plan is lined up on: the same edge as a
 * space's own, drawn dashed and faint so it reads as a guide.
 */
export const BELOW_STROKE = SPACE_STROKE;

/**
 * A draft from the drawing, in the proposed colour (`proposed` in
 * tailwind.config): it is a claim until someone accepts it.
 */
export const PROPOSED_STROKE = "#0284c7";
