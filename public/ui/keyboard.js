// /public/ui/keyboard.js — SERVER-DRIVEN VERSION

function buildKeyboard(container) {
  container.innerHTML = "";

  KEYBOARD_LAYOUT.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    row.forEach(symbol => {
      const keyEl = document.createElement("div");
      keyEl.className = "key";
      keyEl.dataset.key = symbol;
      keyEl.textContent = symbol === "ENTER" ? "⏎" : symbol;

      rowDiv.appendChild(keyEl);
    });

    container.appendChild(rowDiv);
  });

  container.__keys = [...container.querySelectorAll(".key")];
}

window.KEYBOARD_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["⌫","Z","X","C","V","B","N","M","ENTER"]
];

window.renderKeyboard = function ({
  state,
  container,
  pendingGuess,
  isGuesser,
  onInput
}) {
  if (!container.__keys) {
    buildKeyboard(container);
  }

  if (isGuesser) window.resetManualKeyColorsForRound?.(state);

  const guess = (pendingGuess || "").toUpperCase();

  for (const keyEl of container.__keys) {
    const symbol = keyEl.dataset.key;

    keyEl.classList.remove(
      "key-green",
      "key-yellow",
      "key-gray",
      "key-blue",
      "key-current",
      "key-uncertain",
      "key-purple",
      "key-manual",
      "key-swept"
    );
    delete keyEl.dataset.sweepOrder;

    // Special keys
    if (symbol === "⌫") {
      keyEl.onclick = () => onInput({ type: "BACKSPACE" });
      continue;
    }

    if (symbol === "ENTER") {
      keyEl.onclick = () => onInput({ type: "ENTER" });
      continue;
    }

    if (/^[A-Z]$/.test(symbol)) {
      const status = state.keyboard?.[symbol];

      // Guesser-only planning aid (see client/key-color-picker.js): a
      // real, known status always wins the instant it exists -- a stale
      // manual guess about a letter the game has since actually resolved
      // would be actively misleading left in place, so it's discarded
      // rather than shown alongside or on top of the real color.
      const manualColor = isGuesser
        ? window.getManualKeyColor?.(symbol)
        : null;

      if (manualColor && status) {
        window.clearManualKeyColor?.(symbol);
      }

      if (manualColor && !status) {
        keyEl.classList.add(`key-${manualColor}`, "key-manual");
      } else {
        if (status === "green") keyEl.classList.add("key-green");
        else if (status === "yellow") keyEl.classList.add("key-yellow");
        else if (status === "gray") keyEl.classList.add("key-gray");
        else if (status === "blue") keyEl.classList.add("key-blue");
      }

      // Count Only power: letter was guessed but its true color is
      // unknown — looks like an untouched key, plus a small "?" mark.
      // Suppressed once a manual color is set: showing "?" next to a
      // color the player just chose on purpose reads as a contradiction
      // instead of the reminder it's meant to be.
      if (!status && !manualColor && state.keyboardUncertain?.[symbol]) {
        keyEl.classList.add("key-uncertain");
      }

      // Create Dead Zone (blindSpot) power: this letter's only feedback so
      // far came from the hidden tile — match the tile's own purple
      // treatment instead of leaking its real color, until an unmasked
      // guess resolves it for real.
      if (!status && !manualColor && state.keyboardBlindSpot?.[symbol]) {
        keyEl.classList.add("key-purple");
      }

      // On the Secretkeeper keyboard, a letter that already has a known
      // green/yellow/gray/blue/purple/uncertain status keeps that status
      // without also receiving the red current-secret glow.
      const hasKnownFeedback = !!(
        status ||
        state.keyboardUncertain?.[symbol] ||
        state.keyboardBlindSpot?.[symbol]
      );

      if (
        guess.includes(symbol) &&
        (isGuesser || !hasKnownFeedback)
      ) {
        keyEl.classList.add("key-current");
      }

      // Letter Scan (letterProbe): mark the letters this turn's sweep
      // tested, in the order they were typed, so the guesser has a memory
      // aid for which keys were already checked (the game only reports an
      // aggregate count, never which ones hit). Guesser-only, same as the
      // info badge/popup this result already feeds.
      if (isGuesser) {
        const sweepLetters = state.powers?.letterProbeResult?.letters || "";
        const sweepIndex = sweepLetters.indexOf(symbol);
        if (sweepIndex !== -1) {
          keyEl.classList.add("key-swept");
          keyEl.dataset.sweepOrder = String(sweepIndex + 1);
        }
      }

      keyEl.onclick = () => onInput({ type: "LETTER", value: symbol });

      // Drag Mode (setter's secret draft, guesser's in-progress guess): a
      // plain tap still types normally (see drag-mode.js -- no real
      // pointer movement means no ghost element ever gets created, so
      // this is a no-op and the click above fires as usual); moving the
      // pointer before lifting instead drags the letter onto a specific
      // draft tile.
      if (!keyEl.__dragWired) {
        keyEl.__dragWired = true;
        keyEl.addEventListener("pointerdown", (e) => {
          window.beginKeyDrag?.(symbol, e.clientX, e.clientY, isGuesser ? "guesser" : "setter");
        });
      }

      // Guesser-only: hold the key for the green/yellow/not-in-word
      // color picker (see client/key-color-picker.js). Wired once per key
      // element just like drag above; never wired on the Secretkeeper's own
      // keyboard, which has no use for this.
      if (isGuesser && !keyEl.__longPressWired) {
        keyEl.__longPressWired = true;
        window.attachKeyLongPress?.(keyEl, symbol);
      }
    }
  }
};
