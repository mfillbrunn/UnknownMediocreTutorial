window.renderHistory = function (state, container, role) {
  container.innerHTML = "";

  const history = state?.history;
  if (!Array.isArray(history) || history.length === 0) {
    container.textContent = "";
  }

  for (const entry of history || []) {
    if (!entry || !entry.guess) continue;

    const safeEntry = JSON.parse(JSON.stringify(entry));
    PowerEngine.applyHistoryEffects(safeEntry, isSetter);

    let fbArray;
    const isSetter = role === "setter";
    if (!isSetter && Array.isArray(safeEntry.fbGuesser)) {
      fbArray = safeEntry.fbGuesser;
    } else if (Array.isArray(safeEntry.fb)) {
      fbArray = safeEntry.fb;
    } else {
      fbArray = ["⬛","⬛","⬛","⬛","⬛"];
    }

    if (!Array.isArray(fbArray) || fbArray.length < 5) continue;

    const row = document.createElement("div");
    row.className = "history-row";

    const guess = safeEntry.guess.toUpperCase();

    for (let i = 0; i < 5; i++) {
      const tile = document.createElement("div");
      tile.className = "history-tile";

      tile.textContent = guess[i];

      const fb = fbArray[i];
      if (fb === "🟩") tile.classList.add("tile-green");
      else if (fb === "🟨") tile.classList.add("tile-yellow");
      else if (fb === "🟦") tile.classList.add("tile-blue");
      else tile.classList.add("tile-gray");

      row.appendChild(tile);
    }

    if (safeEntry.extraInfo) {
      const { greens, yellows } = safeEntry.extraInfo;
      const extra = document.createElement("span");
      extra.className = "history-extra";
      extra.textContent = ` (${greens}🟩, ${yellows}🟨)`;
      row.appendChild(extra);
    }

    if (safeEntry.powerUsed) {
      const tag = document.createElement("span");
      tag.className = "history-power";
      tag.textContent = ` [${safeEntry.powerUsed}]`;
      row.appendChild(tag);
    }

    container.appendChild(row);
  }
// ------------------ DRAFT ROWS ------------------
const guesserDraft = (state.uiDraftGuesser || "").toUpperCase();
const setterDraft  = (state.uiDraftSetter  || "").toUpperCase();

// Guesser sees THEIR own draft
if (role === "guesser" && guesserDraft && !draftSubmitted) {
  renderDraftRow(guesserDraft, container, "draft-row");
}

// Setter sees guesser's draft (live, read-only)
if (role === "setter" && guesserDraft) {
  renderDraftRow(guesserDraft, container, "draft-row guesser-draft");
}

// Setter also sees THEIR OWN secret draft
if (role === "setter" && setterDraft) {
  renderDraftRow(setterDraft, container, "draft-row setter-draft");
}
};

function renderDraftRow(word, container, className) {
  const row = document.createElement("div");
  row.className = `history-row ${className}`;

  for (let i = 0; i < 5; i++) {
    const tile = document.createElement("div");
    tile.className = "history-tile draft-tile";
    tile.textContent = word[i] || "";
    row.appendChild(tile);
  }

  container.appendChild(row);
}
