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

  box.innerHTML = `
    <div class="line">
      <span class="label">Words</span>
      <span class="value">${boxState.current.toLocaleString()}</span>
    </div>
    <div class="line">
      <span class="label">Keep</span>
      <span class="value" style="${oldStyle}">
        ${boxState.old != null ? boxState.old.toLocaleString() : "?"}
      </span>
    </div>
    <div class="line">
      <span class="label">New</span>
      <span class="value" style="${newStyle}">
        ${
          boxState.isConsistent === false
            ? `<span class="inconsistent-x">✕</span>`
            : boxState.new != null
              ? boxState.new.toLocaleString()
              : "?"
        }
      </span>
    </div>
  `;
}
