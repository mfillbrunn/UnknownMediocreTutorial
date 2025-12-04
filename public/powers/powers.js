// /public/powers/powers.js

export const SETTER_POWERS = {
  hideTile: {
    id: "hideTile",
    label: "Hide Tile",
    once: false
  },
  reuseLetters: {
    id: "reuseLetters",
    label: "Reuse Letters",
    once: true
  },
  confuseColors: {
    id: "confuseColors",
    label: "Blue Mode",
    once: true
  },
  countOnly: {
    id: "countOnly",
    label: "Count-Only",
    once: true
  }
};

export const GUESSER_POWERS = {
  revealGreen: {
    id: "revealGreen",
    label: "Reveal Green",
    once: true
  },
  freezeSecret: {
    id: "freezeSecret",
    label: "Freeze Secret",
    once: true
  }
};
