const { buildKeyboardState } = require("../game-engine/keyboardState");
const { buildSetterRemainingBoxState, buildGuesserRemainingBoxState } = require("./remainingWords");
const { buildConstraintData } = require("./constraintData");
const { computeLetterProfileStats } = require("./letterProfile");

function buildSafeStateForPlayer(state, userId, allowedSecrets) {
  const safe = JSON.parse(JSON.stringify(state));
  const viewerRole = state.players?.[userId]?.role ?? null;

  // Preserve externally-visible values explicitly
  safe.activePowers = state.activePowers;
  safe.powerCount = state.powerCount;

  if (state.revealGreenInfo) {
    safe.revealGreenInfo = state.revealGreenInfo;
  } else {
    delete safe.revealGreenInfo;
  }

  // Hide secret from guesser
  if (viewerRole === "guesser") {
    safe.secret = "";
    safe.aiSecretChanged = "";
  }

  // Hide guess from setter during simultaneous phase
  if (viewerRole === "setter" && state.phase === "simultaneous") {
    safe.pendingGuess = "";
  }

  // Draft Mode: don't let a player see the opponent's in-progress picks
  // before both sides lock in — the whole point is a simultaneous,
  // independent choice. Once the draft finalizes these keys are deleted
  // from state entirely, so there's nothing left to redact by then.
  if (state.phase === "draft") {
    if (safe.draftPicks) {
      safe.draftPicks = userId in safe.draftPicks
        ? { [userId]: safe.draftPicks[userId] }
        : {};
    }
  }

  if (viewerRole === "setter" && state.powers.betMissActive) {
    safe.betMissNumber = null;
  }

  // Stealth guess: hide current pending guess during decision step
  if (viewerRole === "setter" && state.powers.stealthGuessActive) {
    safe.pendingGuess = "?????";
  }

  // Clean internal power state
  delete safe.powers.currentHiddenIndices;
  delete safe.powers.hideTilePendingCount;
  delete safe._pendingPowerEvents;

  if (viewerRole === "guesser") {
    delete safe.powers.assassinWord;
  }

  // Informant peek is private to the guesser — the setter must not learn
  // which position is being watched (or the letter, which they know anyway).
  if (viewerRole !== "guesser") {
    delete safe.powers.revealLocationPeek;
    delete safe.powers.revealLocationPeekIndex;
  }

  // Letter Profile: the guesser's per-turn reveal (computed from the real
  // secret) is private to them — the setter gets their own live equivalent
  // below, computed from their own draft/secret instead.
  if (viewerRole !== "guesser") {
    delete safe.powers.letterProfileGuesserStat;
  }

  // Recon Sweep result is private to the guesser — the setter must never
  // learn which letters were tested or how many were present.
  if (viewerRole !== "guesser") {
    delete safe.powers.letterProbeResult;
  }

  // Double Tap: the setter may know the power fired (doubleGuessPending) but
  // must never see the hidden word, nor which of g1/g2 was the one shown.
  if (viewerRole === "setter") {
    delete safe.powers.doubleGuessHidden;
    delete safe.powers.doubleGuessShownFirst;
  }

  // Filter and sanitize history
  safe.history = safe.history
    .map((entry) => {
      if (!entry) return null;

      const e = JSON.parse(JSON.stringify(entry));

      if (!state.gameOver) {
        // Guesser view: masked feedback logic
        if (viewerRole === "guesser") {
          delete e.fb;

          if (!Array.isArray(e.fbGuesser) || e.fbGuesser.length !== 5) {
            e.fbGuesser = ["?", "?", "?", "?", "?"];
          }
        }

        // Stealth guess masking
        if (
          viewerRole === "setter" &&
          state.powers.stealthGuessActive &&
          e.stealthApplied
        ) {
          e.guess = "?????";
          if (Array.isArray(e.fb)) {
            e.fb = ["?", "?", "?", "?", "?"];
          }
        }

        // Double Tap: the setter sees only the SHOWN guess. The hidden one
        // is masked (word + feedback) but still occupies a row, so the
        // setter knows a second guess happened without learning what it was.
        if (viewerRole === "setter" && e.doubleGuessHidden) {
          e.guess = "?????";
          if (Array.isArray(e.fb)) e.fb = ["?", "?", "?", "?", "?"];
          e.powerUsed = (e.powerUsed || "") + " DoubleTap(hidden)";
        }

        // Recon Sweep result attached to this entry is private to the
        // guesser — the setter must never learn which letters were tested.
        if (viewerRole !== "guesser") {
          delete e.letterProbeResult;
        }

        // Tag applied powers
        if (e.blindSpotApplied != null) {
          e.powerUsed = (e.powerUsed || "") + " BlindSpot";
        }

        if (e.revealedOldSecret) {
          e.powerUsed =
            (e.powerUsed || "") +
            ` Reveal(${e.revealedOldSecret.toUpperCase()})`;
        }

        // Setter view: always sees true feedback
        if (viewerRole === "setter") {
          if (!Array.isArray(e.fb) || e.fb.length !== 5) {
            if (Array.isArray(e.fbGuesser)) {
              e.fb = e.fbGuesser;
            } else {
              e.fb = ["?", "?", "?", "?", "?"];
            }
          }
        }

        // Hide finalSecret until after gameOver
        delete e.finalSecret;
      } else {
        // After game over, true reveal for everyone
        delete e.fbGuesser;
      }

      delete e.ignoreConstraints;
      return e;
    })
    .filter((e) => e !== null);

  const keyboardState = buildKeyboardState(safe);
  safe.keyboard = keyboardState.keyboard;
  safe.keyboardUncertain = keyboardState.uncertain;

  if (viewerRole === "setter") {
    // emitRoomState() (the generic broadcast used almost everywhere) never
    // threads the allowed-secrets list through — only the dedicated
    // setterDraftSecret live-preview path does. Fall back to the global
    // list loaded at startup so the box has real data on every broadcast,
    // not just while actively typing a draft.
    const secrets =
      Array.isArray(allowedSecrets) && allowedSecrets.length
        ? allowedSecrets
        : global.ALLOWED_SECRETS;

    safe.setterRemainingBox = buildSetterRemainingBoxState(
      state,
      userId,
      secrets,
      state.setterDraft
    );
  }

  // Letter Profile (setter): a live readout of their OWN secret's
  // breakdown — no leak risk, it's their own word. Falls back to the
  // already-committed secret while the draft is incomplete (< 5 letters),
  // matching the same "keep showing the last real word" feel as the
  // dedicated live-keystroke path in socketHandlers.js's setterDraftSecret
  // handler, which this is the fallback for on any OTHER broadcast (a
  // power use, a reconnect, etc.) that doesn't go through that handler.
  if (viewerRole === "setter" && state.activePowers?.includes("letterProfile")) {
    const word =
      state.setterDraft && state.setterDraft.length === 5
        ? state.setterDraft
        : state.secret;
    safe.setterLetterProfile = computeLetterProfileStats(
      word,
      state.powers?.letterProfileMode
    );
  }

  // Wiretap (guesser): show the guesser the same remaining-secrets count
  // the setter sees, at the start of each normal-round turn.
  if (viewerRole === "guesser" && state.activePowers?.includes("wiretap")) {
    const secrets =
      Array.isArray(allowedSecrets) && allowedSecrets.length
        ? allowedSecrets
        : global.ALLOWED_SECRETS;
    safe.guesserRemainingBox = buildGuesserRemainingBoxState(state, secrets);
  }

  safe.constraintData = buildConstraintData(safe, viewerRole);

  return safe;
}

module.exports = { buildSafeStateForPlayer };
