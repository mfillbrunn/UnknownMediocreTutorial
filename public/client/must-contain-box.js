// client/must-contain-box.js — Setter aid: a box listing the letters known
// to belong somewhere in the secret (from green/yellow feedback so far,
// state.constraintData.mustContain), so the setter can see at a glance what
// a new secret has to include. Letters confirmed to a specific position
// (green) render green; letters confirmed present but position-unknown
// (yellow) render yellow — the same color language as the tiles themselves.
// As the setter types a matching letter into their draft, that letter
// fades/shrinks out of the box — a running checklist of what's left to
// "slot in" (and grows back if they backspace it out).
function renderSetterMustContainBox(mustContain, draft, greenLetters) {
  const box = document.getElementById("SetterMustContainBox");
  if (!box) return;

  const letters = Array.isArray(mustContain) ? mustContain : [];
  if (!letters.length) {
    box.innerHTML = "";
    box.hidden = true;
    box.__signature = null;
    box.__chips = null;
    return;
  }

  box.hidden = false;

  const greenSet = greenLetters instanceof Set ? greenLetters : new Set(greenLetters || []);

  // Only rebuild the chip DOM nodes when the underlying letter set (or its
  // green/yellow coloring) actually changes — this call fires on every
  // keystroke, and tearing down + recreating nodes each time would kill the
  // CSS transition (a brand-new node has no "before" state to animate
  // from). Existing nodes just get a class toggled instead.
  const signature = letters.map(l => `${l}:${greenSet.has(l) ? "g" : "y"}`).join(",");
  const guideOn = document.body.classList.contains("guide-on");

  if (box.__signature !== signature) {
    box.__signature = signature;
    const hint = guideOn
      ? `<div class="must-contain-hint">Green = confirmed position &middot; Yellow = confirmed present, position unknown</div>`
      : "";
    box.innerHTML = `<span class="must-contain-label">Must include</span>${hint}`;
    box.__chips = {};
    for (const letter of letters) {
      const chip = document.createElement("span");
      chip.className = `must-contain-letter ${greenSet.has(letter) ? "mc-green" : "mc-yellow"}`;
      chip.textContent = letter;
      box.appendChild(chip);
      box.__chips[letter] = chip;
    }
  } else {
    // Guide mode can toggle without the letter set changing — keep the
    // hint line in sync without rebuilding the (animated) chips.
    const existingHint = box.querySelector(".must-contain-hint");
    if (guideOn && !existingHint) {
      const hint = document.createElement("div");
      hint.className = "must-contain-hint";
      hint.innerHTML = "Green = confirmed position &middot; Yellow = confirmed present, position unknown";
      box.insertBefore(hint, box.querySelector(".must-contain-letter"));
    } else if (!guideOn && existingHint) {
      existingHint.remove();
    }
  }

  const draftLetters = new Set((draft || "").toUpperCase().split(""));
  for (const letter of letters) {
    box.__chips[letter]?.classList.toggle("satisfied", draftLetters.has(letter));
  }
}

window.renderSetterMustContainBox = renderSetterMustContainBox;
