// The Secretkeeper's cover-star rating belongs ABOVE both draft rows, on the
// decision-meta bar -- i.e. above the pending-guess row, not beside the
// secret. It used to be appended as a 6th child of the editable secret row,
// which put it to the RIGHT of the five letter tiles: that widened the row
// past the board, knocked its tiles out of alignment with the pending-guess
// row above it, and clipped the stars off the edge on a narrow phone.
//
// setter-board-polish.js's ensureDecisionMeta already relocated it here, but
// only reactively via a MutationObserver -- so every rebuild of these rows
// re-created the stars in the wrong parent first and the correct position
// depended on winning a race. Creating them in the right parent up front
// removes the race: the observer then finds them already correct and the
// move becomes a no-op. Ids/classes deliberately match the ones
// ensureDecisionMeta builds, so whichever of the two runs first wins and the
// other one finds its work already done.
window.ensureSetterCoverStars = function ensureSetterCoverStars() {
  const stage = document.querySelector("#setterScreen .setter-decision-stage");
  if (!stage) return null;

  let meta = document.getElementById("setterDecisionMeta");
  if (!meta) {
    meta = document.createElement("div");
    meta.id = "setterDecisionMeta";
    meta.className = "setter-decision-meta";
    stage.insertBefore(
      meta,
      stage.querySelector(".draft-row-wrap") || stage.firstChild
    );
  }

  let mount = document.getElementById("setterStarsMount");
  if (!mount) {
    mount = document.createElement("div");
    mount.id = "setterStarsMount";
    mount.className = "setter-stars-mount";
    meta.prepend(mount);
  }

  let stars = document.getElementById("setterCoverStars");
  if (!stars) {
    stars = document.createElement("div");
    stars.id = "setterCoverStars";
    stars.className = "setter-cover-stars hidden";
    stars.setAttribute("aria-live", "polite");
    stars.innerHTML = `
      <span class="setter-cover-stars-core">
        <span class="setter-cover-star setter-cover-base-star" data-cover-star aria-hidden="true">★</span>
        <span class="setter-cover-star setter-cover-base-star" data-cover-star aria-hidden="true">★</span>
        <span class="setter-cover-star setter-cover-bonus-star" data-cover-bonus-star aria-hidden="true">★</span>
      </span>

      <span id="setterCoverTarget" class="setter-cover-target hidden">
        <span id="setterCoverTargetLabel" class="setter-cover-target-label"></span>
      </span>
    `;
  }

  if (stars.parentElement !== mount) mount.appendChild(stars);
  return stars;
};

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
  // ...but rebuild if the cached rows are no longer actually in this
  // container. __draftRows is a property on the container element, so it
  // outlives its own children: anything that replaces the container's
  // contents (the board restructuring that runs on a rejoin is the way
  // this shows up in practice) leaves the property pointing at detached
  // nodes, and every later render then wrote the draft into orphans that
  // are not on the page. That is the "my draft row is gone after
  // reconnecting" case -- the state was right, the row just wasn't in the
  // document any more.
  const cachedRowsAttached =
    container.__draftRows?.pending?.parentElement === container &&
    container.__draftRows?.draft?.parentElement === container;

  if (!container.__draftRows || !cachedRowsAttached) {
    container.innerHTML = "";
    container.__draftRows = {};

    function makeRow(isEditableDraft) {
      const row = document.createElement("div");
      row.className = "history-row draft-row";
      row.__tiles = [];

      for (let i = 0; i < 5; i++) {
        const tile = document.createElement("div");
        tile.className = "history-tile draft-tile";

        if (isEditableDraft && (role === "setter" || role === "guesser")) {
          tile.dataset.dragIndex = i;
          tile.dataset.dragRole = role;

          tile.addEventListener("pointerdown", event => {
            const letter = tile.textContent?.trim();
            if (!letter) return;

            window.beginTileDrag?.(
              i,
              letter,
              event.clientX,
              event.clientY,
              role
            );
          });
        }

        row.__tiles.push(tile);
        row.appendChild(tile);
      }



      // The setter's cover stars deliberately do NOT live in this row --
      // see ensureSetterCoverStars above for why they sit on the
      // decision-meta bar instead.

      return row;
    }

    container.__draftRows.pending = makeRow(false);
    container.__draftRows.draft = makeRow(true);

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

  // Cheap and idempotent -- re-asserts the stars' correct parent on every
  // render, so a board rebuild (rejoin) or any other script that reparents
  // them can't leave them stranded back inside a draft row.
  if (role === "setter") window.ensureSetterCoverStars?.();

  // ----------------------------
  // Helpers
  // ----------------------------
  // Sneaky Guess: only the setter's own view of the pending-guess row
  // needs masking -- the guesser sees this same value while their own
  // just-submitted guess slides away, which is their own word, not a
  // leak. client.js's displayGuess/keyboard rendering hide it the same
  // way; this is the actual tile row those two don't cover.
  const upperPending =
    role === "setter" && state.powers?.stealthGuessActive
      ? "?????"
      : (state.pendingGuess?.toUpperCase() || "");
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

  function updateRow(row, word, className, ghostPattern, greenMatchPattern, lockRole) {
    const frozen =
      state.turn === state.setter &&
      state.powers?.freezeActive;

    // Every keystroke while typing a guess/secret calls back into this via
    // updateUI(), re-running this render far more often than the row's own
    // entrance animation (340ms) takes to finish. Overwriting className
    // wholesale each time stripped the animation class mid-flight, so it
    // visually never got to play. Carry over any slide class already in
    // progress instead of dropping it. draft-shake needs the same
    // treatment for a different reason: it overrides row-slide-down's
    // `animation` property via !important while it's on the row (see
    // states.css), so dropping it mid-shake made the reset+re-add below
    // hand animation-name back to row-slide-down -- a real, observable
    // change the browser plays from 0%, i.e. the settled row visibly
    // hops back up before sliding down again. shakeDraftRow (client.js)
    // removes draft-shake itself once the shake's 220ms is up, so by the
    // time it's carried here past that point it's inert (resting at its
    // neutral end keyframe) and safe to keep around.
    const inFlightAnim = ["row-slide-in", "row-slide-down", "draft-shake"].filter(c =>
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
      // A space is Drag Mode's placeholder for "not filled at this
      // position yet" (see setSetterDraftLetterAt in client.js) -- treat
      // it the same as an actually-empty slot rather than rendering it
      // as a filled, blank-looking tile.
      const rawChar = word[i];
      const real = (rawChar && rawChar !== " ") ? rawChar : "";
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
      // Tiles are reused across renders/roles/rows, so this must be
      // explicitly cleared (not just skipped) whenever the row showing
      // right now isn't the setter's own editable draft -- otherwise a
      // lock icon from a prior render (e.g. the setter-draft view) could
      // linger onto the read-only ghost-secret view that reuses the same
      // DOM tile.
      const lockChecker = lockRole === "guesser"
        ? window.isGuesserDraftIndexLocked
        : lockRole === "setter"
        ? window.isSetterDraftIndexLocked
        : null;
      const locked = !!real && !!lockChecker?.(i);
      tile.classList.toggle("tile-locked", locked);
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
  const ENTRANCE_KEYFRAME_NAMES = {
    "row-slide-down": "draft-row-slide-down",
    "row-slide-in": "draft-row-slide-in"
  };
  function showRow(row, wasVisible, animClass) {
    row.style.display = "";
    // Clear visibility too, not just display. This is the authoritative
    // "the row belongs on screen now" path, but it isn't the only thing
    // that hides it: guesser-flow-v7.js's hideNewDraft() (and the
    // pendingGuess branch of its state handler) park the row with BOTH
    // display:none AND visibility:hidden while a submit/resolve animation
    // plays. Restoring only display left the row laid out but invisible --
    // it took up its full space with nothing drawn in it, which is what
    // made the guesser's draft row intermittently fail to appear at the
    // start of a round: whether it came back at all depended on whether
    // one of that module's own show paths (which do clear visibility)
    // happened to run afterwards.
    row.style.visibility = "";
    if (!wasVisible && animClass) {
      row.classList.remove(animClass);
      void row.offsetWidth; // restart animation
      row.classList.add(animClass);

      // Drop the class once the entrance genuinely finishes instead of
      // leaving it attached forever -- `both` fill-mode already holds the
      // same resting transform either way, but leaving the class on meant
      // any later removal of an overriding !important animation (e.g.
      // draft-shake ending, see states.css) handed animation-name back to
      // this one and the browser replayed it from 0%, visibly yanking the
      // row back up before sliding it back down.
      const keyframeName = ENTRANCE_KEYFRAME_NAMES[animClass];
      row.addEventListener("animationend", function onEntranceEnd(e) {
        if (e.target !== row || e.animationName !== keyframeName) return;
        row.removeEventListener("animationend", onEntranceEnd);
        row.classList.remove(animClass);
      });
    }
  }

  // Hide rows by default
  pendingRow.style.display = "none";
  draftRow.style.display = "none";

  // Guesser
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
      updateRow(draftRow, upperGuesserDraft, "draft-row guesser-draft", null, null, "guesser");
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

  // Setter
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
  const shouldShowBlankSecretRow =
  !setterCanEdit &&
  (
    (
      state.phase === "simultaneous" &&
      state.simultaneousSecretSubmitted
    ) ||
    (
      state.phase === "normal" &&
      state.turn === state.guesser &&
      !state.pendingGuess
    )
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
if (shouldShowBlankSecretRow) {
  updateRow(
    draftRow,
    "",
    "draft-row ghost-secret",
    null,
    greenPattern
  );

  showRow(
    draftRow,
    draftWasVisible,
    "row-slide-down"
  );

  return;
}

if (!setterCanEdit) {
  updateRow(
    draftRow,
    upperSecret,
    "draft-row ghost-secret",
    null,
    greenPattern
  );

  showRow(
    draftRow,
    draftWasVisible,
    "row-slide-down"
  );

  return;
}

  if (state.phase === "simultaneous") {
    updateRow(
      draftRow,
      upperSetterDraft || "",
      "draft-row setter-draft",
      null,
      greenPattern,
      "setter"
    );
    showRow(draftRow, draftWasVisible, "row-slide-down");
    return;
  }

  if (state.phase === "normal") {
    // The ghost-secret placeholder is only for the untouched start of a
    // turn -- once the setter has typed and deleted back to empty this
    // turn (setterDraftTouched), the row must stay genuinely empty instead
    // of silently snapping back to showing the current secret.
    const showGhost = !upperSetterDraft && !state.setterDraftTouched;
    updateRow(
      draftRow,
      showGhost ? upperSecret : upperSetterDraft,
      showGhost
        ? "draft-row ghost-secret"
        : "draft-row setter-draft",
      null,
      // Green-match applies to both: the setter's typed draft AND the
      // overlaid current secret when they haven't typed anything yet.
      greenPattern,
      showGhost ? null : "setter"
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


