const { buildKeyboardState } = require("../game-engine/keyboardState");
const { buildSetterRemainingBoxState, buildGuesserRemainingBoxState } = require("./remainingWords");
const { buildConstraintData } = require("./constraintData");
const { computeLetterProfileStats } = require("./letterProfile");
const { guesserVisibleHistoryCount } = require("./delayedFeedback");
const singlePlayerHooks = require("../single-player/hooks");

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
    if (safe.draftQuestPicks) {
      safe.draftQuestPicks = userId in safe.draftQuestPicks
        ? { [userId]: safe.draftQuestPicks[userId] }
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
  delete safe._pendingPowerEvents;
  delete safe._turnClock;

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

  // Setter Quest: the hint (letter + required position) is private to the
  // setter -- the guesser must never learn what would advance their
  // opponent's quest.
if (
    viewerRole !== "setter" &&
    safe.powers
  ) {
    delete safe.powers.spyCharge;
  }

  // power-choice-mode-v2.2: keep each charge private and hide unselected cards.
  if (safe.powerChoice) {
    if (userId !== state.setter) delete safe.powerChoice.spy;
    if (userId !== state.guesser) delete safe.powerChoice.inspector;
    const pending = safe.powerChoice.pendingChoice;
    if (pending && pending.ownerUserId !== userId) {
      safe.powerChoice.pendingChoice = {
        id: pending.id,
        ownerUserId: pending.ownerUserId,
        role: pending.role,
        threshold: pending.threshold,
        title: pending.title,
        choosing: true
      };
    }
  }
  // Delayed Intel (setter power): how many of the TRUE history entries the
  // guesser currently has real information about — computed once here
  // (not per-entry) since it depends only on state.history.length /
  // state.pendingGuess, not on anything entry-specific.
  const guesserVisibleCount = guesserVisibleHistoryCount(state);

  // Filter and sanitize history
  safe.history = safe.history
    .map((entry, idx) => {
      if (!entry) return null;

      const e = JSON.parse(JSON.stringify(entry));

      if (!state.gameOver) {
        // Guesser view: masked feedback logic
        if (viewerRole === "guesser") {
          delete e.fb;

          if (!Array.isArray(e.fbGuesser) || e.fbGuesser.length !== 5) {
            e.fbGuesser = ["?", "?", "?", "?", "?"];
          }

          // Delayed Intel: this round hasn't "unlocked" for the guesser
          // yet (see delayedFeedback.js) — withhold the real fbGuesser
          // the same way as the missing-data case above, but tag the
          // entry so the client can render an honest "not revealed yet"
          // tile instead of whatever the generic feedback-symbol fallback
          // would otherwise show for a placeholder value.
          if (idx >= guesserVisibleCount) {
            e.fbGuesser = ["?", "?", "?", "?", "?"];
            e.delayedFeedback = true;
          }
        }

        // Stealth guess: e.stealthApplied entries are never masked here.
        // The only window this power actually protects is the setter's
        // Keep/New decision that immediately follows the hidden guess --
        // and that's covered separately, above, by masking the LIVE
        // safe.pendingGuess while state.powers.stealthGuessActive is still
        // true. This history entry doesn't even exist yet at that point:
        // finalizeFeedback() (which creates it, and is what sets
        // stealthApplied via postScore) only runs once the setter has
        // already submitted that secret, so by the time this entry can
        // ever reach a client, the decision it was meant to protect is
        // already locked in. Masking it here too used to hide it forever,
        // which no longer protected anything and just left the setter
        // unable to review that round's real result.
        //
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
  safe.keyboardBlindSpot = keyboardState.blind;

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
      "vowels"
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

  // state.singlePlayer (when present) carries campaign internals -- the
  // precomputed round plan, the full stage definition including future AI
  // scripted secrets/guesses -- that the JSON clone above just copied
  // through verbatim. Replace it with the redacted client snapshot rather
  // than ever letting the raw object reach a client.
  delete safe.singlePlayer;
  const singlePlayerSnapshot = singlePlayerHooks.buildSnapshot(state, userId);
  if (singlePlayerSnapshot) safe.singlePlayer = singlePlayerSnapshot;

  return safe;
}

module.exports = { buildSafeStateForPlayer };
