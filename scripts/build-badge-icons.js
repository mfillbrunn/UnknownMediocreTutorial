#!/usr/bin/env node
/* Builds the badge and quest-reward icons (public/cuddle/icons/reward-*.svg)
 * in one style: a rounded tile tinted by the badge's type, and one bold,
 * flat symbol on it. Every icon uses four colours at most -- the type's
 * tint (tile), its deep shade (outline and ink), its accent (fills) and
 * white (highlights) -- so badges read as one set wherever they appear
 * (reward cards, the badge page, packs).
 *
 *   node scripts/build-badge-icons.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "cuddle", "icons");

// tint: the tile; deep: outline and ink; accent: the symbol's fill.
const PALETTES = {
  letters: { tint: "#ece6ff", deep: "#3b2a7a", accent: "#8b6cff" },
  clues: { tint: "#e2efff", deep: "#1f3f73", accent: "#4a95ff" },
  points: { tint: "#e0f6e8", deep: "#1d5a3a", accent: "#35b872" },
  money: { tint: "#fff2cf", deep: "#6b4a0e", accent: "#f2b632" },
  quests: { tint: "#ffe8dc", deep: "#7a3418", accent: "#ff7d4a" },
  tiles: { tint: "#d9f5f1", deep: "#155a54", accent: "#26b5a7" },
  safety: { tint: "#ffe2ea", deep: "#7a2338", accent: "#ef5b7f" }
};
const W = "#ffffff";

// -- drawing helpers (96 x 96 box; the symbol sits in about 18..78) --------
let P; // the palette being drawn
const ink = () => P.deep;
const acc = () => P.accent;
const SW = 4; // outline width

function rect(x, y, w, h, r, fill, stroke = ink(), sw = SW) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ""} stroke-linejoin="round"/>`;
}
function circle(cx, cy, r, fill, stroke = ink(), sw = SW) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;
}
function path_(d, fill, stroke = ink(), sw = SW) {
  return `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
}
function line(d, stroke = ink(), sw = SW) {
  return path_(d, "none", stroke, sw);
}
function text(x, y, value, size = 26, fill = ink()) {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Nunito, Arial Rounded MT Bold, Arial, sans-serif" font-weight="900" font-size="${size}" fill="${fill}">${value}</text>`;
}
// A letter tile.
function tile(x, y, s, letter, fill = acc(), letterFill = W) {
  return rect(x, y, s, s, s * 0.22, fill) + (letter ? text(x + s / 2, y + s / 2 + 1, letter, s * 0.6, letterFill) : "");
}
// A playing card (portrait).
function card(x, y, w, h, fill = W, rot = 0) {
  const body = rect(x, y, w, h, 6, fill);
  return rot ? `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">${body}</g>` : body;
}
function star(cx, cy, r, fill = acc(), stroke = ink(), sw = SW) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ""} stroke-linejoin="round"/>`;
}
function plusBadge(cx, cy, r = 10) {
  return circle(cx, cy, r, W) + line(`M${cx - r * 0.5} ${cy}h${r}M${cx} ${cy - r * 0.5}v${r}`, ink(), 3.5);
}
// A circular arrow (refresh), centred: an open ring with a solid arrowhead.
function cycle(cx, cy, r, color = ink(), sw = 5) {
  const at = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const from = -60;
  const to = 220;
  const [sx, sy] = at(from);
  const [ex, ey] = at(to);
  const t = (to * Math.PI) / 180;
  const tx = -Math.sin(t);
  const ty = Math.cos(t);
  const nx = Math.cos(t);
  const ny = Math.sin(t);
  const head = sw * 1.5;
  const tip = [ex + tx * head * 1.3, ey + ty * head * 1.3];
  const left = [ex + nx * head, ey + ny * head];
  const right = [ex - nx * head, ey - ny * head];
  const f = (pt) => `${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`;
  return line(`M${f([sx, sy])}A${r} ${r} 0 1 1 ${f([ex, ey])}`, color, sw)
    + `<path d="M${f(tip)}L${f(left)}L${f(right)}z" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
}
function check(x, y, s, color = ink(), sw = 6) {
  return line(`M${x} ${y}l${s * 0.35} ${s * 0.35}l${s * 0.65} -${s * 0.7}`, color, sw);
}
function flag(x, y, fill = acc()) {
  return line(`M${x} ${y}v48`, ink(), 5) + path_(`M${x} ${y + 2}h30l-7 10l7 10h-30z`, fill);
}
function gift(x, y, s) {
  return rect(x, y + s * 0.28, s, s * 0.72, 6, acc()) + rect(x - 3, y + s * 0.14, s + 6, s * 0.22, 5, acc())
    + line(`M${x + s / 2} ${y + s * 0.14}v${s * 0.86}`, W, 6)
    + path_(`M${x + s / 2} ${y + s * 0.14}c-6 -12 -18 -10 -14 -1c2 4 8 1 14 1zM${x + s / 2} ${y + s * 0.14}c6 -12 18 -10 14 -1c-2 4 -8 1 -14 1z`, W);
}
function scissors(cx, cy) {
  return line(`M${cx - 14} ${cy - 22}L${cx + 10} ${cy + 8}M${cx + 14} ${cy - 22}L${cx - 10} ${cy + 8}`, ink(), 6)
    + circle(cx - 13, cy + 16, 9, acc()) + circle(cx + 13, cy + 16, 9, acc());
}
function heart(cx, cy, s, fill = acc()) {
  return path_(`M${cx} ${cy + s * 0.9}C${cx - s * 1.6} ${cy - s * 0.1} ${cx - s * 0.9} ${cy - s * 1.25} ${cx} ${cy - s * 0.45}C${cx + s * 0.9} ${cy - s * 1.25} ${cx + s * 1.6} ${cy - s * 0.1} ${cx} ${cy + s * 0.9}z`, fill);
}
function hourglass(cx, cy) {
  return path_(`M${cx - 16} ${cy - 24}h32M${cx - 16} ${cy + 24}h32`, "none", ink(), 6)
    + path_(`M${cx - 12} ${cy - 24}c0 14 10 16 12 24c2 -8 12 -10 12 -24zM${cx - 12} ${cy + 24}c0 -14 10 -16 12 -24c2 8 12 10 12 24z`, W)
    + path_(`M${cx - 7} ${cy + 20}c3 -6 6 -8 7 -12c1 4 4 6 7 12z`, acc(), null);
}
function magnifier(cx, cy, inner = "") {
  return line(`M${cx + 11} ${cy + 11}l14 14`, ink(), 8) + circle(cx, cy, 16, W) + inner;
}
function clock(cx, cy, r = 22) {
  return circle(cx, cy, r, W) + line(`M${cx} ${cy - r * 0.55}V${cy}l${r * 0.4} ${r * 0.3}`, ink(), 5);
}
function bolt(cx, cy, s = 1, fill = acc()) {
  return path_(`M${cx + 4 * s} ${cy - 24 * s}L${cx - 12 * s} ${cy + 3 * s}h${12 * s}l${-4 * s} ${21 * s}L${cx + 14 * s} ${cy - 5 * s}h${-12 * s}z`, fill);
}
function eye(cx, cy, s = 1) {
  return path_(`M${cx - 24 * s} ${cy}C${cx - 12 * s} ${cy - 16 * s} ${cx + 12 * s} ${cy - 16 * s} ${cx + 24 * s} ${cy}C${cx + 12 * s} ${cy + 16 * s} ${cx - 12 * s} ${cy + 16 * s} ${cx - 24 * s} ${cy}z`, W)
    + circle(cx, cy, 8 * s, acc()) + circle(cx, cy, 3 * s, ink(), null);
}
function grid(x, y, s, mark) {
  // A board square: a 2x2 of tiles, one of them special.
  const g = s / 2 - 3;
  return rect(x, y, g, g, 5, W) + rect(x + g + 6, y, g, g, 5, W) + rect(x, y + g + 6, g, g, 5, W)
    + rect(x + g + 6, y + g + 6, g, g, 5, acc()) + (mark ? mark(x + g * 1.5 + 6, y + g * 1.5 + 6, g) : "");
}
function die(cx, cy, s, pips, fill = W, rot = 0) {
  const h = s / 2;
  const dots = pips.map(([dx, dy]) => circle(cx + dx * s * 0.27, cy + dy * s * 0.27, s * 0.09, ink(), null)).join("");
  return `<g transform="rotate(${rot} ${cx} ${cy})">${rect(cx - h, cy - h, s, s, s * 0.2, fill)}${dots}</g>`;
}
function book(cx, cy, mark = "") {
  return path_(`M${cx} ${cy - 16}c-8 -6 -20 -6 -28 -2v36c8 -4 20 -4 28 2z`, W) + path_(`M${cx} ${cy - 16}c8 -6 20 -6 28 -2v36c-8 -4 -20 -4 -28 2z`, acc())
    + line(`M${cx} ${cy - 16}v36`) + mark;
}
function scroll(cx, cy, mark = "") {
  return rect(cx - 18, cy - 24, 36, 48, 6, W) + rect(cx - 22, cy - 28, 44, 10, 5, acc()) + rect(cx - 22, cy + 20, 44, 10, 5, acc()) + mark;
}
function chest(cx, cy) {
  return path_(`M${cx - 26} ${cy - 4}v-6c0 -10 8 -16 16 -16h20c8 0 16 6 16 16v6z`, acc())
    + rect(cx - 26, cy - 4, 52, 28, 5, acc()) + line(`M${cx - 26} ${cy + 4}h52`) + rect(cx - 6, cy - 2, 12, 14, 3, W);
}
function shield(cx, cy, fill = acc()) {
  return path_(`M${cx} ${cy - 26}l22 8v12c0 16 -10 26 -22 32c-12 -6 -22 -16 -22 -32v-12z`, fill) + path_(`M${cx} ${cy - 18}v42`, "none", W, 4);
}
function candle(cx, cy) {
  return rect(cx - 9, cy - 6, 18, 32, 4, W) + path_(`M${cx} ${cy - 30}c8 8 8 16 0 18c-8 -2 -8 -10 0 -18z`, acc());
}
function trophyRibbon(cx, cy) {
  return path_(`M${cx - 12} ${cy + 4}l-6 24l10 -5l6 8l4 -24zM${cx + 12} ${cy + 4}l6 24l-10 -5l-6 8l-4 -24z`, W) + circle(cx, cy - 6, 16, acc()) + star(cx, cy - 6, 9, W, null);
}
function chain(cx, cy) {
  return `<g transform="rotate(-35 ${cx} ${cy})">${rect(cx - 30, cy - 9, 30, 18, 9, "none", ink(), 6)}${rect(cx - 4, cy - 9, 30, 18, 9, "none", acc(), 6)}</g>`;
}
function bubble(cx, cy, fill = W) {
  return path_(`M${cx - 28} ${cy - 18}h56a6 6 0 0 1 6 6v24a6 6 0 0 1 -6 6h-34l-12 10v-10h-10a6 6 0 0 1 -6 -6v-24a6 6 0 0 1 6 -6z`, fill);
}
function hook(cx, cy) {
  return line(`M${cx + 6} ${cy - 30}v34a11 11 0 0 1 -22 0v-6l7 6`, ink(), 8) + line(`M${cx + 6} ${cy - 30}v34a11 11 0 0 1 -22 0v-6l7 6`, acc(), 3.5) + circle(cx + 6, cy - 30, 4.5, W);
}

// -- the symbols --------------------------------------------------------------
const GLYPHS = {
  // Letters: cards and the hand.
  extraMulligans: () => card(26, 22, 30, 42, W, -10) + card(40, 26, 30, 42, acc(), 8) + cycle(55, 47, 9, W, 4),
  mulliganSize: () => card(22, 26, 28, 40, W, -12) + card(34, 22, 28, 40, W) + card(46, 26, 28, 40, acc(), 12) + plusBadge(70, 68),
  cullOne: () => scissors(48, 46),
  cullTwo: () => scissors(40, 44) + tile(56, 54, 22, "Q"),
  handSizeBoost: () => card(18, 30, 24, 36, W, -14) + card(36, 26, 24, 36, acc()) + card(54, 30, 24, 36, W, 14) + line("M20 22h56", ink(), 4) + path_("M24 17l-6 5l6 5M72 17l6 5l-6 5", "none"),
  jokerCache: () => card(30, 20, 36, 52, W) + star(48, 46, 13),
  jokerCacheLarge: () => card(22, 24, 34, 48, W, -12) + card(40, 20, 34, 48, W, 8) + star(57, 44, 12),
  coachMeterThreshold: () => heart(48, 44, 22, W) + path_("M30 56a20 20 0 0 1 36 0", "none", acc(), 6) + line("M48 56l8 -10"),
  coachMeterReward: () => heart(46, 48, 24) + plusBadge(70, 26, 11),
  waveTiles: () => card(24, 22, 48, 52, W) + line("M30 40c6 -6 10 6 18 0s12 6 18 0M30 54c6 -6 10 6 18 0s12 6 18 0", acc(), 6),
  combine: () => tile(18, 30, 30, "A") + tile(48, 30, 30, "B", W, ink()) + plusBadge(48, 26, 9),
  fishHook: () => hook(52, 52),
  cleanSlate: () => rect(20, 24, 56, 44, 8, W) + star(64, 30, 9, acc()) + line("M30 52l10 -10M38 58l14 -14", acc(), 4),
  cullRare: () => scissors(40, 44) + tile(54, 50, 26, "Z", acc()),
  doubleMulligans: () => cycle(38, 48, 14, ink(), 5) + cycle(60, 48, 14, acc(), 5),
  biggerMulligans: () => card(18, 30, 22, 34, W, -10) + card(37, 26, 22, 34, W) + card(56, 30, 22, 34, W, 10) + cycle(48, 70, 10, acc(), 5),
  // Clues: hints and knowledge.
  categorySense: () => path_("M22 30h34l18 18l-18 18h-34z", acc()) + circle(34, 48, 5, W),
  greenCount: () => tile(24, 24, 48, "", acc()) + text(48, 49, "2", 32, W),
  vowelLamp: () => rect(34, 18, 28, 6, 3, ink(), null) + rect(28, 24, 40, 42, 12, acc()) + text(48, 46, "A", 24, W) + rect(40, 66, 16, 8, 3, ink(), null),
  echoFinder: () => tile(18, 30, 30, "E") + tile(48, 30, 30, "E", W, ink()) + line("M30 70c6 6 30 6 36 0", acc(), 4),
  patternLens: () => tile(16, 40, 22, "") + tile(38, 40, 22, "", W) + tile(60, 40, 22, "") + magnifier(58, 38),
  lastLight: () => candle(48, 52),
  yellowHint: () => tile(24, 24, 48, "", acc()) + text(48, 49, "?", 32, W),
  "alphabet-compass": () => circle(48, 48, 28, W) + path_("M48 22l8 26h-16z", acc()) + path_("M48 74l-8 -26h16z", ink(), null) + circle(48, 48, 4, W),
  consonantSweep: () => tile(24, 28, 40, "K", W, ink()) + line("M20 72L72 22", acc(), 7),
  coachPossibleAnswers: () => scroll(42, 48, line("M32 36h20M32 46h20M32 56h14", ink(), 4)) + circle(68, 64, 12, acc()) + text(68, 65, "5", 15, W),
  boldOpener: () => line("M26 72L60 36", ink(), 8) + line("M26 72L60 36", acc(), 3) + star(64, 30, 13, acc()),
  ideaTiles: () => path_("M48 18c-13 0 -22 9 -22 21c0 8 4 12 8 16c2 2 4 5 4 8v4h20v-4c0 -3 2 -6 4 -8c4 -4 8 -8 8 -16c0 -12 -9 -21 -22 -21z", acc()) + rect(38, 70, 20, 8, 3, W) + line("M42 46l6 6l6 -6", W, 4),
  fullCircle: () => cycle(48, 48, 22, acc(), 7) + check(38, 48, 20, ink(), 5),
  goldenOpener: () => tile(22, 22, 52, "", acc()) + star(48, 48, 16, W),
  freeVowelSweep: () => tile(26, 24, 44, "A", acc()) + line("M18 74c10 -6 50 -6 60 0", ink(), 5),
  revealGreen: () => tile(22, 38, 40, "", acc()) + path_("M62 18c-9 0 -15 6 -15 14c0 10 15 24 15 24s15 -14 15 -24c0 -8 -6 -14 -15 -14z", W) + circle(62, 32, 5, ink(), null),
  allThemesBoss: () => circle(48, 42, 22, acc()) + circle(40, 34, 6, W, null) + rect(32, 64, 32, 10, 4, W),
  // Points.
  storybookStart: () => book(48, 50),
  mulliganValueBoost: () => card(20, 24, 32, 46, W, -8) + circle(62, 54, 16, acc()) + text(62, 55, "+", 22, W),
  earlySolveBoost: () => clock(48, 50) + rect(42, 18, 12, 8, 3, acc()),
  colourTrade: () => tile(18, 34, 28, "", acc()) + tile(50, 34, 28, "", W) + line("M32 26c6 -8 26 -8 32 0M64 70c-6 8 -26 8 -32 0", ink(), 4),
  greyscale: () => tile(24, 24, 48, "", W) + path_("M30 66L66 30v30a6 6 0 0 1 -6 6z", ink(), null),
  encore: () => star(48, 46, 24) + text(48, 48, "2", 16, W),
  vowelBounty: () => tile(18, 28, 36, "A") + circle(64, 58, 16, W) + text(64, 59, "+", 22),
  doubleDown: () => die(38, 50, 30, [[-1, -1], [1, 1]], W, -10) + die(60, 44, 30, [[-1, -1], [0, 0], [1, 1]], acc(), 10),
  momentum: () => line("M20 70L40 50l10 10L72 30", acc(), 8) + path_("M58 28h16v16", "none", acc(), 8),
  bigOpener: () => circle(48, 48, 26, W) + circle(48, 48, 16, acc()) + circle(48, 48, 6, W),
  lastStand: () => line("M28 72L66 28", ink(), 8) + line("M28 72L66 28", W, 3) + line("M36 52l12 12", acc(), 7),
  leanBuild: () => path_("M66 20c-26 4 -40 22 -40 48l4 4c26 0 38 -18 36 -52z", acc()) + line("M30 70l26 -30", W, 4),
  strikeThrough: () => tile(24, 24, 48, "S", W, ink()) + line("M18 50h60", acc(), 7),
  highRoller: () => rect(26, 54, 44, 12, 6, acc()) + rect(26, 42, 44, 12, 6, W) + rect(26, 30, 44, 12, 6, acc()) + star(48, 22, 9, W),
  hardMode: () => path_("M48 16c10 14 22 20 22 36c0 14 -10 24 -22 24s-22 -10 -22 -24c0 -10 6 -16 10 -22c2 8 6 10 8 10c0 -10 2 -16 4 -24z", acc()) + path_("M48 50c6 6 10 10 10 16a10 10 0 0 1 -20 0c0 -6 4 -10 10 -16z", W, null),
  luckyClover: () => [[-11, -11], [11, -11], [-11, 11], [11, 11]].map(([dx, dy]) => circle(48 + dx, 44 + dy, 12, acc())).join("") + circle(48, 44, 6, W, null) + line("M54 62l10 14", ink(), 5),
  ascetic: () => circle(48, 52, 24, W) + circle(48, 52, 6, acc()),
  // Money.
  wideChoice: () => card(16, 30, 26, 38, W, -12) + card(35, 24, 26, 38, acc()) + card(54, 30, 26, 38, W, 12),
  rewardEcho: () => gift(22, 24, 34) + path_("M64 30a16 16 0 0 1 0 28M70 24a24 24 0 0 1 0 40", "none", acc(), 5),
  rainyDay: () => path_("M18 48a30 26 0 0 1 60 0z", acc()) + line("M48 48v20a6 6 0 0 1 -12 0", ink(), 5),
  haggler: () => path_("M22 46l26 -26h26v26l-26 26z", acc()) + circle(62, 34, 5, W) + line("M36 56h16", W, 5),
  treasureHunter: () => path_("M28 36l10 -14h20l10 14l-20 34z", acc()) + line("M28 36h40M38 22l10 14l10 -14", W, 3),
  pickpocket: () => path_("M24 34h48l-6 34a6 6 0 0 1 -6 4h-24a6 6 0 0 1 -6 -4z", W) + circle(48, 30, 13, acc()) + text(48, 31, "$", 15),
  monksVow: () => path_("M48 30c8 10 8 24 0 34c-8 -10 -8 -24 0 -34z", acc()) + path_("M46 62c-10 0 -22 -6 -26 -18c12 0 22 6 26 18zM50 62c10 0 22 -6 26 -18c-12 0 -22 6 -26 18z", W) + line("M24 70h48", ink(), 4),
  blackMarket: () => path_("M26 38h44l-4 34h-36z", acc()) + path_("M36 38v-6a12 12 0 0 1 24 0v6", "none") + text(48, 56, "?", 22, W),
  treasureChest: () => chest(48, 50),
  insertCoin: () => rect(22, 46, 52, 26, 6, W) + rect(36, 54, 24, 6, 3, ink(), null) + circle(48, 30, 14, acc()) + text(48, 31, "$", 15),
  goldenLedger: () => rect(26, 20, 44, 56, 6, acc()) + line("M34 20v56", ink(), 4) + circle(54, 48, 11, W) + text(54, 49, "$", 14),
  // Quests.
  questRefreshes: () => gift(26, 26, 40) + cycle(68, 30, 9, ink(), 4),
  questPoints: () => flag(30, 22) + circle(64, 60, 14, W) + text(64, 61, "+", 20),
  questReroll: () => flag(28, 22) + cycle(64, 60, 11, ink(), 5),
  "surprise-assignment": () => scroll(48, 48, text(48, 49, "!", 28, acc())),
  questMastery: () => trophyRibbon(48, 44),
  overtime: () => clock(44, 50, 20) + plusBadge(68, 28, 11),
  // A quest scroll with a hint tile on it.
  questClue: () => rect(20, 22, 44, 52, 8, W) + line("M30 36h24M30 46h16", ink(), 4) + tile(48, 46, 30, "?", acc()),
  // A hint: a lit letter tile with a sparkle.
  umtClue: () => tile(22, 28, 44, "A", acc()) + star(68, 28, 12, W),
  questChain: () => chain(52, 50),
  questScout: () => `<g transform="rotate(-25 48 48)">${rect(18, 40, 48, 16, 6, acc())}${rect(62, 37, 14, 22, 4, W)}</g>` + line("M40 62l-8 14M48 62l8 14", ink(), 4),
  questDoublePick: () => check(18, 44, 30, acc(), 8) + check(46, 44, 30, ink(), 8),
  questCadence: () => path_("M48 20c-12 0 -18 10 -18 22v12l-6 8h48l-6 -8v-12c0 -12 -6 -22 -18 -22z", acc()) + circle(48, 70, 6, W),
  questPersistReward: () => flag(24, 22) + `<g transform="translate(64 56) scale(0.62) translate(-48 -48)">${hourglass(48, 48)}</g>`,
  // Board squares.
  treasureMap: () => path_("M18 28l20 -6l20 6l20 -6v46l-20 6l-20 -6l-20 6z", W) + line("M38 22v46M58 28v46", ink(), 3) + line("M60 42l10 10M70 42l-10 10", acc(), 5),
  bonusSquares: () => grid(22, 22, 52, (cx, cy) => text(cx, cy + 1, "$", 15, W)),
  mulliganTiles: () => grid(22, 22, 52, (cx, cy) => cycle(cx, cy, 6, W, 3)),
  jokerTiles: () => grid(22, 22, 52, (cx, cy) => star(cx, cy, 9, W, null)),
  oracleTiles: () => grid(22, 22, 52, (cx, cy) => circle(cx, cy, 6, W, null)),
  // Safety nets.
  mistakeShield: () => shield(48, 48),
  gracePeriod: () => hourglass(48, 48),
  fastLane: () => line("M30 20v58", ink(), 5) + rect(30, 20, 40, 28, 2, W) + [[0, 0], [20, 0], [10, 14], [30, 14]].map(([x, y]) => rect(30 + x, 20 + y, 10, 14, 0, acc(), null)).join(""),
  secondCup: () => path_("M24 34h40v18a20 20 0 0 1 -40 0z", acc()) + path_("M64 40h6a8 8 0 0 1 0 16h-6", "none") + line("M36 20c0 4 4 4 4 8M48 20c0 4 4 4 4 8", ink(), 3),
  // Quest rewards.
  stealthGuess: () => card(28, 22, 36, 50, acc()) + cycle(46, 47, 10, W, 4) + plusBadge(68, 68, 10),
  sillyWord: () => bubble(48, 42) + line("M30 42c4 -6 8 6 12 0s8 6 12 0s8 6 12 0", acc(), 4),
  extraLetters: () => tile(18, 30, 30, "K") + tile(48, 30, 30, "P", W, ink()) + plusBadge(70, 70, 10),
  jokerToken: () => card(30, 20, 36, 52, acc()) + star(48, 46, 13, W),
  revealCategory: () => path_("M18 32h32l14 16l-14 16h-32z", acc()) + circle(30, 48, 5, W) + line("M70 38a12 12 0 0 1 0 20M76 32a20 20 0 0 1 0 32", ink(), 4),
  umtRuleOut: () => tile(22, 22, 52, "X", W, ink()) + circle(48, 48, 22, "none", acc(), 6) + line("M33 63L63 33", acc(), 6),
  umtVowelCheck: () => tile(18, 22, 40, "A", acc()) + circle(62, 60, 16, W) + check(54, 60, 16, ink(), 5),
  umtSpotlight: () => path_("M34 18h28l14 44h-56z", acc(), null) + tile(30, 50, 36, "E", W, ink()),
  umtPocketMoney: () => path_("M22 38h52v26a10 10 0 0 1 -10 10h-32a10 10 0 0 1 -10 -10z", acc()) + path_("M22 38l6 -14h40l6 14", W) + circle(48, 56, 9, W) + text(48, 57, "$", 12),
  umtQuickPoints: () => star(48, 48, 28) + bolt(48, 49, 0.8, W),
  umtFishingLine: () => hook(52, 52)
};

// Which palette each symbol takes.
const TYPES = {
  letters: ["extraMulligans", "mulliganSize", "cullOne", "cullTwo", "handSizeBoost", "jokerCache", "jokerCacheLarge", "coachMeterThreshold", "coachMeterReward", "waveTiles", "combine", "fishHook", "cleanSlate", "cullRare", "doubleMulligans", "biggerMulligans", "stealthGuess", "extraLetters", "jokerToken", "umtFishingLine"],
  clues: ["categorySense", "greenCount", "vowelLamp", "echoFinder", "patternLens", "lastLight", "yellowHint", "alphabet-compass", "consonantSweep", "coachPossibleAnswers", "boldOpener", "ideaTiles", "fullCircle", "goldenOpener", "freeVowelSweep", "revealGreen", "allThemesBoss", "revealCategory", "umtRuleOut", "umtVowelCheck", "umtSpotlight", "sillyWord", "umtClue"],
  points: ["storybookStart", "mulliganValueBoost", "earlySolveBoost", "colourTrade", "greyscale", "encore", "vowelBounty", "doubleDown", "momentum", "bigOpener", "lastStand", "leanBuild", "strikeThrough", "highRoller", "hardMode", "luckyClover", "ascetic", "umtQuickPoints"],
  money: ["wideChoice", "rewardEcho", "rainyDay", "haggler", "treasureHunter", "pickpocket", "monksVow", "blackMarket", "treasureChest", "insertCoin", "goldenLedger", "umtPocketMoney"],
  quests: ["questRefreshes", "questPoints", "questReroll", "surprise-assignment", "questMastery", "overtime", "questChain", "questScout", "questClue", "questDoublePick", "questCadence", "questPersistReward"],
  tiles: ["bonusSquares", "treasureMap", "mulliganTiles", "jokerTiles", "oracleTiles"],
  safety: ["mistakeShield", "gracePeriod", "fastLane", "secondCup"]
};

function slug(id) {
  return String(id).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function build(id, type) {
  P = PALETTES[type];
  const body = GLYPHS[id]();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-hidden="true">`
    + `<rect x="4" y="4" width="88" height="88" rx="22" fill="${P.tint}" stroke="${P.deep}" stroke-width="4"/>`
    + body + `</svg>\n`;
}

let written = 0;
const seen = new Set();
Object.entries(TYPES).forEach(([type, ids]) => {
  ids.forEach(id => {
    if (!GLYPHS[id]) throw new Error(`No symbol for ${id}`);
    if (seen.has(id)) throw new Error(`${id} listed twice`);
    seen.add(id);
    fs.writeFileSync(path.join(OUT, `reward-${slug(id)}.svg`), build(id, type));
    written += 1;
  });
});
Object.keys(GLYPHS).forEach(id => { if (!seen.has(id)) throw new Error(`${id} has no type`); });
// The list of badges and rewards that have this art, for the pages that
// draw a badge by its id (cuddle-badge-art.js).
const ids = [...seen].sort();
fs.writeFileSync(path.join(__dirname, "..", "public", "cuddle", "cuddle-badge-art.js"), `/* Cuddle: the badge and quest-reward icons, by id. Generated by
 * scripts/build-badge-icons.js -- edit that, not this.
 *
 * CuddleBadgeArt.img(id) is the icon every page shows for a badge (the
 * badge page, packs, the shop, help, reward cards), so a badge looks the
 * same everywhere.
 */
(function () {
  "use strict";
  if (window.CuddleBadgeArt) return;
  var IDS = new Set(${JSON.stringify(ids)});
  function slug(id) {
    return String(id).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  }
  // Some layers name a badge with a "umt" prefix (umtCullOne for cullOne).
  function key(id) {
    var text = String(id || "");
    if (IDS.has(text)) return text;
    var bare = /^umt[A-Z]/.test(text) ? text.charAt(3).toLowerCase() + text.slice(4) : "";
    return bare && IDS.has(bare) ? bare : "";
  }
  function has(id) { return Boolean(key(id)); }
  function url(id) { return "cuddle/icons/reward-" + slug(key(id) || id) + ".svg"; }
  function img(id, className) {
    return '<img class="umt-badge-art' + (className ? " " + className : "") + '" src="' + url(id) + '" alt="" aria-hidden="true" draggable="false">';
  }
  window.CuddleBadgeArt = Object.freeze({ has: has, key: key, url: url, img: img });
}());
`);
console.log(`Wrote ${written} icons to ${path.relative(process.cwd(), OUT)}`);
