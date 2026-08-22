// client/key-color-picker.js — Guesser-only keyboard key coloring.
//
// Hold a letter key to bring up green / yellow / not-in-word / unused
// options, the same "hold for more choices" gesture a phone keyboard uses
// for accented letters. Picking one recolors that key on the Guesser's
// own keyboard for planning purposes -- useful when a power (Count Only,
// Fake Feedback, ...) has left the real color ambiguous and the player
// wants to track their own guess about it. Purely a local, client-side
// annotation: it never touches server state or the real per-letter
// status (state.keyboard), so it can't leak information or affect
// scoring -- ui/keyboard.js just paints it on top of whatever the real
// color would otherwise be, and clears it out again the moment real
// feedback for that letter actually arrives (see applyManualColorClass
// there) or a new round starts (see resetManualKeyColorsForRound below).
(() => {
  "use strict";

  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;

  let manualColors = {};
  let lastRoundKey = null;

  let pressTimer = null;
  let pressKeyEl = null;
  let pressStartX = 0;
  let pressStartY = 0;
  let suppressNextClick = false;

  let openKeyEl = null;
  let openLetter = null;

  function roundKeyFor(state) {
    return `${window.roomId || ""}|${state?.roundIndex ?? 0}`;
  }

  // Called every render (see ui/keyboard.js) -- cheap no-op unless the
  // room or round actually changed since the last call.
  window.resetManualKeyColorsForRound = function (state) {
    const key = roundKeyFor(state);
    if (key === lastRoundKey) return;
    lastRoundKey = key;
    manualColors = {};
  };

  window.getManualKeyColor = function (letter) {
    return manualColors[letter] || null;
  };

  // Real feedback overrides a stale manual guess the instant it exists --
  // see ui/keyboard.js, which calls this once it knows a letter's true
  // status. Left alone otherwise (repeatedly clearing an unset letter on
  // every render would be a no-op anyway, but this keeps the intent
  // explicit at the call site).
  window.clearManualKeyColor = function (letter) {
    if (manualColors[letter]) delete manualColors[letter];
  };

  function picker() {
    return document.getElementById("keyColorPicker");
  }

  function positionPicker(keyEl) {
    const el = picker();
    if (!el) return;

    const rect = keyEl.getBoundingClientRect();
    const pickerRect = el.getBoundingClientRect();

    const spaceAbove = rect.top;
    const showBelow = spaceAbove < pickerRect.height + 12;

    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - pickerRect.width / 2),
      window.innerWidth - pickerRect.width - 8
    );

    el.style.left = `${left}px`;
    el.style.top = showBelow
      ? `${rect.bottom + 8}px`
      : `${rect.top - pickerRect.height - 8}px`;
  }

  function closePicker() {
    const el = picker();
    if (!el) return;
    el.classList.add("hidden");
    openKeyEl?.classList.remove("key-color-picker-target");
    openKeyEl = null;
    openLetter = null;
  }

  function openPicker(keyEl, letter) {
    const el = picker();
    if (!el) return;

    openKeyEl = keyEl;
    openLetter = letter;
    keyEl.classList.add("key-color-picker-target");

    el.classList.remove("hidden");
    // Measured for real position math above -- has to already be
    // display:flex (not hidden) before getBoundingClientRect reports a
    // real size, so positioning runs after the class swap, not before.
    positionPicker(keyEl);
  }

  picker()?.addEventListener("click", event => {
    const btn = event.target.closest(".key-color-option");
    if (!btn || !openLetter) return;

    const color = btn.dataset.color || null;
    if (color) manualColors[openLetter] = color;
    else delete manualColors[openLetter];

    closePicker();
    window.updateUI?.();
  });

  document.addEventListener("pointerdown", event => {
    if (openKeyEl && !event.target.closest("#keyColorPicker") && !event.target.closest(".key-color-picker-target")) {
      closePicker();
    }
  });

  // Capturing (fires before the key's own click handler, regardless of
  // when that handler was attached) so a long-press that opened the
  // picker never also types the letter once the pointer finally lifts.
  document.addEventListener("click", event => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  function cancelPressTimer() {
    clearTimeout(pressTimer);
    pressTimer = null;
    pressKeyEl = null;
  }

  function onPressMove(event) {
    if (!pressKeyEl) return;
    const dx = event.clientX - pressStartX;
    const dy = event.clientY - pressStartY;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cancelPressTimer();
  }

  function onPressEnd() {
    cancelPressTimer();
  }

  // Called once per Guesser letter key from ui/keyboard.js (guarded
  // there the same way __dragWired is, so this only ever runs once per
  // key element even though renderKeyboard re-runs constantly).
  window.attachKeyLongPress = function (keyEl, letter) {
    keyEl.addEventListener("pointerdown", event => {
      // Right-click / non-primary pointer shouldn't arm a long-press.
      if (event.button > 0) return;

      pressKeyEl = keyEl;
      pressStartX = event.clientX;
      pressStartY = event.clientY;

      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (pressKeyEl !== keyEl) return;
        pressTimer = null;
        pressKeyEl = null;
        suppressNextClick = true;
        openPicker(keyEl, letter);
      }, LONG_PRESS_MS);
    });

    keyEl.addEventListener("pointermove", onPressMove);
    keyEl.addEventListener("pointerup", onPressEnd);
    keyEl.addEventListener("pointercancel", onPressEnd);
    keyEl.addEventListener("pointerleave", onPressEnd);
  };
})();
