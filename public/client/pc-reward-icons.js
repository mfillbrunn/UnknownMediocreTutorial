(() => {
  "use strict";

  // Simple, consistent line-icon set (24x24, stroke-based, currentColor) for
  // the reward-choice cards -- swaps out the emoji glyphs that used to sit in
  // .pc-card-icon, which rendered inconsistently across platforms/fonts and
  // read as blurry/low-detail at the card's small icon size. Keyed by power
  // id (for power rewards) and by the fixed-option id from
  // powerChoiceServer.js's fixedOptions() (for the non-power reward cards).
  const S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  const svg = inner => `<svg viewBox="0 0 24 24" ${S}>${inner}</svg>`;

  const POWER_ICONS = {
    confuseColors: svg(`<circle cx="9" cy="9" r="5.4"/><circle cx="15" cy="15" r="5.4"/>`),
    betMiss: svg(`<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/>`),
    spyChargeReset: svg(`<path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 12V6.5"/><path d="M4 12h5.5"/>`),
    fieldReport: svg(`<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9 4.5V3.6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.9"/><path d="M9 11h6"/><path d="M9 14.5h6"/><path d="M9 18h3.5"/>`),
    fakeFeedback: svg(`<path d="M4.5 9c1.4-2.2 4.2-3.5 7.5-3.5s6.1 1.3 7.5 3.5c-1.4 2.2-4.2 3.5-7.5 3.5S5.9 11.2 4.5 9z"/><circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1" fill="currentColor" stroke="none"/><path d="M6 16.5l3-2M18 16.5l-3-2M12 17.5v-3"/>`),
    countOnly: svg(`<path d="M6 5v14M9.5 5v14M13 5v14M16.5 5v14"/><path d="M4.5 15.5l14.5-8"/>`),
    rouletteSecret: svg(`<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M12 4.5v3M12 16.5v3M19.5 12h-3M7.5 12h-3M17.3 6.7l-2.1 2.1M8.8 15.1l-2.1 2.1M17.3 17.3l-2.1-2.1M8.8 8.9L6.7 6.7"/>`),
    nonsense: svg(`<path d="M4 6h4l9 12h3"/><path d="M4 18h4l2.3-3.1"/><path d="M14.6 8.9L17 6h3"/><path d="M17.5 4.2L20 6l-2.5 1.8M17.5 19.8L20 18l-2.5-1.8"/>`),
    forceGuess: svg(`<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/>`),
    forceTimer: svg(`<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5v3.2c0 2 1.6 3.6 4 5.3 2.4-1.7 4-3.3 4-5.3V3.5"/><path d="M8 20.5v-3.2c0-2 1.6-3.6 4-5.3 2.4 1.7 4 3.3 4 5.3v3.2"/>`),
    freezeSecret: svg(`<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/><path d="M12 3l-1.8 1.8M12 3l1.8 1.8M12 21l-1.8-1.8M12 21l1.8-1.8M4.5 7.5l.6 2.5M4.5 7.5l2.5-.6M19.5 7.5l-2.5-.6M19.5 7.5l-.6 2.5M4.5 16.5l2.5.6M4.5 16.5l.6-2.5M19.5 16.5l-.6-2.5M19.5 16.5l-2.5.6"/>`),
    hideTile: svg(`<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><path d="M6 6l12 12"/>`),
    magicMode: svg(`<path d="M5 19L17 7"/><path d="M17 7l2-2"/><path d="M19 3.3v2M19 7.7v2M15.8 5.5h2M20.2 5.5h2"/><path d="M6.5 15.5v1.6M6.5 19.7v1.6M4.7 17.6h1.6M8.9 17.6h1.6"/>`),
    revealGreen: svg(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`),
    revealHistory: svg(`<path d="M13 5l-7 7 7 7"/><path d="M20 5l-7 7 7 7"/>`),
    revealLetter: svg(`<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>`),
    stealthGuess: svg(`<path d="M6 19.5V11a6 6 0 0 1 12 0v8.5"/><path d="M6 19.5l1.6-1.6 1.6 1.6 1.6-1.6 1.6 1.6 1.6-1.6 1.6 1.6"/><circle cx="9.5" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="14.5" cy="11" r=".9" fill="currentColor" stroke="none"/>`),
    suggestGuess: svg(`<path d="M9 18.5h6"/><path d="M9.5 21h5"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9v.7h5v-.7c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3z"/>`),
    suggestSecret: svg(`<path d="M9 4.5a3 3 0 0 0-3 3v.4A3 3 0 0 0 4.5 11a3 3 0 0 0 1.6 5.4A3.2 3.2 0 0 0 9 19.5a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3z"/><path d="M15 4.5a3 3 0 0 1 3 3v.4a3 3 0 0 1 1.5 3.1 3 3 0 0 1-1.6 5.4A3.2 3.2 0 0 1 15 19.5a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z"/>`),
    vowelRefresh: svg(`<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v4.5h-4.5"/><path d="M9 15.5l3-7 3 7M9.9 13h4.2"/>`),
    blindSpot: svg(`<path d="M4 8.5h16M4 12h16M4 15.5h11"/>`),
    revealPenalty: svg(`<path d="M12 3.5L2.5 20.5h19L12 3.5z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>`),
    assassinWord: svg(`<path d="M12 4a6.5 6.5 0 0 0-6.5 6.5c0 3 1.7 4.5 2.5 5.5v2a1 1 0 0 0 1 1h1.5v-2h1v2h1v-2h1v2H16a1 1 0 0 0 1-1v-2c.8-1 2.5-2.5 2.5-5.5A6.5 6.5 0 0 0 12 4z"/><path d="M9 10.5l1.6 1.6M10.6 10.5L9 12.1M13.4 10.5L15 12.1M15 10.5l-1.6 1.6"/>`),
    blindGuess: svg(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M3 4.5l18 15"/>`),
    wiretap: svg(`<path d="M5 13v-1a7 7 0 0 1 14 0v1"/><rect x="3.5" y="13" width="3.4" height="6" rx="1.4"/><rect x="17.1" y="13" width="3.4" height="6" rx="1.4"/>`),
    letterProbe: svg(`<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M12 3.5v2.4M12 18.1v2.4"/>`),
    revealLocation: svg(`<path d="M9.5 3.5h5l1 4-1.6 1.4H10.1L8.5 7.5z"/><path d="M10.1 8.9L8 20.5h8l-2.1-11.6"/><path d="M12 12v5"/>`),
    doubleGuess: svg(`<circle cx="9.5" cy="9.5" r="5.5"/><circle cx="14.5" cy="14.5" r="5.5"/>`),
    letterProfile: svg(`<path d="M4 20V9M10 20V4M16 20v-7M20 20v-3"/><path d="M2.5 20.5h19"/>`),
    delayedIntel: svg(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2.5h6"/>`),
    letterLockout: svg(`<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/><path d="M9 16V8.5h3.5a2.5 2.5 0 0 1 0 5H9"/>`)
  };

  const FIXED_ICONS = {
    "spy-reset-positive-1": svg(`<path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 12V6.5M4 12h5.5"/>`),
    "spy-reset-known-2": svg(`<path d="M6 12a6 6 0 1 1 2 4.5"/><path d="M6 12V7.5M6 12h4.5"/><path d="M13 17.5a6 6 0 1 0 2-11"/>`),
    "spy-add-point-1": svg(`<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>`),
    "spy-reset-positive-2": svg(`<path d="M6 12a6 6 0 1 1 2 4.5"/><path d="M6 12V7.5M6 12h4.5"/><path d="M13 17.5a6 6 0 1 0 2-11"/>`),
    "spy-reset-vowels": svg(`<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="8" cy="16" r="3"/><circle cx="16" cy="16" r="3"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`),
    "spy-add-point-2": svg(`<circle cx="9" cy="12" r="6.5"/><circle cx="17" cy="12" r="6.5"/><path d="M9 9v6M6 12h6M17 9v6M14 12h6"/>`),
    "inspector-yellow-1": svg(`<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M8 12.5l2.5 2.5L16.5 9"/>`),
    "inspector-remove-unused-2": svg(`<rect x="3" y="6" width="8" height="8" rx="1.5"/><rect x="13" y="10" width="8" height="8" rx="1.5"/><path d="M4.5 7.5l5 5M9.5 7.5l-5 5M14.5 11.5l5 5M19.5 11.5l-5 5"/>`),
    "inspector-remove-point-1": svg(`<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>`),
    "inspector-green-1": svg(`<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>`),
    "inspector-yellow-to-green-2": svg(`<rect x="2.5" y="8" width="7" height="7" rx="1.6"/><path d="M12.5 11.5h7"/><path d="M17 8.5l3 3-3 3"/><rect x="14.5" y="8" width="7" height="7" rx="1.6" transform="translate(0 8)"/>`),
    "inspector-remove-point-2": svg(`<circle cx="9" cy="12" r="6.5"/><circle cx="17" cy="12" r="6.5"/><path d="M6 12h6M14 12h6"/>`)
  };

  window.PC_REWARD_ICONS = { power: POWER_ICONS, fixed: FIXED_ICONS };
})();
