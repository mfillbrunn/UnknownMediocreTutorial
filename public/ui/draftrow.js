window.renderDraftRows = function ({
  state,
  role,
  container,
  localGuesserDraft = ""
}) {
  if (!container) return;

  // ----------------------------
  // Build rows ONCE
  // ----------------------------
  if (!container.__draftRows) {
    container.innerHTML = "";
    container.__draftRows = {};

    function makeRow() {
      const row = document.createElement("div");
      row.className = "history-row draft-row";
      row.__tiles = [];
      for (let i = 0; i < 5; i++) {
        const tile = document.createElement("div");
        tile.className = "history-tile draft-tile";
        row.__tiles.push(tile);
        row.appendChild(tile);
      }
      return row;
    }

    container.__draftRows.pending = makeRow();
    container.__draftRows.draft = makeRow();

    // Start hidden via an explicit style, not just "never shown" — the
    // wasVisible check below reads style.display, and an unset "" reads as
    // visible, which skipped the entrance animation on a row's very first
    // appearance in a fresh game.
    container.__draftRows.pending.style.display = "none";
    container.__draftRows.draft.style.display = "none";

    container.appendChild(container.__draftRows.pending);
    container.appendChild(container.__draftRows.draft);
  }

  const pendingRow = container.__draftRows.pending;
  const draftRow = container.__draftRows.draft;

  // ----------------------------
  // Helpers
  // ----------------------------
  const upperPending = state.pendingGuess?.toUpperCase() || "";
  const upperSecret = state.secret?.toUpperCase() || "";
  const upperGuesserDraft = localGuesserDraft.toUpperCase();
  const upperSetterDraft = (state.setterDraft || "").toUpperCase();

  // Positions already confirmed green (from feedback so far, or a power's
  // GREEN extraConstraint) — same data the constraint row above already
  // shows. For the guesser's draft this is overlaid as a ghost letter in
  // the still-empty tile it belongs in. For the setter's own draft it
  // instead colors the actually-typed letter green once it matches — a
  // ghost there gets covered up (and thus loses all meaning) the moment
  // *any* letter is typed at that position, including a wrong one.
  const greenPattern = (state.constraintData?.grid || []).map(cell => cell?.green || null);

  function updateRow(row, word, className, ghostPattern, greenMatchPattern) {
    const frozen =
      state.turn === state.setter &&
      state.powers?.freezeActive;

    // Every keystroke while typing a guess/secret calls back into this via
    // updateUI(), re-running this render far more often than the row's own
    // entrance animation (340ms) takes to finish. Overwriting className
    // wholesale each time stripped the animation class mid-flight, so it
    // visually never got to play. Carry over any slide class already in
    // progress instead of dropping it.
    const inFlightAnim = ["row-slide-in", "row-slide-down"].filter(c =>
      row.classList.contains(c)
    );

    row.className = frozen
      ? "history-row draft-row freeze-draft"
      : `history-row ${className}`;

    if (!frozen && inFlightAnim.length) {
      row.classList.add(...inFlightAnim);
    }

    for (let i = 0; i < 5; i++) {
      const tile = row.__tiles[i];
      const real = word[i] || "";
      const ghost = !real && ghostPattern && ghostPattern[i];
      // classList.toggle's second arg must be a real boolean — passing
      // `undefined` (which `real && greenMatchPattern && ...` can produce
      // when greenMatchPattern is omitted, e.g. for the pending-guess row)
      // makes the browser treat it as "no force given" and flip the class
      // instead of forcing it off, letting tile-green-match flap on/off
      // across renders instead of staying reliably unset.
      const isGreenMatch = !!(real && greenMatchPattern && greenMatchPattern[i] === real);

      tile.textContent = real || ghost || "";
      tile.classList.toggle("tile-ghost-letter", !!ghost);
      tile.classList.toggle("tile-filled", !!real);
      tile.classList.toggle("tile-green-match", isGreenMatch);
    }
  }

  // Capture visibility BEFORE this render's "hide by default" reset below —
  // that reset and re-show happen within the same synchronous call, so
  // reading row.style.display *after* it would always report "just
  // hidden" and the transition-detection in showRow() would fire on every
  // render (e.g. every keystroke) instead of just genuine appearances.
  const pendingWasVisible = pendingRow.style.display !== "none";
  const draftWasVisible = draftRow.style.display !== "none";

  // Reveals a row, replaying `animClass` only on an actual hidden->visible
  // transition (per the wasVisible snapshot taken above this render).
  function showRow(row, wasVisible, animClass) {
    row.style.display = "";
    if (!wasVisible && animClass) {
      row.classList.remove(animClass);
      void row.offsetWidth; // restart animation
      row.classList.add(animClass);
    }
  }

  // Hide rows by default
  pendingRow.style.display = "none";
  draftRow.style.display = "none";

  // ============================
  // GUESSER
  // ============================
  if (role === "guesser") {
    const canGuess =
      (state.phase === "simultaneous" && !state.simultaneousGuessSubmitted) ||
      (state.phase === "normal" && state.turn === state.guesser);

    if (canGuess) {
      // Back to typing a fresh guess — re-arm the submit slide-out for the
      // next submission, and cancel any outro still parked on the row.
      container.__guesserSubmitSlideDone = false;
      draftRow.__slidingOut = false;
      // No green ghost letters on the guesser's side anymore — that hint
      // now lives only on the setter's own draft/secret overlay (below).
      updateRow(draftRow, upperGuesserDraft, "draft-row guesser-draft", null);
      showRow(draftRow, draftWasVisible, "row-slide-down");
      return;
    }

    if (upperPending) {
      // Just submitted — the guess "flies off" to the setter: slide the
      // row out to the right once, then it's gone from the draft area (it
      // returns as a scored row in history once the setter responds). The
      // guard makes the one-shot outro fire only on the actual submit
      // transition, not on every re-render while waiting.
      if (!container.__guesserSubmitSlideDone) {
        container.__guesserSubmitSlideDone = true;
        if (draftWasVisible) {
          updateRow(draftRow, upperPending, "draft-row guesser-draft");
          draftRow.classList.remove("row-slide-down", "row-slide-in");
          draftRow.style.display = "";
          draftRow.__slidingOut = true;
          void draftRow.offsetWidth; // restart from a clean state
          draftRow.classList.add("row-slide-out");
          draftRow.addEventListener(
            "animationend",
            function onOut() {
              draftRow.removeEventListener("animationend", onOut);
              // A new guess turn may have already reclaimed the row while
              // this outro was mid-flight — if so, leave it alone.
              if (!draftRow.__slidingOut) return;
              draftRow.__slidingOut = false;
              draftRow.classList.remove("row-slide-out");
              draftRow.style.display = "none";
              updateRow(draftRow, "", "draft-row guesser-draft");
            },
            { once: true }
          );
        }
      } else if (draftRow.__slidingOut) {
        // A re-render landed mid-outro — keep the row visible so the
        // default "hide by default" reset above doesn't cut the slide off.
        draftRow.style.display = "";
      }
      return;
    }

    return;
  }

  // ============================
  // SETTER
  // ============================
  const setterCanEdit =
    !state.powers?.freezeActive &&
    (
      (state.phase === "simultaneous" &&
        !state.secret &&
        !state.simultaneousSecretSubmitted) ||
      (state.phase === "normal" &&
        state.turn === state.setter &&
        !!state.pendingGuess)
    );

  // Always show pending guess if it exists — slides in when it first
  // appears (the guesser just submitted a guess). updateRow() overwrites
  // the row's className wholesale, so it has to run *before* showRow()
  // adds the animation class, not after.
  if (upperPending) {
    updateRow(pendingRow, upperPending, "draft-row pending-guess");
    showRow(pendingRow, pendingWasVisible, "row-slide-in");
  }

  // Draft / preview (secret) row — slides down when it first appears.
  // The overlaid current secret shows its known-green letters in green
  // too (same as the setter's own typed draft): green means that position
  // is confirmed, so the secret's letter there is worth highlighting.
  if (!setterCanEdit) {
    updateRow(draftRow, upperSecret, "draft-row ghost-secret", null, greenPattern);
    showRow(draftRow, draftWasVisible, "row-slide-down");
    return;
  }

  if (state.phase === "simultaneous") {
    updateRow(
      draftRow,
      upperSetterDraft || "",
      "draft-row setter-draft",
      null,
      greenPattern
    );
    showRow(draftRow, draftWasVisible, "row-slide-down");
    return;
  }

  if (state.phase === "normal") {
    updateRow(
      draftRow,
      upperSetterDraft || upperSecret,
      upperSetterDraft
        ? "draft-row setter-draft"
        : "draft-row ghost-secret",
      null,
      // Green-match applies to both: the setter's typed draft AND the
      // overlaid current secret when they haven't typed anything yet.
      greenPattern
    );
    showRow(draftRow, draftWasVisible, "row-slide-down");
  }
};


function updateDraftRow(row, word, className, state) {
  const frozen =
    state.turn === state.setter &&
    state.powers?.freezeActive;

  row.className = frozen
    ? "history-row draft-row freeze-draft"
    : `history-row ${className}`;

  for (let i = 0; i < 5; i++) {
    row.__tiles[i].textContent = word[i] || "";
  }
}

function renderDraftRow(word, container, className) {
  const row = document.createElement("div"); 
  if (state.turn === state.setter && state.powers?.freezeActive ) {
      row.className = `history-row draft-row freeze-draft`;
    } else{    
    row.className = `history-row ${className}`;
  }
  for (let i = 0; i < 5; i++) { 
    const tile = document.createElement("div"); 
    tile.className = "history-tile draft-tile"; 
    tile.textContent = word[i] || ""; 
    row.appendChild(tile); 
  } 
  container.appendChild(row); 
};


