// /public/ui/constraints.js — NON-MODULE VERSION

window.getPattern = function (state, isSetterView) {
  let res = ["-", "-", "-", "-", "-"];

  if (!state || !state.history || !state.history.length) {
    return res.join("");
  }

  for (const h of state.history) {
    const fbArray = isSetterView ? h.fb : h.fbGuesser;
    if (!fbArray) continue;

    for (let i = 0; i < 5; i++) {
      if (fbArray[i] === "🟩") {
        res[i] = h.guess[i].toUpperCase();
      }
    }
  }

  return res.join("");
};

window.getMustContainLetters = function (state) {
  const s = new Set();
  if (!state || !state.history || !state.history.length) return [];

  for (const h of state.history) {
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩" || h.fb[i] === "🟨") {
        s.add(h.guess[i].toUpperCase());
      }
    }
  }
  return Array.from(s);
};

window.formatPattern = function (pattern) {
  return pattern.split("").join(" ");
};
