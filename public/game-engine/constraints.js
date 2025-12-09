// constraints.js — NON-MODULE VERSION

window.getPattern = function(state, isSetter) {
  if (!state.history || state.history.length === 0) {
    return ["-", "-", "-", "-", "-"];
  }

  const pattern = ["-", "-", "-", "-", "-"];

  // Pick the right feedback array depending on role
  const fbKey = isSetter ? "fb" : "fbGuesser";

  for (const h of state.history) {
    if (h.ignoreConstraints) continue;

    const fb = h[fbKey];

    // Skip invalid feedback entries
    if (!Array.isArray(fb) || fb.length !== 5) continue;

    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩") {
        pattern[i] = h.guess[i].toUpperCase();
      }
    }
  }

  return pattern;
};



window.getMustContainLetters = function(state, isSetter) {
  if (!state.history) return [];

  const fbKey = isSetter ? "fb" : "fbGuesser";

  const requiredCounts = {};
  const forbiddenPositions = {};
  const greenPositions = {};

  for (const h of state.history) {
    if (h.ignoreConstraints) continue;

    const fb = h[fbKey];
    if (!Array.isArray(fb) || fb.length !== 5) continue;

    const guess = h.guess.toUpperCase();

    // First pass — greens
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩") {
        const L = guess[i];
        greenPositions[L] = greenPositions[L] || new Set();
        greenPositions[L].add(i);
      }
    }

    // Second pass — yellows
    for (let i = 0; i < 5; i++) {
      const L = guess[i];
      if (fb[i] === "🟨") {
        requiredCounts[L] = (requiredCounts[L] || 0) + 1;
        forbiddenPositions[L] = forbiddenPositions[L] || new Set();
        forbiddenPositions[L].add(i);
      }
    }
  }

  // Build list
  const result = [];
  Object.keys(requiredCounts).forEach(letter => {
    const countNeeded = requiredCounts[letter];
    const greens = greenPositions[letter]?.size || 0;

    let entry = letter;

    if (greens >= countNeeded) {
      const diff = countNeeded - greens;
      if (diff > 0) entry = `${letter} (another ${letter})`;
      else return;
    }

    const forb = [...(forbiddenPositions[letter] || [])]
      .filter(pos => !(greenPositions[letter]?.has(pos)));
    if (forb.length > 0) {
      entry += ` (not ${forb.map(x => x + 1).join(", ")})`;
    }

    result.push(entry);
  });

  return result;
};


window.formatPattern = arr => arr.join(" ");
