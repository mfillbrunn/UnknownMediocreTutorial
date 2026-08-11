(() => {
  "use strict";

  const SUBMIT_MS = 560;
  const REVEAL_FALLBACK_MS = 1900;

  const byId = id => document.getElementById(id);

  let previous = null;
  let pendingWrap = null;
  let pendingWord = "";
  let resolutionInFlight = false;
  let sequence = Promise.resolve();

  function reducedMotion() {
    return !!window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }

  function summarize(state) {
    return {
      pendingGuess: String(
        state?.pendingGuess || ""
      ).toUpperCase(),
      historyLength:
        state?.history?.length ?? 0,
      phase: state?.phase || "",
      turn: state?.turn || null,
      guesser: state?.guesser || null,
      simultaneousGuessSubmitted:
        !!state?.simultaneousGuessSubmitted
    };
  }

  function queue(task) {
    sequence = sequence
      .then(() => task())
      .catch(error => {
        console.error(
          "Guesser flow animation failed:",
          error
        );

        resolutionInFlight = false;
        cleanupPending();
        showDraftImmediately();
      });

    return sequence;
  }

  function draftContainer() {
    return byId("draftGuesser");
  }

  function draftRow() {
    const container = draftContainer();

    return (
      container?.__draftRows?.draft ||
      container?.querySelector(
        ".history-row.guesser-draft"
      ) ||
      null
    );
  }

  function historyContainer() {
    return byId("historyGuesser");
  }

  function historyWord(wrap) {
    if (!wrap) return "";

    return [
      ...wrap.querySelectorAll(
        ".tile-letter"
      )
    ]
      .map(el => el.textContent || "")
      .join("")
      .toUpperCase();
  }

  function makePendingWrap(word) {
    const wrap =
      document.createElement("div");

    wrap.className =
      "history-row-wrap " +
      "guesser-pending-history";

    wrap.dataset.guesserPending =
      "true";

    wrap.dataset.word = word;

    const anchor =
      document.createElement("div");

    anchor.className =
      "history-row-anchor";

    const row =
      document.createElement("div");

    row.className = "history-row";

    for (const letter of word) {
      const tile =
        document.createElement("div");

      tile.className =
        "history-tile " +
        "guesser-pending-tile";

      const span =
        document.createElement("span");

      span.className = "tile-letter";
      span.textContent = letter;

      tile.appendChild(span);
      row.appendChild(tile);
    }

    anchor.appendChild(row);
    wrap.appendChild(anchor);

    return wrap;
  }

  function removeOtherPendingRows() {
    document
      .querySelectorAll(
        "#historyGuesser " +
        ".guesser-pending-history"
      )
      .forEach(wrap => {
        if (wrap !== pendingWrap) {
          wrap.remove();
        }
      });
  }

  function ensurePending(word) {
    const history = historyContainer();

    if (!history || !word) {
      return null;
    }

    if (
      pendingWrap?.isConnected &&
      pendingWord === word
    ) {
      pendingWrap.classList.add(
        "is-working"
      );

      return pendingWrap;
    }

    cleanupPending();

    pendingWord = word;
    pendingWrap = makePendingWrap(word);

    history.appendChild(pendingWrap);
    removeOtherPendingRows();

    history.scrollTop =
      history.scrollHeight;

    pendingWrap.classList.add(
      "is-working"
    );

    return pendingWrap;
  }

  function cleanupPending() {
    pendingWrap?.remove();

    pendingWrap = null;
    pendingWord = "";

    document
      .querySelectorAll(
        "#historyGuesser " +
        ".guesser-pending-history"
      )
      .forEach(wrap => wrap.remove());
  }

  function copyRowDimensions(
    sourceRow,
    cloneRow
  ) {
    const sourceTiles =
      sourceRow?.querySelectorAll(
        ":scope > .history-tile"
      );

    const cloneTiles =
      cloneRow?.querySelectorAll(
        ":scope > .history-tile"
      );

    if (!sourceTiles || !cloneTiles) {
      return;
    }

    sourceTiles.forEach(
      (sourceTile, index) => {
        const cloneTile =
          cloneTiles[index];

        if (!cloneTile) return;

        const rect =
          sourceTile.getBoundingClientRect();

        const style =
          getComputedStyle(sourceTile);

        Object.assign(
          cloneTile.style,
          {
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            flex: `0 0 ${rect.width}px`,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            borderRadius:
              style.borderRadius,
            letterSpacing:
              style.letterSpacing
          }
        );
      }
    );
  }

  function waitForTransition(
    element,
    timeoutMs
  ) {
    return new Promise(resolve => {
      let finished = false;

      const finish = () => {
        if (finished) return;

        finished = true;

        element.removeEventListener(
          "transitionend",
          onEnd
        );

        clearTimeout(timer);
        resolve();
      };

      const onEnd = event => {
        if (
          event.target === element &&
          event.propertyName ===
            "transform"
        ) {
          finish();
        }
      };

      const timer = setTimeout(
        finish,
        timeoutMs
      );

      element.addEventListener(
        "transitionend",
        onEnd
      );
    });
  }

  function cancelCoreDraftOutro(row) {
    if (!row) return;

    row.__slidingOut = false;

    row.classList.remove(
      "row-slide-down",
      "row-slide-in",
      "row-slide-out",
      "guesser-draft-enter-left"
    );
  }

  function buildFlightFrom(sourceRow, startRect) {
    const flight = sourceRow.cloneNode(true);

    flight.className =
      "history-row " +
      "guesser-guess-flight";

    copyRowDimensions(sourceRow, flight);

    const sourceStyle =
      getComputedStyle(sourceRow);

    Object.assign(flight.style, {
      left: `${startRect.left}px`,
      top: `${startRect.top}px`,
      width: `${startRect.width}px`,
      height: `${startRect.height}px`,
      gap: sourceStyle.gap,
      transformOrigin: "center center"
    });

    document.body.appendChild(flight);

    sourceRow.style.display = "none";
    sourceRow.style.visibility = "hidden";

    return flight;
  }

  /*
   * Clone the draft row in the SAME tick the submission is detected.
   *
   * client.js registers its own stateUpdate handler before this module's,
   * so by the time we get here it has already re-rendered the guesser
   * board and hidden the draft row -- and animateSubmission only runs
   * later, off the promise queue. Measured live, that gap ran ~150ms, and
   * for every one of those frames the submitted word existed nowhere on
   * screen. Building the clone synchronously here means it takes over the
   * draft row's exact position before the browser can paint a single
   * frame without the word in it.
   */
  function captureSubmitFlight() {
    const sourceRow = draftRow();

    if (!sourceRow || reducedMotion()) {
      return null;
    }

    cancelCoreDraftOutro(sourceRow);

    sourceRow.style.display = "";
    sourceRow.style.visibility = "";

    const startRect =
      sourceRow.getBoundingClientRect();

    if (
      !startRect.width ||
      !startRect.height
    ) {
      return null;
    }

    return {
      startRect,
      flight: buildFlightFrom(
        sourceRow,
        startRect
      )
    };
  }

  async function animateSubmission(
    word,
    captured
  ) {
    const history = historyContainer();
    const sourceRow = draftRow();

    if (!history || !word) {
      captured?.flight.remove();
      return;
    }

    let flight = captured?.flight || null;
    let startRect = captured?.startRect || null;

    // No pre-made clone (reduced motion, or the row was already gone by
    // the time the state landed) -- fall back to measuring here.
    if (!flight) {
      cancelCoreDraftOutro(sourceRow);

      if (sourceRow) {
        sourceRow.style.display = "";
        sourceRow.style.visibility = "";
      }

      startRect =
        sourceRow?.getBoundingClientRect();
    }

    const wrap = ensurePending(word);
    const targetRow =
      wrap?.querySelector(".history-row");

    if (!wrap || !targetRow) {
      flight?.remove();
      return;
    }

    /*
     * Hidden from the moment it exists, not after the two measuring
     * frames below. It still occupies layout while hidden, so the
     * destination measures just as accurately -- but it can no longer
     * paint alongside the flight clone, which is what briefly showed the
     * same word in two places right after submitting.
     */
    wrap.style.visibility = "hidden";

    history.scrollTop =
      history.scrollHeight;

    /*
     * Let the scroll position and the newly appended pending row settle
     * before measuring its destination. On iPhone, measuring in the same
     * frame can leave the target a few pixels to the right of where it
     * finally paints.
     */
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    const endRect =
      targetRow.getBoundingClientRect();

    if (
      reducedMotion() ||
      (!flight && !sourceRow) ||
      !startRect?.width ||
      !endRect?.width
    ) {
      flight?.remove();

      if (sourceRow) {
        sourceRow.style.display = "none";
        sourceRow.style.visibility =
          "hidden";
      }

      wrap.style.visibility = "";
      wrap.classList.add("is-working");
      return;
    }

    if (!flight) {
      flight = buildFlightFrom(
        sourceRow,
        startRect
      );
    }

    /*
     * Move center-to-center rather than left-edge-to-left-edge. The rows
     * can differ slightly in width, so edge math shifts the visual center
     * to the right when the clone is scaled.
     */
    const dx =
      endRect.left +
      endRect.width / 2 -
      (
        startRect.left +
        startRect.width / 2
      );

    const dy =
      endRect.top +
      endRect.height / 2 -
      (
        startRect.top +
        startRect.height / 2
      );

    const scaleX =
      endRect.width / startRect.width;

    const scaleY =
      endRect.height / startRect.height;

    void flight.offsetWidth;

    requestAnimationFrame(() => {
      flight.style.transition =
        `transform ${SUBMIT_MS}ms ` +
        "cubic-bezier(0.16, 1, 0.3, 1), " +
        `opacity ${SUBMIT_MS}ms ease`;

      flight.style.transform =
        `translate3d(${dx}px, ${dy}px, 0) ` +
        `scale(${scaleX}, ${scaleY})`;
    });

    await waitForTransition(
      flight,
      SUBMIT_MS + 180
    );

    flight.remove();

    wrap.style.visibility = "";
    wrap.classList.add("is-working");
  }

  function findNewestHistoryRow(word) {
    const history = historyContainer();

    if (!history) return null;

    const rows = [
      ...history.querySelectorAll(
        ":scope > .history-row-wrap"
      )
    ].reverse();

    return (
      rows.find(wrap => {
        if (
          wrap.classList.contains(
            "guesser-pending-history"
          )
        ) {
          return false;
        }

        return historyWord(wrap) === word;
      }) || null
    );
  }

  function holdNewestHistoryRow(word) {
    const wrap =
      findNewestHistoryRow(word);

    if (!wrap) return null;

    wrap.__revealStarted = true;

    // client.js's own stateUpdate listener runs first (see the big comment
    // on captureSubmitFlight) and its renderHistory has already created
    // this row with "row-enter" -- a plain 22px upward slide meant as a
    // fallback for screens with no custom flight (see history.css's own
    // comment on that class). This module always replaces/discards that
    // row via morphPendingIntoHistory or its own flight, but row-enter's
    // animation starts the instant the class exists, and it was never
    // being cancelled here -- just hidden -- so a still-running 22px
    // offset could survive into this row's eventual real position and
    // very briefly render it riding up over the row above before settling,
    // right as the tile flip kicked in. Removing it alongside reveal-tiles
    // (same guard this function already applies) stops that offset dead
    // instead of leaving it to decay on its own.
    wrap.classList.remove(
      "reveal-tiles",
      "row-enter"
    );

    wrap.classList.add(
      "guesser-reveal-held"
    );

    wrap.style.visibility = "hidden";

    return wrap;
  }

  function canShowNewDraft(state) {
    if (
      !state ||
      state.phase === "gameOver" ||
      state.phase === "roundSummary"
    ) {
      return false;
    }

    if (state.phase === "simultaneous") {
      return !state.simultaneousGuessSubmitted;
    }

    return (
      state.phase === "normal" &&
      state.turn === state.guesser &&
      !state.pendingGuess
    );
  }

  function hideNewDraft() {
    const row = draftRow();

    if (!row) return null;

    cancelCoreDraftOutro(row);

    row.style.visibility = "hidden";
    row.style.display = "none";

    return row;
  }

  function showDraftImmediately() {
    const row = draftRow();

    if (!row) return;

    cancelCoreDraftOutro(row);

    row.style.display = "";
    row.style.visibility = "";
  }

  function showNewDraftFromLeft(state) {
    if (!canShowNewDraft(state)) {
      return;
    }

    const row = draftRow();

    if (!row) return;

    cancelCoreDraftOutro(row);

    row.style.display = "";
    row.style.visibility = "";

    if (reducedMotion()) return;

    void row.offsetWidth;

    row.classList.add(
      "guesser-draft-enter-left"
    );

    row.addEventListener(
      "animationend",
      function onEnd(event) {
        if (
          event.target !== row ||
          event.animationName !==
            "guesser-draft-enter-left"
        ) {
          return;
        }

        row.removeEventListener(
          "animationend",
          onEnd
        );

        row.classList.remove(
          "guesser-draft-enter-left"
        );
      }
    );
  }

  function waitForHistoryReveal(wrap) {
    return new Promise(resolve => {
      const lastTile =
        wrap?.querySelector(
          ".history-tile:last-child"
        );

      if (!lastTile || reducedMotion()) {
        setTimeout(resolve, 40);
        return;
      }

      let finished = false;

      const finish = () => {
        if (finished) return;

        finished = true;

        lastTile.removeEventListener(
          "animationend",
          onEnd
        );

        clearTimeout(timer);
        resolve();
      };

      const onEnd = event => {
        if (
          event.target === lastTile &&
          event.animationName ===
            "history-wordle-flip"
        ) {
          finish();
        }
      };

      const timer = setTimeout(
        finish,
        REVEAL_FALLBACK_MS
      );

      lastTile.addEventListener(
        "animationend",
        onEnd
      );
    });
  }

  function morphPendingIntoHistory(
    waitingWrap,
    realWrap
  ) {
    if (!waitingWrap || !realWrap) {
      return realWrap;
    }

    waitingWrap.classList.remove(
      "is-working",
      "is-handing-off"
    );

    waitingWrap.removeAttribute(
      "data-guesser-pending"
    );

    waitingWrap.removeAttribute(
      "data-word"
    );

    waitingWrap.dataset.key =
      realWrap.dataset.key || "";

    waitingWrap.className =
      "history-row-wrap " +
      "guesser-reveal-held";

    waitingWrap.removeAttribute("style");

    const children = [
      ...realWrap.childNodes
    ];

    waitingWrap.replaceChildren(
      ...children
    );

    realWrap.remove();

    waitingWrap.__revealStarted =
      false;

    return waitingWrap;
  }

  async function animateResolution(
    word,
    heldWrap,
    state
  ) {
    hideNewDraft();

    const realWrap =
      heldWrap ||
      findNewestHistoryRow(word);

    if (!realWrap) {
      cleanupPending();
      resolutionInFlight = false;
      showNewDraftFromLeft(state);
      return;
    }

    realWrap.__revealStarted = true;

    realWrap.classList.remove(
      "reveal-tiles"
    );

    realWrap.classList.add(
      "guesser-reveal-held"
    );

    realWrap.style.visibility = "hidden";

    let revealWrap = realWrap;

    if (
      pendingWrap?.isConnected &&
      pendingWord === word
    ) {
      revealWrap =
        morphPendingIntoHistory(
          pendingWrap,
          realWrap
        );

      pendingWrap = null;
      pendingWord = "";
    } else {
      revealWrap.classList.remove(
        "guesser-reveal-held"
      );

      revealWrap.style.visibility = "";
      revealWrap.__revealStarted = false;
    }

    revealWrap.classList.remove(
      "guesser-reveal-held",
      "row-enter",
      "reveal-waiting"
    );

    revealWrap.style.visibility = "";
    revealWrap.__revealStarted = false;

    window.revealHistoryRow?.(
      revealWrap
    );

    await waitForHistoryReveal(
      revealWrap
    );

    resolutionInFlight = false;
    showNewDraftFromLeft(state);
  }

  function syncInitialState(state) {
    const pending = String(
      state?.pendingGuess || ""
    ).toUpperCase();

    if (pending) {
      ensurePending(pending);

      const row = draftRow();

      if (row) {
        cancelCoreDraftOutro(row);
        row.style.display = "none";
        row.style.visibility = "hidden";
      }
    } else {
      cleanupPending();
    }
  }

  function resetForOtherRole() {
    resolutionInFlight = false;
    cleanupPending();
    previous = null;
  }

  function handleStateUpdate(state) {
    if (window.myRole !== "guesser") {
      resetForOtherRole();
      return;
    }

    const next = summarize(state);

    if (resolutionInFlight) {
      hideNewDraft();
    }

    if (!previous) {
      previous = next;
      queue(() => syncInitialState(state));
      return;
    }

    const submitted =
      !previous.pendingGuess &&
      !!next.pendingGuess &&
      next.historyLength ===
        previous.historyLength;

    const resolved =
      !!previous.pendingGuess &&
      !next.pendingGuess &&
      next.historyLength >
        previous.historyLength;

    // A guess that exactly matches the already-committed secret ends the
    // round immediately server-side (transitionAfterGuess/simultaneous.js's
    // isWin branches) -- there's no setter reaction to wait on, so the
    // guess never passes through the normal pendingGuess intermediate step
    // both "submitted" and "resolved" above key off. Left alone, that means
    // this state update is the ONLY one the guesser ever sees for their
    // winning guess: renderHistory (called synchronously just before this
    // handler, via client.js's own stateUpdate listener) has already
    // appended the real row and queued its reveal, so the word appears to
    // snap straight into history instead of flying up from the draft like
    // every other submission. Exclude the assassin-word instant-loss path
    // (also skips pendingGuess via pushWinEntry) -- it archives state.secret
    // rather than what the guesser actually typed, so flying that word in
    // would visibly not match their draft.
    const wonDirectly =
      !previous.pendingGuess &&
      !next.pendingGuess &&
      next.historyLength >
        previous.historyLength &&
      !state.powers?.assassinWordassassinated;

    if (submitted) {
      const word = next.pendingGuess;

      // Synchronously, before this tick can paint -- see
      // captureSubmitFlight. The queued work below may not start for
      // several frames, and the word must stay on screen throughout.
      const captured = captureSubmitFlight();

      queue(() =>
        animateSubmission(word, captured)
      );
    } else if (resolved) {
      resolutionInFlight = true;
      hideNewDraft();

      const word =
        previous.pendingGuess;

      const heldWrap =
        holdNewestHistoryRow(word);

      // A win on the opening simultaneous guess still passes through this
      // normal submitted->resolved pendingGuess pair (unlike a win on a
      // later normal-phase guess -- see the wonDirectly comment below), so
      // it already gets the standard flight+reveal for free here. It still
      // needs to signal completion the same way wonDirectly does, so
      // client.js's wonByGuess popup timing (which only fires this event's
      // listener when a win is in play) waits for the real animation
      // instead of falling back to its blind safety-net timer every time.
      const isWinResolve =
        state.phase === "gameOver";

      queue(async () => {
        await animateResolution(
          word,
          heldWrap,
          state
        );

        if (isWinResolve) {
          window.dispatchEvent(
            new CustomEvent(
              "guesserWinRevealDone"
            )
          );
        }
      });
    } else if (wonDirectly) {
      resolutionInFlight = true;
      hideNewDraft();

      const winningEntry =
        state.history?.[
          state.history.length - 1
        ];

      const word = (
        winningEntry?.guess || ""
      ).toUpperCase();

      // Grab the just-rendered real row and hide it synchronously, same as
      // the "resolved" branch above -- renderHistory already scheduled its
      // reveal via requestAnimationFrame, and that has to be stopped before
      // the browser paints a frame or the flip plays with no flight first.
      const heldWrap = word
        ? holdNewestHistoryRow(word)
        : null;

      // captureSubmitFlight reads the draft row's current on-screen
      // position -- still valid here since this whole handler runs
      // synchronously, in the same tick client.js used to render the final
      // state (including hiding the draft), right after that render.
      const captured = word
        ? captureSubmitFlight()
        : null;

      if (word) {
        queue(async () => {
          await animateSubmission(
            word,
            captured
          );

          await animateResolution(
            word,
            heldWrap,
            state
          );

          // client.js's wonByGuess handling waits on this instead of a
          // fixed timer, since the flight this branch adds means the
          // setter-only FLIP_TOTAL_MS estimate no longer covers how long
          // the guesser's own reveal actually takes.
          window.dispatchEvent(
            new CustomEvent(
              "guesserWinRevealDone"
            )
          );
        });
      } else {
        window.dispatchEvent(
          new CustomEvent(
            "guesserWinRevealDone"
          )
        );
      }
    } else if (next.pendingGuess) {
      const word = next.pendingGuess;

      queue(() => {
        ensurePending(word);

        const row = draftRow();

        if (row) {
          cancelCoreDraftOutro(row);
          row.style.display = "none";
          row.style.visibility =
            "hidden";
        }
      });
    } else if (
      previous.phase !== next.phase &&
      next.phase === "simultaneous"
    ) {
      queue(() => {
        cleanupPending();
        showNewDraftFromLeft(state);
      });
    }

    previous = next;
  }

  if (
    typeof window.onStateUpdate ===
    "function"
  ) {
    window.onStateUpdate(
      handleStateUpdate
    );
  } else if (
    typeof onStateUpdate === "function"
  ) {
    onStateUpdate(handleStateUpdate);
  } else {
    console.warn(
      "Guesser flow v7 could not attach " +
      "to state updates."
    );
  }
})();
