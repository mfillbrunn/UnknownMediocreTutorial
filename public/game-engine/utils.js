// utils.js — NON-MODULE VERSION

window.formatGuess = function (g) {
  return g.toUpperCase();
};

window.formatList = function (arr) {
  return arr.length ? arr.join(", ") : "none";
};
