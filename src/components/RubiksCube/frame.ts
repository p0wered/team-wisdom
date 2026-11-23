/**
 * How far the canvas reaches above and below the cube's layout box, as a
 * fraction of the box height (0.15 = 15 % each way).
 *
 * The cube's farthest corner is ≈ 2.55 units from its centre (2.62 during
 * the "solved" swell), so whenever a corner points straight up or down it
 * needs ≈ 5.3 units of height. The hero frames 5. The canvas bleeds past
 * the box instead, and the camera widens its view by the same factor, so the
 * cube keeps its size and the layout keeps its box. The bleed is
 * transparent and takes no pointer events.
 */
export const CANVAS_BLEED = 0.15

/** Canvas height ÷ layout-box height. */
export const BLEED_FACTOR = 1 + 2 * CANVAS_BLEED
