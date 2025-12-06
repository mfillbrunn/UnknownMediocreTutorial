// constraints.js — NON-MODULE VERSION

window.getPattern = function(state, isSetter) {
  if (!state.history || state.history.length === 0) {
    return ["-","-","-","-","-"];
  }

  // Start empty
  const pattern = ["-","-","-","-","-"];

  // Use ONLY greens from history
  for (const h of state.history) {
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩") {
        pattern[i] = h.guess[i].toUpperCase();
      }
    }
  }

  return pattern;
};


window.getMustContainLetters = function(state) {
  if (!state.history) return [];

  // Track minimum required count for each letter
  const requiredCounts = {};
  
  // Track forbidden positions for each letter
  const forbiddenPositions = {};

  // Track greens to filter forbidden positions later
  const greenPositions = {};

  // 1. Collect information from history
  for (const h of state.history) {
    const guess = h.guess.toUpperCase();

    // First pass — identify green positions
    for (let i = 0; i < 5; i++) {
      if (h.fb[i] === "🟩") {
        const L = guess[i];
        greenPositions[L] = greenPositions[L] || new Set();
        greenPositions[L].add(i);
      }
    }

    // Second pass — collect yellows
    for (let i = 0; i < 5; i++) {
      const L = guess[i];
      if (h.fb[i] === "🟨") {
        requiredCounts[L] = (requiredCounts[L] || 0) + 1;

        forbiddenPositions[L] = forbiddenPositions[L] || new Set();
        forbiddenPositions[L].add(i);
      }
    }
  }

  // 2. Build display list
  const result = [];

  Object.keys(requiredCounts).forEach(letter => {
    const countNeeded = requiredCounts[letter];

    // Handle multiples
    let entry = letter;
    if ((greenPositions[letter]?.size || 0) >= countNeeded) {
        // Enough greens already satisfy requirement
        // BUT we might need "another O"
        const diff = countNeeded - (greenPositions[letter]?.size || 0);
        if (diff > 0) {
          entry = `${letter} (another ${letter})`;
        } else {
          // All occurrences accounted for — no need to list
          return;
        }
    }

    // Forbidden positions, filtered so we don’t list greens
    const forb = [...(forbiddenPositions[letter] || [])]
      .filter(pos => !(greenPositions[letter]?.has(pos)));

    if (forb.length > 0) {
      entry += ` (not ${forb.map(x => x+1).join(", ")})`;
    }

    result.push(entry);
  });

  return result;
};

