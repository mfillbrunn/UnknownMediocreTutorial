// constraints.js — NON-MODULE VERSION

window.getPattern = function (state, isSetterView) {
  const pattern = ["-", "-", "-", "-", "-"];
  if (!state?.history?.length) return pattern.join("");

  for (const h of state.history) {
    const fbArr = isSetterView ? h.fb : h.fbGuesser;
    if (!fbArr) continue;

    for (let i = 0; i < 5; i++) {
      if (fbArr[i] === "🟩") {
        pattern[i] = h.guess[i].toUpperCase();
      }
    }
  }
  return pattern.join("");
};

window.getMustContainLetters = function (state) {
  const set = new Set();
  if (!state?.history?.length) return [];

  for (const h of state.history) {
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩" || h.fb[i] === "🟨") {
        set.add(h.guess[i].toUpperCase());
      }
    }
  }
  return [...set];
};

window.formatPattern = function (patternString) {
  return patternString.split("").join(" ");
};
