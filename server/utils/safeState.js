const { buildKeyboardState } = require("../game-engine/keyboardState");
const { buildSetterRemainingBoxState } = require("./remainingWords");
const { buildConstraintData } = require("./constraintData");

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

  safe.keyboard = buildKeyboardState(safe);

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
      secrets
    );
  }

  safe.constraintData = buildConstraintData(safe, viewerRole);

  return safe;
}

module.exports = { buildSafeStateForPlayer };
