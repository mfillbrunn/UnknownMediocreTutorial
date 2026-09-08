// client/key-color-picker.js — Guesser-only keyboard key colouring.
//
// A small palette sits above the action log in the Guesser's side column
// (see index.html): green / yellow / dark / "?" / clear. Drag one onto a
// keyboard letter to mark that letter yourself -- useful when a power
// (Count Only, Fake Feedback, ...) has left the real colour ambiguous and
// the player wants to track their own read of it. Tapping a swatch arms it
// instead, so the next letter tapped takes that colour; that's the same
// gesture for people who can't comfortably drag, and it's how it works
// with a keyboard too.
//
// This replaced a hold-the-key long-press that opened a popup. The keys
// already own pointerdown for Drag Mode (dragging a letter onto a draft
// tile, see client/drag-mode.js), so a second press-and-hold meaning on
// the very same element fought that gesture -- one had to guess whether
// the player meant to drag a letter or to recolour it. Dragging FROM the
// palette starts on the swatch instead, so the two never overlap.
//
// Purely a local, client-side annotation: it never touches server state or
// the real per-letter status (state.keyboard), so it can't leak
// information or affect scoring -- ui/keyboard.js paints it on top of
// whatever the real colour would otherwise be, and drops it again the
// moment real feedback for that letter arrives (see the manualColor branch
// there) or a new round starts (resetManualKeyColorsForRound below).
(() => {
  "use strict";

  const DRAG_THRESHOLD = 6;

  // Stored value -> the class ui/keyboard.js paints. "unknown" is the only
  // one without a real-feedback counterpart, so it gets its own class
  // rather than reusing a colour that would read as a claim about the
  // letter. An empty/absent value means "no mark".
  const MANUAL_CLASSES = {
    green: "key-green",
    yellow: "key-yellow",
    gray: "key-gray",
    unknown: "key-manual-unknown"
  };

  let manualColors = {};
  let lastRoundKey = null;

  // Swatch armed by a tap, applied to the next letter tapped.
  let armedColor = null;
  let armedSwatch = null;

  // In-flight drag from a swatch.
  let pendingColor = null;
  let pendingSwatch = null;
  let startX = 0;
  let startY = 0;
  let dragEl = null;
  let hoverKey = null;
  let suppressNextClick = false;

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
    disarm();
  };

  window.getManualKeyColor = function (letter) {
    return manualColors[letter] || null;
  };

  window.manualKeyColorClass = function (color) {
    return MANUAL_CLASSES[color] || null;
  };

  // Real feedback overrides a stale manual guess the instant it exists --
  // see ui/keyboard.js, which calls this once it knows a letter's true
  // status.
  window.clearManualKeyColor = function (letter) {
    if (manualColors[letter]) delete manualColors[letter];
  };

  function palette() {
    return document.getElementById("keyColorPalette");
  }

  // Only the Guesser's own keyboard, and only real letters -- ⌫/ENTER have
  // no colour to carry.
  function letterKeyAt(x, y) {
    const under = document.elementFromPoint(x, y);
    const keyEl = under?.closest?.("#keyboardGuesser .key");
    if (!keyEl) return null;
    return /^[A-Z]$/.test(keyEl.dataset.key || "") ? keyEl : null;
  }

  function setHoverKey(keyEl) {
    if (keyEl === hoverKey) return;
    hoverKey?.classList.remove("key-color-drop-target");
    hoverKey = keyEl || null;
    hoverKey?.classList.add("key-color-drop-target");
  }

  function disarm() {
    armedColor = null;
    armedSwatch?.classList.remove("is-armed");
    armedSwatch = null;
    palette()?.classList.remove("is-arming");
  }

  function arm(swatch, color) {
    // Tapping the armed swatch again puts it away.
    if (armedSwatch === swatch) {
      disarm();
      return;
    }
    disarm();
    armedColor = color;
    armedSwatch = swatch;
    swatch.classList.add("is-armed");
    palette()?.classList.add("is-arming");
  }

  // A letter the game has already resolved can't take a manual mark: the
  // real colour wins on the next render regardless (see ui/keyboard.js),
  // so storing one would just vanish a frame later. Say so instead.
  function letterIsResolved(letter) {
    return !!window.state?.keyboard?.[letter];
  }

  function rejectDrop(keyEl) {
    keyEl.classList.remove("key-color-drop-rejected");
    // Restart the animation even on a repeat drop onto the same key.
    void keyEl.offsetWidth;
    keyEl.classList.add("key-color-drop-rejected");
    setTimeout(() => keyEl.classList.remove("key-color-drop-rejected"), 400);
  }

  function applyColor(letter, color, keyEl) {
    if (letterIsResolved(letter)) {
      if (keyEl) rejectDrop(keyEl);
      return false;
    }
    if (color) manualColors[letter] = color;
    else delete manualColors[letter];
    window.updateUI?.();
    return true;
  }

  function cleanupDrag() {
    dragEl?.remove();
    dragEl = null;
    setHoverKey(null);
    pendingColor = null;
    pendingSwatch?.classList.remove("is-dragging");
    pendingSwatch = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(event) {
    if (pendingColor === null) return;

    if (!dragEl) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return;
      dragEl = document.createElement("div");
      dragEl.className = "key-color-drag-ghost";
      const cls = MANUAL_CLASSES[pendingColor];
      if (cls) dragEl.classList.add(cls);
      else dragEl.classList.add("key-color-ghost-clear");
      if (pendingColor === "unknown") dragEl.textContent = "?";
      document.body.appendChild(dragEl);
      pendingSwatch?.classList.add("is-dragging");
      // A drag is not a tap: don't also arm the swatch on the click that
      // follows the pointerup.
      suppressNextClick = true;
    }

    dragEl.style.left = `${event.clientX}px`;
    dragEl.style.top = `${event.clientY}px`;
    setHoverKey(letterKeyAt(event.clientX, event.clientY));
  }

  function onPointerUp(event) {
    const dropKey = dragEl ? letterKeyAt(event.clientX, event.clientY) : null;
    const color = pendingColor;
    cleanupDrag();

    if (!dropKey) return;
    applyColor(dropKey.dataset.key, color, dropKey);
    // A completed drag stands on its own -- don't leave a swatch armed
    // behind it and surprise the next letter tapped.
    disarm();
  }

  function onSwatchPointerDown(event) {
    if (event.button > 0) return;
    const swatch = event.currentTarget;
    // Every gesture starts clean. A drag that ended over a key never fires
    // a click back on the swatch it began from, so a flag left standing
    // from that drag would otherwise swallow the NEXT genuine tap and the
    // swatch would refuse to arm.
    suppressNextClick = false;
    pendingColor = swatch.dataset.color || "";
    pendingSwatch = swatch;
    startX = event.clientX;
    startY = event.clientY;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  }

  function onSwatchClick(event) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const swatch = event.currentTarget;
    arm(swatch, swatch.dataset.color || "");
  }

  function wirePalette() {
    const el = palette();
    if (!el || el.__wired) return;
    el.__wired = true;

    el.querySelectorAll(".key-color-swatch").forEach(swatch => {
      swatch.addEventListener("pointerdown", onSwatchPointerDown);
      swatch.addEventListener("click", onSwatchClick);
    });

    // Clicking away puts an armed swatch down again, so the mode can never
    // sit there unnoticed and eat a later keystroke.
    document.addEventListener("pointerdown", event => {
      if (!armedColor) return;
      if (event.target.closest("#keyColorPalette")) return;
      if (event.target.closest("#keyboardGuesser .key")) return;
      disarm();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && armedColor) disarm();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePalette, { once: true });
  } else {
    wirePalette();
  }

  // Called from ui/keyboard.js's own click handler BEFORE it types the
  // letter. Returns true when an armed swatch consumed the tap, so the
  // letter isn't also typed.
  window.consumeArmedKeyColor = function (letter, keyEl) {
    // armedColor is "" for the eraser, so the swatch is what says whether
    // anything is armed at all.
    if (!armedSwatch) return false;
    const color = armedColor;
    disarm();
    applyColor(letter, color, keyEl);
    return true;
  };
})();
