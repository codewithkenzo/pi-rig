/**
 * Nerd font icon map — used across all pi extensions.
 * Each key has both a nerd font glyph and an ASCII fallback.
 *
 * Detect nerd fonts at runtime: read `.pi/ui.json` → `nerdFonts: true`
 */

export const nerdIcons = {
  // Status / flow
  running:   "\uf144",  //  play-circle
  success:   "\uf058",  //  check-circle
  error:     "\uf057",  //  times-circle
  waiting:   "\uf254",  //  hourglass-start
  cancelled: "\uf28d",  //  stop-circle
  pending:   "\uf111",  //  circle

  // Media
  paused:    "\uf28b",  //  pause-circle
  recording: "\uf130",  //  microphone
  play:      "\uf04b",  //  play
  stop:      "\uf04d",  //  stop

  // Agent / AI
  planning:  "\udb80\udc93",  //  nf-md-brain
  memory:    "\udb80\udc93",  //  nf-md-brain
  flow:      "\uf04b",  //  play

  // File / code
  diff:      "\ue725",  //  nf-dev-git
  sandbox:   "\uf1c0",  //  database
  search:    "\uf002",  //  magnify

  // Tasks
  tasks:     "\uf0c8",  //  checkbox
  todo:      "\uf096",  //  checkbox-blank-outline
  done:      "\uf14a",  //  checkbox-marked
  inProgress:"\uf192",  //  record-circle-outline
  deferred:  "\uf28d",  //  stop-circle

  // UI chrome
  bg:        "\uf111",  //  circle (background indicator)
  tree:      "\uf0e8",  //  sitemap
  collapse:  "\uf077",  //  chevron-up
  expand:    "\uf078",  //  chevron-down
  separator: "\u2502",  //  │

  // Arrows / indicators
  arrowRight: "\uf054",
  arrowDown:  "\uf078",
  bullet:     "\uf444",  //  nf-md-circle-small
} as const;

export const asciiIcons = {
  running:   ">",
  success:   "✓",
  error:     "✗",
  waiting:   "?",
  cancelled: "⊘",
  pending:   "○",
  paused:    "‖",
  recording: "●",
  play:      "▶",
  stop:      "■",
  planning:  "~",
  memory:    "~",
  flow:      "▶",
  diff:      "±",
  sandbox:   "#",
  search:    "/",
  tasks:     "□",
  todo:      "○",
  done:      "✓",
  inProgress:"◎",
  deferred:  "⊘",
  bg:        "·",
  tree:      "+",
  collapse:  "^",
  expand:    "v",
  separator: "│",
  arrowRight: ">",
  arrowDown:  "v",
  bullet:     "·",
} as const satisfies Record<keyof typeof nerdIcons, string>;

export type IconKey = keyof typeof nerdIcons;

/**
 * Returns the icon set to use based on config.
 * Pass `useNerd: true` to get nerd font glyphs.
 */
export const icons = (useNerd: boolean): typeof nerdIcons | typeof asciiIcons =>
  useNerd ? nerdIcons : asciiIcons;

/**
 * Single icon lookup with fallback.
 */
export const icon = (key: IconKey, useNerd: boolean): string =>
  useNerd ? nerdIcons[key] : asciiIcons[key];

