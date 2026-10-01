/* CUDDLE ICONS -- simple SVG icons in place of emoji, everywhere in Cuddle.
 *
 * Every icon is drawn on a 24x24 grid with the same dark outline and one
 * to three flat fill colours, so the set reads as one family whatever
 * font or platform the player is on (emoji look different on every phone).
 *
 * Cuddle's reward, quest, combo and toast data still carry their emoji as
 * short ids; nothing has to change there. Two things turn them into icons:
 *   - CuddleIcons.markup(emoji) for renderers that draw into SVG (the
 *     progression tree), and
 *   - a pass over the Cuddle screen after every render that swaps any
 *     emoji text for its icon, and strips emoji from tooltips and labels.
 * An emoji with no drawing here still never shows: it gets a neutral
 * sparkle, and a console warning names it so it can be drawn.
 */
(function bootstrapCuddleIcons() {
  "use strict";

  const INK = "#2b2238";
  // Lines that stand on their own (a handle, a stem, a frame) have no fill
  // around them, so they take a light colour that shows on Cuddle's dark
  // screens; the dark ink outlines filled shapes and draws details on them.
  const LINE = "#e8e0f4";
  const L = (width = 1.6) => `stroke="${LINE}" stroke-width="${width}"`;
  const C = {
    gold: "#f6c956", yellow: "#e9c046", green: "#53c47c", red: "#ef5a67",
    pink: "#ff8fc0", violet: "#a98bff", blue: "#6aa8ff", teal: "#5ad1c0",
    cream: "#fff3dc", grey: "#9aa0ab", orange: "#ff9b4a", brown: "#c98a4b",
    skin: "#ffd29a", night: "#3d3450"
  };

  // -- shared pieces -----------------------------------------------------------
  const tile = color => `<rect x="4" y="4" width="16" height="16" rx="3.5" fill="${color}"/>`;
  const disc = color => `<circle cx="12" cy="12" r="8" fill="${color}"/>`;
  const heart = color => `<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="${color}"/>`;
  // Two arrows chasing round a circle (refresh, repeat, recycle).
  const loop = color => {
    const arcs = "M18.5 12a6.5 6.5 0 0 1-11.3 4.4M5.5 12a6.5 6.5 0 0 1 11.3-4.4";
    return `<path d="${arcs}" fill="none" stroke-width="4.4"/>`
      + `<path d="${arcs}" fill="none" stroke="${color}" stroke-width="2.4"/>`
      + `<path d="M17.3 3.6v4.2h-4.2M6.7 20.4v-4.2h4.2" fill="none" stroke-width="2"/>`;
  };
  const star = (color, cx = 12, cy = 12, r = 8.5) => {
    const points = [];
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? r * 0.45 : r;
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`);
    }
    return `<path d="M${points.join("L")}z" fill="${color}"/>`;
  };
  const card = (color, extra = "") => `<rect x="5" y="3" width="14" height="18" rx="2.5" fill="${color}"/>${extra}`;
  const face = extra => `<circle cx="12" cy="12" r="8.5" fill="${C.gold}"/>${extra}`;
  const chart = line => `<rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="${C.cream}"/>${line}`;
  const medal = ribbon => `<path d="M7.5 3h3.5l1 5.5-3.3 1zM16.5 3H13l-1 5.5 3.3 1z" fill="${ribbon}"/>`
    + `<circle cx="12" cy="15" r="6" fill="${C.gold}"/>${star(C.cream, 12, 15, 3.2).replace("/>", ' stroke-width="1"/>')}`;
  const skull = `<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.2 3 5.2V19a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3.3c1.7-1 3-2.6 3-5.2A7.5 7.5 0 0 0 12 3z" fill="${C.cream}"/>`
    + `<circle cx="9" cy="11" r="1.8" fill="${INK}"/><circle cx="15" cy="11" r="1.8" fill="${INK}"/><path d="M12 13.5l-1 2h2z" fill="${INK}"/><path d="M10.3 20v-2M13.7 20v-2"/>`;
  const magnifier = `<circle cx="10.5" cy="10.5" r="6" fill="${C.blue}"/><path d="M8 8.8a3 3 0 0 1 2.6-1.6" fill="none" stroke="${C.cream}"/><path d="M15 15l5.5 5.5" stroke="${C.grey}" stroke-width="3"/>`;
  const hand = `<path d="M8.5 20.5c-2-1.4-3.5-3.8-3.5-6.3v-3a1.3 1.3 0 0 1 2.6 0v2.3V6.7a1.3 1.3 0 0 1 2.6 0v5V5.3a1.3 1.3 0 0 1 2.6 0v6.4V6.4a1.3 1.3 0 0 1 2.6 0v6.8-3.6a1.3 1.3 0 0 1 2.6 0v4.8c0 3.6-2.4 6.1-5.6 6.1z" fill="${C.skin}"/>`;

  // -- the drawings, by name ----------------------------------------------------
  const DRAWINGS = {
    joker: card(C.cream, star(C.pink, 12, 12, 5)),
    sparkles: `<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z" fill="${C.gold}"/><path d="M18 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="${C.gold}"/>`,
    crystalBall: `<circle cx="12" cy="10" r="7" fill="${C.violet}"/><path d="M8.8 7.8a3.6 3.6 0 0 1 3-1.8" fill="none" stroke="${C.cream}"/><path d="M6 20.5h12l-1.6-3.6H7.6z" fill="${C.gold}"/>`,
    greenTile: tile(C.green),
    yellowTile: tile(C.yellow),
    greyTile: tile(C.grey),
    compass: `<circle cx="12" cy="12" r="8.5" fill="${C.cream}"/><path d="M12 5.5l2.2 6.5H9.8z" fill="${C.red}"/><path d="M12 18.5L9.8 12h4.4z" fill="${C.blue}"/>`,
    scissors: `<path d="M9 14.5L16.8 4.2M15 14.5L7.2 4.2" ${L(2.2)}/><circle cx="7" cy="17" r="3" fill="${C.red}"/><circle cx="17" cy="17" r="3" fill="${C.red}"/>`,
    bolt: `<path d="M13.5 2.5l-8 11h5.5l-1.5 8 9-12h-5.5z" fill="${C.gold}"/>`,
    hourglass: `<path d="M7 3.5h10c0 4-5 6.5-5 8.5s5 4.5 5 8.5H7c0-4 5-6.5 5-8.5S7 7.5 7 3.5z" fill="${C.cream}"/><path d="M9.6 19.2h4.8L12 16.2z" fill="${C.gold}"/><path d="M5.5 3.5h13M5.5 20.5h13" ${L(2)}/>`,
    bulb: `<path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" fill="${C.gold}"/><rect x="9.5" y="16" width="5" height="3" rx="1" fill="${C.grey}"/><path d="M10.5 21h3" ${L()}/>`,
    refresh: loop(C.blue),
    repeat: loop(C.teal),
    recycle: loop(C.green),
    gift: `<rect x="4" y="9" width="16" height="11" rx="1.5" fill="${C.pink}"/><rect x="3" y="6.5" width="18" height="4" rx="1.2" fill="${C.pink}"/><rect x="10.5" y="6.5" width="3" height="13.5" fill="${C.gold}"/><path d="M12 6.5c-1.5-3.5-5.5-3-4.5-.5.6 1.5 4.5.5 4.5.5s3.9 1 4.5-.5c1-2.5-3-3-4.5.5z" fill="${C.gold}"/>`,
    skull,
    crossbones: `<path d="M4 19l16-6M4 13l16 6" stroke-width="2.4"/>${skull.replace('cy="11"', 'cy="10"').replace('cy="11"', 'cy="10"')}`,
    die: `${tile(C.cream)}${[[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${INK}" stroke="none"/>`).join("")}`,
    medal: medal(C.red),
    starMedal: medal(C.blue),
    moneyBag: `<path d="M9 3.8h6L13.5 7h-3z" fill="${C.gold}"/><path d="M10.5 7h3c3.5 2 6 5.5 6 8.5 0 3-2.5 5-7.5 5s-7.5-2-7.5-5c0-3 2.5-6.5 6-8.5z" fill="${C.gold}"/><path d="M14 11.5c-.6-.7-3.8-.9-4 .7-.2 1.8 4.2 1.1 4 3-.2 1.5-3.3 1.4-4 .6M12 10.2v7.6" fill="none" stroke-width="1.4"/>`,
    headphones: `<path d="M5 15v-3a7 7 0 0 1 14 0v3" fill="none" ${L(2.2)}/><rect x="3.5" y="13" width="4.5" height="7" rx="1.5" fill="${C.violet}"/><rect x="16" y="13" width="4.5" height="7" rx="1.5" fill="${C.violet}"/>`,
    greyHeart: heart(C.grey),
    pinkHeart: heart(C.pink),
    letterA: `${tile(C.red)}<path d="M8.5 17l3.5-10 3.5 10M9.8 13.5h4.4" fill="none" stroke="${C.cream}" stroke-width="2.2"/>`,
    numbers: `${tile(C.blue)}<path d="M10 7.5l-1 9M15 7.5l-1 9M7.5 10.5h9M7 14h9" stroke="${C.cream}" stroke-width="1.8"/>`,
    bank: `<rect x="4.5" y="9" width="15" height="10" fill="${C.cream}"/><path d="M3.5 9L12 4l8.5 5z" fill="${C.gold}"/><path d="M7.5 11v6M10.5 11v6M13.5 11v6M16.5 11v6" stroke-width="1.6"/><path d="M3.5 20h17" ${L(2)}/>`,
    cup: `<path d="M5 10h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${C.brown}"/><path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16" fill="none" ${L()}/><path d="M8.5 4.5c-.8 1 .8 2 0 3M12 4.5c-.8 1 .8 2 0 3" fill="none" stroke="${C.grey}"/>`,
    greenDot: disc(C.green),
    blueDot: disc(C.blue),
    darkMoon: disc("#6b6480"),
    twoCards: `<rect x="3.5" y="6" width="10" height="13" rx="2" fill="${C.cream}" transform="rotate(-10 8.5 12.5)"/><rect x="10.5" y="5" width="10" height="13" rx="2" fill="${C.pink}" transform="rotate(10 15.5 11.5)"/>`,
    stopwatch: `<circle cx="12" cy="13.5" r="7" fill="${C.cream}"/><path d="M12 13.5l3-3" fill="none" stroke-width="1.8"/><path d="M10 3.5h4M12 3.5v3M17.6 7.8l1.3-1.3" fill="none" ${L(1.8)}/>`,
    map: `<path d="M3.5 6.5l5-2 7 2 5-2v13l-5 2-7-2-5 2z" fill="${C.cream}"/><path d="M8.5 4.5v13M15.5 6.5v13"/><path d="M5.8 14.5c2-3 4-1 6-3s3.5-3 6-2" fill="none" stroke="${C.red}" stroke-dasharray="1.6 1.8"/>`,
    link: `<g transform="rotate(-35 12 12)">${[3, 11].map(x => `<rect x="${x}" y="9" width="10" height="6" rx="3" fill="none" stroke-width="4.2"/><rect x="${x}" y="9" width="10" height="6" rx="3" fill="none" stroke="${C.blue}" stroke-width="2.2"/>`).join("")}</g>`,
    flame: `<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-4 3.5-6 3.5-10 2.5 1.5 3.5 3.5 3.5 5.5 1-1 1.5-2 1.5-3.5 2.5 2 4.5 4.8 4.5 8 0 3.4-2.5 6-6.5 6z" fill="${C.orange}"/><path d="M12 21c-1.8 0-3-1.2-3-2.8 0-1.8 1.5-2.6 2-4.2 1.8 1 4 2.4 4 4.2 0 1.6-1.2 2.8-3 2.8z" fill="${C.gold}"/>`,
    cart: `<path d="M3 4.5h2.5l2 10h10l2-7H6.3" fill="none" ${L()}/><path d="M6.8 7.5h12.7l-2 7h-10z" fill="${C.gold}"/><circle cx="9" cy="19" r="1.6" fill="${LINE}"/><circle cx="16.5" cy="19" r="1.6" fill="${LINE}"/>`,
    clover: `<path d="M12.5 13.5l5 7.5" stroke="${C.green}" stroke-width="2.2"/>${[[9, 9], [15, 9], [9, 15], [15, 15]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${C.green}"/>`).join("")}`,
    flowerCard: card(C.pink, `<circle cx="12" cy="12" r="3.2" fill="${C.cream}"/>`),
    rewind: `<path d="M12 6v12l-8-6z" fill="${C.blue}"/><path d="M20 6v12l-8-6z" fill="${C.blue}"/>`,
    infinity: (() => {
      const d = "M12 12c-2-2.5-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.5 5.5-4s3.5-4 5.5-4a4 4 0 0 1 0 8c-2 0-3.5-1.5-5.5-4z";
      return `<path d="${d}" fill="none" stroke-width="4.4"/><path d="${d}" fill="none" stroke="${C.violet}" stroke-width="2.4"/>`;
    })(),
    spool: `<rect x="7.5" y="6.5" width="9" height="11" fill="${C.red}"/><path d="M7.5 9.5l9 2M7.5 12.5l9 2" stroke="${C.cream}"/><rect x="6" y="3.5" width="12" height="3" rx="1" fill="${C.brown}"/><rect x="6" y="17.5" width="12" height="3" rx="1" fill="${C.brown}"/>`,
    book: `<path d="M12 6.5C9.5 4.8 6.5 4.5 3.5 5v13c3-.5 6-.2 8.5 1.5 2.5-1.7 5.5-2 8.5-1.5V5c-3-.5-6-.2-8.5 1.5z" fill="${C.cream}"/><path d="M12 6.5v13"/>`,
    books: `<rect x="4" y="15" width="16" height="4.5" rx="1" fill="${C.blue}"/><rect x="5.5" y="10.5" width="13" height="4.5" rx="1" fill="${C.red}"/><rect x="7" y="6" width="10" height="4.5" rx="1" fill="${C.gold}"/>`,
    rainbow: `<path d="M3.5 17a8.5 8.5 0 0 1 17 0" fill="none" stroke="${C.red}" stroke-width="2.6"/><path d="M6.6 17a5.4 5.4 0 0 1 10.8 0" fill="none" stroke="${C.gold}" stroke-width="2.6"/><path d="M9.7 17a2.3 2.3 0 0 1 4.6 0" fill="none" stroke="${C.blue}" stroke-width="2.6"/>`,
    star: star(C.gold),
    penNib: `<path d="M12 3l5.5 8-5.5 10-5.5-10z" fill="${C.gold}"/><path d="M12 11v10"/><circle cx="12" cy="11" r="1.3" fill="${INK}"/>`,
    warning: `<path d="M12 3.5L21 19.5H3z" fill="${C.gold}"/><path d="M12 9.5v5" stroke-width="2.2"/><circle cx="12" cy="17" r="1.1" fill="${INK}" stroke="none"/>`,
    broom: `<path d="M17.5 3.5L12 12" stroke="${C.brown}" stroke-width="2.4"/><path d="M8.8 10.8l5 3-2.4 7-6.2-3.6z" fill="${C.gold}"/>`,
    gem: `<path d="M7 4h10l4 5-9 11L3 9z" fill="${C.blue}"/><path d="M3 9h18M9 4l-1.5 5L12 20l4.5-11L15 4" fill="none" stroke-width="1.2"/>`,
    clipboard: `<rect x="5" y="4.5" width="14" height="16.5" rx="2" fill="${C.brown}"/><rect x="7" y="7" width="10" height="12" rx="1" fill="${C.cream}"/><rect x="9" y="3" width="6" height="3" rx="1" fill="${C.grey}"/><path d="M9 11h6M9 14h6M9 17h4" stroke-width="1.3"/>`,
    magnifier,
    sunglasses: `<path d="M2.5 9.5h19" ${L()}/><path d="M4 9.5h6.5l-.5 4a2.5 2.5 0 0 1-2.5 2H6.5A2.5 2.5 0 0 1 4 13.5zM13.5 9.5H20v4a2.5 2.5 0 0 1-2.5 2h-1a2.5 2.5 0 0 1-2.5-2z" fill="#4a4060" ${L(1.2)}/><path d="M5.8 11.3l1.6 1.6M15.3 11.3l1.6 1.6" stroke="${C.blue}"/>`,
    hand,
    pin: `<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" fill="${C.red}"/><circle cx="12" cy="10" r="2.3" fill="${C.cream}"/>`,
    exclamation: `<path d="M10 3.5h4l-.8 11h-2.4z" fill="${C.red}"/><circle cx="12" cy="19" r="2" fill="${C.red}"/>`,
    toolbox: `<path d="M9 9V6.5h6V9" fill="none" ${L(2)}/><rect x="3.5" y="9" width="17" height="11" rx="1.5" fill="${C.red}"/><path d="M3.5 13.5h17"/><rect x="10.5" y="12.2" width="3" height="2.6" rx=".6" fill="${C.gold}"/>`,
    fog: `<path d="M4 8h12M6 12h14M4 16h11" stroke="${C.grey}" stroke-width="2.4"/>`,
    wind: `<path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h8" fill="none" stroke="${C.blue}" stroke-width="2.2"/>`,
    clapper: `<rect x="3.5" y="9" width="17" height="11" rx="1.5" fill="${C.grey}"/><path d="M3.5 9l16-3.5-.7-3L2.8 6z" fill="${C.cream}"/><path d="M7 5.2l2 3M11.5 4.2l2 3M16 3.2l2 3"/>`,
    trophy: `<path d="M7 6H4.5c0 3 1.2 4.5 3 4.8M17 6h2.5c0 3-1.2 4.5-3 4.8" fill="none" stroke="${C.gold}" stroke-width="1.8"/><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="${C.gold}"/><path d="M12 14v3" stroke="${C.gold}" stroke-width="2"/><rect x="8" y="17" width="8" height="3.5" rx="1" fill="${C.brown}"/>`,
    moon: `<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z" fill="${C.gold}"/>`,
    question: `<circle cx="12" cy="12" r="8.5" fill="${C.cream}"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7" fill="none" stroke-width="2"/><circle cx="12" cy="17" r="1.1" fill="${INK}" stroke="none"/>`,
    swords: `<path d="M5 4l10.5 10.5M19 4L8.5 14.5" stroke-width="4.2"/><path d="M5 4l10.5 10.5M19 4L8.5 14.5" stroke="${C.grey}" stroke-width="2.2"/><path d="M13 17l4.5-4.5M11 17l-4.5-4.5" stroke="${C.gold}" stroke-width="2.2"/><circle cx="18.5" cy="18.5" r="1.8" fill="${C.gold}"/><circle cx="5.5" cy="18.5" r="1.8" fill="${C.gold}"/>`,
    coin: `<circle cx="12" cy="12" r="8" fill="${C.gold}"/><circle cx="12" cy="12" r="5" fill="none" stroke="${C.brown}"/>`,
    chartDown: chart(`<path d="M6.5 8l4 4 3-2.5 4 5.5" fill="none" stroke="${C.red}" stroke-width="2.2"/>`),
    chartUp: chart(`<path d="M6.5 16l4-4 3 2.5 4-5.5" fill="none" stroke="${C.green}" stroke-width="2.2"/>`),
    barChart: chart(`<path d="M7 17v-5M12 17V7.5M17 17v-7.5" stroke="${C.blue}" stroke-width="2.6"/>`),
    lock: `<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" ${L(2.2)}/><rect x="5" y="10.5" width="14" height="10" rx="2" fill="${C.gold}"/><circle cx="12" cy="15.5" r="1.4" fill="${INK}"/>`,
    unlock: `<path d="M8 10.5V8a4 4 0 0 1 7.7-1.5" fill="none" ${L(2.2)}/><rect x="5" y="10.5" width="14" height="10" rx="2" fill="${C.gold}"/><circle cx="12" cy="15.5" r="1.4" fill="${INK}"/>`,
    check: `${tile(C.green)}<path d="M8 12.5l3 3 5.5-6.5" fill="none" stroke="${C.cream}" stroke-width="2.4"/>`,
    scales: `<path d="M12 4v15M7 20h10M4.5 7h15" ${L(1.8)}/><path d="M2.5 13h5l-2.5-6zM16.5 13h5l-2.5-6z" fill="none" ${L(1.1)}/><path d="M2.5 13a2.5 2.5 0 0 0 5 0zM16.5 13a2.5 2.5 0 0 0 5 0z" fill="${C.gold}"/>`,
    twoPeople: `<circle cx="8.5" cy="7.5" r="2.8" fill="${C.pink}"/><circle cx="15.5" cy="7.5" r="2.8" fill="${C.pink}"/><path d="M3.5 19.5c0-4 2.2-6.5 5-6.5s5 2.5 5 6.5zM10.5 19.5c0-4 2.2-6.5 5-6.5s5 2.5 5 6.5z" fill="${C.pink}"/>`,
    note: `<path d="M9 17.5V5.5l10-2v12" fill="none" ${L(2)}/><circle cx="7" cy="17.5" r="2.5" fill="${C.violet}"/><circle cx="17" cy="15.5" r="2.5" fill="${C.violet}"/>`,
    zany: face(`<circle cx="8.8" cy="10" r="2.2" fill="${C.cream}"/><circle cx="8.8" cy="10" r=".9" fill="${INK}"/><circle cx="15.3" cy="9.5" r="1" fill="${INK}"/><path d="M8 14.5c2 2 6 2 8 0" fill="none"/><path d="M12.5 15.8c0 2 2.5 2 2.5 0" fill="${C.pink}"/>`),
    seeNoEvil: face(`<rect x="5" y="8.2" width="14" height="4" rx="2" fill="${C.brown}"/><path d="M9 16c1.8 1.2 4.2 1.2 6 0" fill="none"/>`),
    liar: face(`<circle cx="9" cy="10" r="1" fill="${INK}"/><circle cx="14" cy="10" r="1" fill="${INK}"/><path d="M13.5 13h8" stroke-width="2.2"/><path d="M8.5 16c1.5 1 3 1 4.5 0" fill="none"/>`),
    blankFace: `<circle cx="12" cy="12" r="8.5" fill="none" ${L()} stroke-dasharray="2.2 2"/><circle cx="9" cy="10.5" r="1" fill="${LINE}" stroke="none"/><circle cx="15" cy="10.5" r="1" fill="${LINE}" stroke="none"/>`,
    glove: `<path d="M6 11c0-4 2.5-6.5 6.5-6.5S19 7 19 11.5c0 3-1.5 4.5-3 5.5v3H8.5v-3C7 16 6 14 6 11z" fill="${C.red}"/><path d="M8.5 17h7.5M6.2 10.5c1.8 0 3 1 3.5 2.5" fill="none"/>`,
    runner: `<circle cx="14" cy="5" r="2" fill="${C.blue}"/><path d="M13 8l-3 4 3 2.5-1.5 5M10 12l-3.5-.5M13 8l3.5 3 2.5-.5M11.5 14.5l-4 4.5" fill="none" stroke="${C.blue}" stroke-width="2.2"/>`,
    storm: `<path d="M7 15.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 8a3.8 3.8 0 0 1 .5 7.5z" fill="${C.grey}"/><path d="M12.5 13.5L10 18h3l-1.5 3.5" fill="none" stroke="${C.gold}" stroke-width="2"/>`,
    noEntry: `<circle cx="12" cy="12" r="8" fill="${C.cream}" stroke="${C.red}" stroke-width="2.6"/><path d="M6.5 6.5l11 11" stroke="${C.red}" stroke-width="2.6"/>`,
    puzzle: `<path d="M5 8h3.5a2 2 0 1 1 4 0H16v3.5a2 2 0 1 1 0 4V19H5z" fill="${C.green}"/>`,
    pretzel: `<path d="M6 17c-3-3-1.5-9 3-8.5 3 .3 3 4.5 3 4.5s0-4.2 3-4.5c4.5-.5 6 5.5 3 8.5M8 12.5l8 5M16 12.5l-8 5" fill="none" stroke="${C.brown}" stroke-width="2.4"/>`,
    exchange: `<circle cx="8.5" cy="9" r="4.5" fill="${C.gold}"/><circle cx="15.5" cy="15" r="4.5" fill="${C.green}"/><path d="M16 4.5h3.5V8M8 19.5H4.5V16" fill="none" ${L(1.8)}/>`,
    finishFlag: `<path d="M5 21V4" ${L(2)}/><rect x="5" y="4" width="14" height="9" fill="${C.cream}"/><path d="M5 4h3.5v3H5zM12 4h3.5v3H12zM8.5 7H12v3H8.5zM15.5 7H19v3h-3.5zM5 10h3.5v3H5zM12 10h3.5v3H12z" fill="${INK}" stroke="none"/>`,
    palette: `<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 1.8-1 1.3-2-.6-1.2.2-2.5 1.6-2.5h2a3.6 3.6 0 0 0 3.6-3.6C20.5 7.3 16.7 3.5 12 3.5z" fill="${C.cream}"/><circle cx="8" cy="10" r="1.5" fill="${C.red}"/><circle cx="12" cy="7.5" r="1.5" fill="${C.blue}"/><circle cx="16" cy="10" r="1.5" fill="${C.green}"/>`,
    scroll: `<rect x="6" y="4.5" width="12" height="15" rx="1" fill="${C.cream}"/><rect x="4" y="3" width="16" height="3" rx="1.5" fill="${C.brown}"/><rect x="4" y="18" width="16" height="3" rx="1.5" fill="${C.brown}"/><path d="M9 10h6M9 13h6" stroke-width="1.3"/>`,
    aceCard: card(C.cream, `<path d="M12 7.5c-2 2.2-4 3.6-4 5.5a2 2 0 0 0 3.5 1.3L11 17h2l-.5-2.7A2 2 0 0 0 16 13c0-1.9-2-3.3-4-5.5z" fill="${INK}"/>`),
    gear: `<path d="M12 2.8l1.6 2.3 2.7-.7.7 2.7 2.3 1.6-1.2 2.5 1.2 2.5-2.3 1.6-.7 2.7-2.7-.7L12 21.2l-1.6-2.3-2.7.7-.7-2.7-2.3-1.6 1.2-2.5L4.7 9.5 7 7.9l.7-2.7 2.7.7z" fill="${C.grey}"/><circle cx="12" cy="12" r="3" fill="${C.cream}"/>`,
    knot: `<path d="M3.5 16c3 0 5-8 8.5-8s3.5 4 0 4-3.5-4 0-4 5.5 8 8.5 8" fill="none" stroke-width="4.2"/><path d="M3.5 16c3 0 5-8 8.5-8s3.5 4 0 4-3.5-4 0-4 5.5 8 8.5 8" fill="none" stroke="${C.brown}" stroke-width="2.2"/>`,
    tree: `<path d="M12 14v7" stroke="${C.brown}" stroke-width="2.6"/><circle cx="12" cy="9.5" r="6.5" fill="${C.green}"/>`,
    upArrow: `${tile(C.blue)}<path d="M12 17V7.5M8 11l4-4 4 4" fill="none" stroke="${C.cream}" stroke-width="2.2"/>`,
    keyboard: `<rect x="2.5" y="7" width="19" height="11" rx="2" fill="${C.cream}"/>${[5.5, 8.5, 11.5, 14.5, 17.5].map(x => `<rect x="${x - 1}" y="9.5" width="2" height="2" rx=".4" fill="${INK}" stroke="none"/>`).join("")}<rect x="7" y="13.5" width="10" height="2" rx=".6" fill="${INK}" stroke="none"/>`,
    target: `<circle cx="12" cy="12" r="8.5" fill="${C.red}"/><circle cx="12" cy="12" r="5.2" fill="${C.cream}"/><circle cx="12" cy="12" r="2" fill="${C.red}"/>`,
    brain: `<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.5A3 3 0 0 0 7 18a3 3 0 0 0 5 1.5A3 3 0 0 0 17 18a3 3 0 0 0 2.5-5 3 3 0 0 0-1.5-5.5 3 3 0 0 0-3-3A3 3 0 0 0 12 5.5 3 3 0 0 0 9 4.5z" fill="${C.pink}"/><path d="M12 5.5v14" fill="none"/>`,
    ghost: `<path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6z" fill="${C.cream}"/><circle cx="9.5" cy="11" r="1.2" fill="${INK}"/><circle cx="14.5" cy="11" r="1.2" fill="${INK}"/>`,
    eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="${C.cream}"/><circle cx="12" cy="12" r="3.4" fill="${C.blue}"/><circle cx="12" cy="12" r="1.3" fill="${INK}"/>`,
    hammer: `<path d="M13 9l-8.5 8.5a1.8 1.8 0 0 0 2.5 2.5L15.5 11.5" fill="${C.brown}"/><path d="M11 4.5l3.5-1 6 6-1 3.5z" fill="${C.grey}"/>`,
    shield: `<path d="M12 3l7.5 3v5.5c0 4.8-3.3 8-7.5 9.5-4.2-1.5-7.5-4.7-7.5-9.5V6z" fill="${C.blue}"/><path d="M12 3v18" stroke="${C.cream}" stroke-width="1.2"/>`,
    key: `<path d="M12.5 12H21M17.5 12v3M20 12v2.5" fill="none" stroke="${C.gold}" stroke-width="2.4"/><circle cx="8" cy="12" r="4.5" fill="${C.gold}"/><circle cx="8" cy="12" r="1.6" fill="${C.cream}"/>`,
    clock: `<circle cx="12" cy="12" r="8.5" fill="${C.cream}"/><path d="M12 7v5l3.5 2" fill="none" stroke-width="1.8"/>`,
    wave: `<path d="M3 13c3-5 6 3 9-1s6 3 9-1" fill="none" stroke="${C.blue}" stroke-width="2.4"/><path d="M3 18c3-5 6 3 9-1s6 3 9-1" fill="none" stroke="${C.teal}" stroke-width="2.4"/>`,
    snowflake: `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" stroke="${C.blue}" stroke-width="2.2"/>`,
    sun: `<circle cx="12" cy="12" r="4.5" fill="${C.gold}"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="${C.gold}" stroke-width="2"/>`,
    cloud: `<path d="M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 10.5a3.8 3.8 0 0 1 .5 7.5z" fill="${C.cream}"/>`,
    rocket: `<path d="M12 3c3 2.5 4.5 6 4.5 10l-2 3h-5l-2-3c0-4 1.5-7.5 4.5-10z" fill="${C.cream}"/><circle cx="12" cy="10" r="1.8" fill="${C.blue}"/><path d="M9.5 16l-2 4 3-1.5M14.5 16l2 4-3-1.5" fill="${C.red}"/>`,
    paw: `<ellipse cx="12" cy="15.5" rx="4.5" ry="3.8" fill="${C.brown}"/>${[[6.5, 10.5], [9.5, 6.8], [14.5, 6.8], [17.5, 10.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${C.brown}"/>`).join("")}`,
    cat: `<path d="M5 20v-8l-1-7 4.5 3.5h7L20 5l-1 7v8z" fill="${C.orange}"/><circle cx="9.5" cy="13" r="1" fill="${INK}"/><circle cx="14.5" cy="13" r="1" fill="${INK}"/><path d="M11 16h2" />`,
    dollar: `<circle cx="12" cy="12" r="8.5" fill="${C.gold}"/><path d="M14.5 9c-.8-1-5-1.2-5.2.9-.2 2.3 5.4 1.4 5.2 3.9-.2 2-4.3 1.8-5.2.8M12 6.5v11" fill="none" stroke-width="1.6"/>`,
    plus: `${tile(C.green)}<path d="M12 7.5v9M7.5 12h9" stroke="${C.cream}" stroke-width="2.4"/>`,
    minus: `${tile(C.red)}<path d="M7.5 12h9" stroke="${C.cream}" stroke-width="2.4"/>`
  };

  // -- which emoji maps to which drawing ----------------------------------------
  const EMOJI = {
    "🃏": "joker", "✨": "sparkles", "🔮": "crystalBall", "🟩": "greenTile", "🟨": "yellowTile",
    "⬛": "greyTile", "⬜": "greyTile", "🟫": "greyTile", "🧭": "compass", "✂": "scissors", "⚡": "bolt",
    "⏳": "hourglass", "⌛": "hourglass", "💡": "bulb", "🔄": "refresh", "🔃": "refresh", "🔁": "repeat",
    "🔂": "repeat", "♻": "recycle", "🎁": "gift", "💀": "skull", "☠": "crossbones", "🎲": "die",
    "🏅": "medal", "🎖": "starMedal", "💰": "moneyBag", "💸": "moneyBag", "🎧": "headphones",
    "🩶": "greyHeart", "🫶": "pinkHeart", "❤": "pinkHeart", "💖": "pinkHeart", "💗": "pinkHeart",
    "🅰": "letterA", "🔤": "letterA", "🔠": "letterA", "🔡": "letterA", "🔢": "numbers", "🏦": "bank",
    "☕": "cup", "🟢": "greenDot", "🔵": "blueDot", "🌑": "darkMoon", "✌": "twoCards",
    "⏱": "stopwatch", "⏲": "stopwatch", "🗺": "map", "🔗": "link", "🔥": "flame", "🛒": "cart",
    "🍀": "clover", "🎴": "flowerCard", "⏪": "rewind", "♾": "infinity", "🧵": "spool", "📖": "book",
    "📚": "books", "📘": "book", "🌈": "rainbow", "🌟": "star", "⭐": "star", "💫": "sparkles",
    "🖋": "penNib", "✒": "penNib", "✍": "penNib", "⚠": "warning", "🧹": "broom", "💎": "gem",
    "📋": "clipboard", "📝": "clipboard", "🔎": "magnifier", "🔍": "magnifier", "🕶": "sunglasses",
    "✋": "hand", "🖐": "hand", "👋": "hand", "📍": "pin", "📌": "pin", "❗": "exclamation",
    "❕": "exclamation", "‼": "exclamation", "🧰": "toolbox", "🌫": "fog", "🌬": "wind",
    "🎬": "clapper", "🏆": "trophy", "🌙": "moon", "❔": "question", "❓": "question",
    "⚔": "swords", "🪙": "coin", "📉": "chartDown", "📈": "chartUp", "📊": "barChart",
    "🔒": "lock", "🔐": "lock", "🔓": "unlock", "✅": "check", "☑": "check", "✔": "check",
    "⚖": "scales", "👯": "twoPeople", "👥": "twoPeople", "🎵": "note", "🎶": "note", "🎼": "note",
    "🤪": "zany", "🙈": "seeNoEvil", "🤥": "liar", "🫥": "blankFace", "🥊": "glove", "🏃": "runner",
    "⛈": "storm", "🌩": "storm", "🚫": "noEntry", "⛔": "noEntry", "❌": "noEntry", "🧩": "puzzle",
    "🥨": "pretzel", "💱": "exchange", "🏁": "finishFlag", "🎨": "palette", "📜": "scroll",
    "🂡": "aceCard", "⚙": "gear", "🪢": "knot", "🌳": "tree", "🌲": "tree", "⬆": "upArrow",
    "⌨": "keyboard", "🎯": "target", "🧠": "brain", "👻": "ghost", "👁": "eye", "👀": "eye",
    "🔨": "hammer", "🛠": "hammer", "🛡": "shield", "🔑": "key", "🗝": "key", "🕐": "clock",
    "⏰": "clock", "🌊": "wave", "❄": "snowflake", "☀": "sun", "☁": "cloud", "🚀": "rocket",
    "🐾": "paw", "🐱": "cat", "🐈": "cat", "💵": "dollar", "💲": "dollar", "➕": "plus", "➖": "minus",
    "🎉": "sparkles", "🎊": "sparkles", "🪄": "sparkles", "🌀": "refresh", "🟥": "minus", "🟦": "blueDot"
  };

  // Symbols that are typography, not emoji: arrows, the Joker tile's star,
  // ticks and crosses already drawn in the page's own font.
  const KEEP = new Set(["©", "®", "™", "↔", "↕", "↖", "↗", "↘", "↙", "↩", "↪", "▪", "▫", "▶", "◀", "◻", "◼", "◽", "◾", "〰", "〽", "㊗", "㊙", "ℹ", "Ⓜ"]);
  const PATTERN = /\p{Extended_Pictographic}(?:️|⃣|[\u{1F3FB}-\u{1F3FF}]|‍\p{Extended_Pictographic}️?)*/gu;
  const STRIP_VARIANTS = /[️⃣‍]|[\u{1F3FB}-\u{1F3FF}]/gu;

  const warned = new Set();
  function drawingFor(emoji) {
    const base = String(emoji || "").replace(STRIP_VARIANTS, "");
    const name = EMOJI[base] || EMOJI[Array.from(base)[0]];
    if (name) return name;
    if (!warned.has(base)) {
      warned.add(base);
      console.warn(`Cuddle Icons: no drawing for ${base} (U+${(base.codePointAt(0) || 0).toString(16).toUpperCase()}); showing a sparkle.`);
    }
    return "sparkles";
  }

  const SVG_ATTRS = `viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;

  // An <svg> string for HTML contexts.
  function svg(emojiOrName, className = "") {
    const name = DRAWINGS[emojiOrName] ? emojiOrName : drawingFor(emojiOrName);
    return `<svg class="umt-ico-svg${className ? ` ${className}` : ""}" ${SVG_ATTRS} aria-hidden="true" focusable="false" data-icon="${name}">${DRAWINGS[name]}</svg>`;
  }

  // For drawing inside an existing SVG: a nested <svg> of `size`, centred
  // on (x, y).
  function markup(emojiOrName, size = 24, x = 0, y = 0) {
    const name = DRAWINGS[emojiOrName] ? emojiOrName : drawingFor(emojiOrName);
    const half = size / 2;
    return `<svg class="umt-ico-svg" x="${(x - half).toFixed(1)}" y="${(y - half).toFixed(1)}" width="${size}" height="${size}" ${SVG_ATTRS} data-icon="${name}">${DRAWINGS[name]}</svg>`;
  }

  function isEmoji(match) {
    const base = match.replace(STRIP_VARIANTS, "");
    return base && !KEEP.has(base);
  }

  function hasEmoji(text) {
    PATTERN.lastIndex = 0;
    let match;
    while ((match = PATTERN.exec(text))) if (isEmoji(match[0])) return true;
    return false;
  }

  function stripEmoji(text) {
    return String(text).replace(PATTERN, match => (isEmoji(match) ? "" : match)).replace(/\s{2,}/g, " ").trim();
  }

  // -- the pass over rendered screens -------------------------------------------
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "TITLE", "NOSCRIPT"]);

  function replaceHtmlText(node) {
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let last = 0;
    PATTERN.lastIndex = 0;
    let match;
    let changed = false;
    while ((match = PATTERN.exec(text))) {
      if (!isEmoji(match[0])) continue;
      if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      const span = document.createElement("span");
      span.className = "umt-ico";
      span.innerHTML = svg(match[0]);
      fragment.appendChild(span);
      last = match.index + match[0].length;
      changed = true;
    }
    if (!changed) return;
    if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(fragment, node);
  }

  // An emoji drawn as SVG <text> (a map or tree glyph) becomes a nested
  // <svg> of the same size in the same spot; emoji mixed into longer SVG
  // text is just dropped.
  function replaceSvgText(node) {
    const element = node.parentNode;
    const text = node.data;
    const only = text.trim();
    PATTERN.lastIndex = 0;
    const match = PATTERN.exec(only);
    if (element.localName === "text" && match && match[0] === only && isEmoji(only)) {
      const style = window.getComputedStyle(element);
      const fontSize = parseFloat(element.getAttribute("font-size")) || parseFloat(style.fontSize) || 16;
      const size = fontSize * 1.15;
      const x = parseFloat(element.getAttribute("x")) || 0;
      const y = parseFloat(element.getAttribute("y")) || 0;
      const holder = document.createElementNS(SVG_NS, "g");
      holder.setAttribute("class", `${element.getAttribute("class") || ""} umt-ico-g`.trim());
      holder.innerHTML = markup(only, size, x, y);
      element.parentNode.replaceChild(holder, element);
      return;
    }
    const cleaned = stripEmoji(text);
    if (cleaned !== text.trim()) node.data = cleaned;
  }

  function cleanAttributes(root) {
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll("[title], [aria-label], [placeholder], [alt]")] : [];
    elements.forEach(element => {
      ["title", "aria-label", "placeholder", "alt"].forEach(name => {
        const value = element.getAttribute && element.getAttribute(name);
        if (value && hasEmoji(value)) element.setAttribute(name, stripEmoji(value));
      });
    });
  }

  function sweep(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      if (root.parentNode && hasEmoji(root.data)) handleText(root);
      return;
    }
    if (root.nodeType !== 1 || SKIP_TAGS.has(root.tagName)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentNode;
        if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest?.(".umt-ico, [contenteditable]")) return NodeFilter.FILTER_REJECT;
        return hasEmoji(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const found = [];
    while (walker.nextNode()) found.push(walker.currentNode);
    found.forEach(handleText);
    cleanAttributes(root);
  }

  function handleText(node) {
    if (!node.parentNode) return;
    if (node.parentNode.namespaceURI === SVG_NS) replaceSvgText(node);
    else replaceHtmlText(node);
  }

  function cuddleActive() {
    const screen = document.getElementById("cuddleScreen");
    return Boolean(screen && screen.classList.contains("active"));
  }

  // Inside the Cuddle screen always; anywhere outside the other screens
  // (overlays hung on <body>) only while Cuddle is the screen showing.
  function inScope(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element) return false;
    if (element.closest("#cuddleScreen")) return true;
    return cuddleActive() && !element.closest(".screen");
  }

  let observer = null;
  function install() {
    if (observer || !document.body) return;
    sweep(document.getElementById("cuddleScreen"));
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "characterData") {
          if (inScope(record.target)) sweep(record.target);
          continue;
        }
        if (record.type === "attributes") {
          if (inScope(record.target)) cleanAttributes(record.target);
          continue;
        }
        record.addedNodes.forEach(node => { if (node.isConnected && inScope(node)) sweep(node); });
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["title", "aria-label"]
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.CuddleIcons = Object.freeze({
    svg,
    markup,
    names: Object.keys(DRAWINGS),
    emoji: Object.keys(EMOJI),
    hasEmoji,
    stripEmoji,
    sweep
  });
}());
