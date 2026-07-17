// client/must-contain-box.js — Setter aid: a box listing the letters known
// to belong somewhere in the secret (from green/yellow feedback so far,
// state.constraintData.mustContain), so the setter can see at a glance what
// a new secret has to include. As they type a matching letter into their
// draft, that letter fades/shrinks out of the box — a running checklist of
// what's left to "slot in" (and grows back if they backspace it out).
function renderSetterMustContainBox(mustContain, draft) {
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

  // Only rebuild the chip DOM nodes when the underlying letter set actually
  // changes (new round, newly learned constraint) — this call fires on
  // every keystroke, and tearing down + recreating nodes each time would
  // kill the CSS transition (a brand-new node has no "before" state to
  // animate from). Existing nodes just get a class toggled instead.
  const signature = letters.join(",");
  if (box.__signature !== signature) {
    box.__signature = signature;
    box.innerHTML = `<span class="must-contain-label">Must include</span>`;
    box.__chips = {};
    for (const letter of letters) {
      const chip = document.createElement("span");
      chip.className = "must-contain-letter";
      chip.textContent = letter;
      box.appendChild(chip);
      box.__chips[letter] = chip;
    }
  }

  const draftLetters = new Set((draft || "").toUpperCase().split(""));
  for (const letter of letters) {
    box.__chips[letter]?.classList.toggle("satisfied", draftLetters.has(letter));
  }
}

window.renderSetterMustContainBox = renderSetterMustContainBox;
