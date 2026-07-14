function renderSetterRemainingBox(boxState) {
  const box = document.getElementById("SetterRemainingBox");
  if (!box) return;

  if (!boxState || !boxState.visible) {
    box.innerHTML = "";
    box.hidden = true;
    return;
  }

  box.hidden = false;

  const oldStyle = boxState.highlightOld ? "color: var(--tile-green)" : "";
  const newStyle = boxState.highlightNew ? "color: var(--tile-green)" : "";
  const current = boxState.current.toLocaleString();

  const guideOn = document.body.classList.contains("guide-on");
  const hint = guideOn
    ? `<div class="line remaining-hint">How many possible secrets would still fit the clues so far — if you keep this secret vs. switch to your typed word.</div>`
    : "";

  box.innerHTML = `
    <div class="line">
      <span class="label">Keep</span>
      <span class="value" style="${oldStyle}">
        ${current} → ${boxState.old != null ? boxState.old.toLocaleString() : "?"}
      </span>
    </div>
    <div class="line">
      <span class="label">New</span>
      <span class="value" style="${newStyle}">
        ${current} →
        ${
          boxState.isConsistent === false
            ? `<span class="inconsistent-x">✕</span>`
            : boxState.new != null
              ? boxState.new.toLocaleString()
              : "?"
        }
      </span>
    </div>
    ${hint}
  `;
}
