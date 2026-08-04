// core/ai/runAI.js

const { getAI } = require("./aiDifficulty");
const { applyAIAction } = require("./aiActions");
const powerMetadata = require("../../powers/powerMetadata");
const { isPowerAllowed } = require("../../powers/POWER_RULES");
const { pickLetterLockoutLetter, pickReconSweepLetters, feasibleSecretsFor } = require("./genericAI");
const questServer = require("../../powers/powers/questServer");

// assassinWord is excluded from the game's randomized power pools
// entirely (see task #106) — kept out of the AI pool too for the same
// reason. revealHistory (Solve Cold Case) used to be excluded as well,
// but there's no actual reason to: it's a self-contained reveal with no
// extra payload needed, so the AI can fire it exactly like a human would.
// revealLetter (Confirm Lead) is excluded by explicit request — its
// unlock conditions (typing patterns like alphabetical/doubled-letter
// guesses across several turns) aren't worth bending the AI's normal
// guessing strategy to chase.
const FORBIDDEN_AI_POWERS = new Set([
  "assassinWord",
  "revealLetter"
]);

// Powers whose value depends on context beyond "is it my turn and have I
// not used it yet" (which isPowerAllowed already covers) — an extra check
// per power, applied both when picking a power at random and when
// deciding whether to prioritize one. Absent from this map = no extra
// condition.
const EXTRA_ELIGIBILITY = {
  // Lockdown (freezeSecret) blocks the setter from submitting a NEW
  // secret — but simultaneousAllWrong (the opening guess missed
  // everything) already forces the setter to keep their secret on its
  // own. Using the power on top of that spends it for nothing.
  freezeSecret: (state) => !state.simultaneousAllWrong,

  // Marked Weakness (revealPenalty): the AI always claims truthfully (see
  // the picker below), which is never a bad bet for the setter -- accepted
  // or wrongly called, a true claim always nets the setter points. Held
  // back until the guesser already has at least 3 colored (green/yellow)
  // tiles: early in the round the same reveal would hand over a
  // disproportionate amount of fresh information for the guaranteed bonus
  // to be worth it.
  revealPenalty: (state) => countColoredTiles(state) >= 3,

  // Inside Job (magicMode) converts this guess's own yellow tiles into
  // green constraints — it only has something to work with once the AI
  // already has real yellow letters in play to potentially re-place.
  magicMode: (state) => countKnownYellowLetters(state) >= 2,

  // Break Cover (rouletteSecret) forces the setter's next secret to be a
  // random new one -- which directly collides with simultaneousAllWrong
  // (the opening guess missed everything, locking the setter into keeping
  // their secret this round). normal.js lets the power override that lock
  // rather than leaving the setter stuck, but there's no upside to the AI
  // deliberately picking that fight: the setter was already locked into
  // the same secret regardless, so using the power here spends it for a
  // forced switch that teaches the guesser nothing it didn't already know.
  rouletteSecret: (state) => !state.simultaneousAllWrong
};

function countColoredTiles(state) {
  let count = 0;
  for (const h of state.history ?? []) {
    if (!h?.fb) continue;
    for (const c of h.fb) {
      if (c === "🟩" || c === "🟨") count++;
    }
  }
  return count;
}

function countKnownYellowLetters(state) {
  const yellows = new Set();
  for (const h of state.history ?? []) {
    const fb = h?.fbGuesser ?? h?.fb;
    if (!fb || !h?.guess) continue;
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟨") yellows.add(h.guess[i]?.toUpperCase());
    }
  }
  return yellows.size;
}

function getAIRole(state, aiUserId) {
  return state.players?.[aiUserId]?.role ?? null;
}

// Custom mode: state.activePowers is the UNION of both players' loadouts
// for the current round (see competitiveMode.js's computeCustomActivePowers)
// -- an AI only actually owns whatever's in its OWN loadout for its current
// role, same restriction normal.js's USE_ handler enforces for humans.
function aiOwnsPowerInCustomMode(state, aiUserId, aiRole, powerId) {
  if (!state.customPowersMode) return true;
  const loadout = state.customPlayerPowers?.[aiUserId];
  const pool = aiRole === "setter" ? loadout?.setterPowers : loadout?.guesserPowers;
  return !!pool?.includes(powerId);
}

function isPowerContextuallyUsable(powerId, state, aiRole, aiUserId) {
  if (FORBIDDEN_AI_POWERS.has(powerId)) return false;

  const meta = powerMetadata[powerId];
  if (!meta || meta.role !== aiRole) return false;

  if (!aiOwnsPowerInCustomMode(state, aiUserId, aiRole, powerId)) return false;

  if (!isPowerAllowed(powerId, state)) return false;

  const extra = EXTRA_ELIGIBILITY[powerId];
  if (extra && !extra(state)) return false;

  return true;
}

function pickRandomUsablePower(state, aiRole, aiUserId) {
  if (state.powerUsedThisTurn) return null;
  if (!Array.isArray(state.activePowers) || state.activePowers.length === 0) {
    return null;
  }

  const usable = state.activePowers.filter((powerId) =>
    isPowerContextuallyUsable(powerId, state, aiRole, aiUserId)
  );

  if (!usable.length) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}

// Some powers are strongest used the instant they're available rather
// than left to the normal 50% "use any active power" coin flip below —
// this bypasses that roll for them specifically. Create Dead Zone and
// Field Report are always grabbed on the first eligible turn; Solve Cold
// Case only gets a 50/50 shot at jumping the queue each turn (it's still
// useful later, so there's less urgency).
const ASAP_ALWAYS = new Set(["blindSpot", "fieldReport"]);
const ASAP_COINFLIP = new Set(["revealHistory"]);

function pickPriorityPower(state, aiRole, aiUserId) {
  if (state.powerUsedThisTurn) return null;
  if (!Array.isArray(state.activePowers)) return null;

  for (const powerId of state.activePowers) {
    if (ASAP_ALWAYS.has(powerId) && isPowerContextuallyUsable(powerId, state, aiRole, aiUserId)) {
      return powerId;
    }
  }
  for (const powerId of state.activePowers) {
    if (
      ASAP_COINFLIP.has(powerId) &&
      isPowerContextuallyUsable(powerId, state, aiRole, aiUserId) &&
      Math.random() < 0.5
    ) {
      return powerId;
    }
  }
  return null;
}

function toUpperSnake(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

// Some guesser powers need a payload built by the AI, not just a bare
// USE_<POWER> action. Returns the full action to dispatch.
function buildPowerAction(powerId, state, context) {
  const type = `USE_${toUpperSnake(powerId)}`;

  if (powerId === "doubleGuess") {
    const aiLogic = getAI(state);
    const g1 = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
    let g2 = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
    // Ensure the two guesses differ; fall back to any other valid word.
    if (!g2 || g2 === g1) {
      const alt = (context.WORDS.guesses || []).find(
        (r) => r.word !== g1
      );
      if (alt) g2 = alt.word;
    }
    if (!g1 || !g2 || g1 === g2) return null; // can't form two distinct guesses
    return { type, guess1: g1, guess2: g2 };
  }

  if (powerId === "hideTile") {
    // Human players pick a letter on their own keyboard to reset; the AI
    // picks one itself. Only letters with existing (non-erased) feedback
    // are actually useful -- anything else gets rejected server-side and
    // wastes the charge. Prefer a letter that isn't already fully green
    // (still ambiguous/useful to erase) over one that's fully solved.
    const withFeedback = new Set();
    const notFullyGreen = new Set();
    for (const entry of state.history ?? []) {
      const guess = (entry.guess || "").toUpperCase();
      const fb = entry.fb ?? entry.fbGuesser;
      if (!Array.isArray(fb)) continue;
      for (let i = 0; i < guess.length; i++) {
        if (!fb[i]) continue;
        withFeedback.add(guess[i]);
        if (fb[i] !== "🟩") notFullyGreen.add(guess[i]);
      }
    }
    const pool = [...(notFullyGreen.size ? notFullyGreen : withFeedback)];
    if (!pool.length) return null;
    const letter = pool[Math.floor(Math.random() * pool.length)];
    return { type, letter };
  }

  if (powerId === "letterProbe") {
    // Recon Sweep tests any 5 letters — probe the letters most common
    // among the remaining feasible secrets instead of reusing a normal
    // dictionary guess (which may not even touch an untested letter).
    const letters = pickReconSweepLetters(state, context.WORDS.secrets);
    if (!letters || letters.length !== 5) return null;
    return { type, letters };
  }

  if (powerId === "letterLockout") {
    const letter = pickLetterLockoutLetter(state, context.WORDS.secrets);
    if (!letter) return null;
    return { type, letter };
  }

  if (powerId === "revealPenalty") {
    // revealPenaltyServer.js rejects any letter already confirmed green/
    // yellow/gray, or already forced via another power — mirror that
    // exact "known" set here. Always claims TRUTHFULLY (a real letter from
    // the setter's own secret): under this power's payoff structure a
    // true claim is never worse for the setter than a bluff would be
    // (accepted, it scores the same either way; called, a true claim
    // scores DOUBLE while a bluff scores nothing and hands the guesser a
    // free letter) — so bluffing is a strictly worse bet than the truth
    // here, not worth modeling. If every letter in the secret is already
    // known, there's no safe/useful claim left — skip rather than gamble
    // on an unknown letter.
    const known = new Set();
    for (const past of state.history ?? []) {
      if (!past?.fb) continue;
      for (let i = 0; i < 5; i++) {
        if (past.fb[i] === "🟩" || past.fb[i] === "🟨" || past.fb[i] === "⬛") {
          known.add(past.guess[i]);
        }
      }
    }
    for (const c of state.extraConstraints ?? []) {
      if (c.letter) known.add(c.letter.toUpperCase());
    }
    const secretLetters = [...new Set((state.secret || "").toUpperCase().split(""))];
    const available = secretLetters.filter((l) => !known.has(l));
    if (!available.length) return null;
    const letter = available[Math.floor(Math.random() * available.length)];
    return { type, letter };
  }

  if (powerId === "betMiss") {
    // Needs a betMissNumber (0-5) or betMissServer.js's postScore bails
    // out on `typeof betMissNumber !== "number"` and the bet is wasted.
    // No direct signal about the upcoming guess exists yet (this runs
    // before it's picked), but the most recent guess's own miss (⬛)
    // count is a reasonable anchor — as the round narrows down, guesses
    // tend to land close to the last one's miss count, sometimes one
    // fewer as another letter gets confirmed. A 50/50 between those two
    // anchors beats a uniform blind 0-5 guess.
    const lastEntry = state.history?.[state.history.length - 1];
    const lastFb = lastEntry?.fbGuesser ?? lastEntry?.fb;
    const anchor = Array.isArray(lastFb)
      ? lastFb.filter((c) => c === "⬛").length
      : 3;
    const betMissNumber = Math.random() < 0.5 ? anchor : Math.max(0, anchor - 1);
    return { type, betMissNumber };
  }

  return { type };
}

function maybeUsePower(room, state, aiUserId, roomId, context, isTutorial) {
  const aiRole = getAIRole(state, aiUserId);
  if (!aiRole) return false;
  if (state.powerUsedThisTurn) return false;

  // Power tutorial (tutorialStage "power"): round 1 has the human use the
  // power being taught in its native role; round 2 swaps roles so the AI
  // now holds that same role and must actually demonstrate the power
  // being used against the human, not roll dice on whether to bother.
  // Checking the power's own role against the AI's CURRENT role is what
  // naturally scopes this to round 2 only -- in round 1 the AI holds the
  // other role, so the check below is false and this is a no-op. Bypasses
  // both the isTutorial early-return right below (which otherwise blocks
  // ALL AI power use during scripted turns) and the normal 50% random-use
  // roll further down, since demonstrating it IS the point of the round.
  if (
    state.isTutorial &&
    state.tutorialStage === "power" &&
    state.tutorialPowerId &&
    powerMetadata[state.tutorialPowerId]?.role === aiRole &&
    isPowerAllowed(state.tutorialPowerId, state)
  ) {
    const forcedAction = buildPowerAction(state.tutorialPowerId, state, context);
    if (forcedAction) {
      applyAIAction(room, forcedAction, aiUserId, roomId, context);
      return true;
    }
  }

  // No powers are active during the tutorial — nothing to do.
  if (isTutorial) return false;

  const priorityPowerId = pickPriorityPower(state, aiRole, aiUserId);
  if (priorityPowerId) {
    const priorityAction = buildPowerAction(priorityPowerId, state, context);
    if (priorityAction) {
      applyAIAction(room, priorityAction, aiUserId, roomId, context);
      return true;
    }
  }

  if (Math.random() > 0.5) return false;

  const powerId = pickRandomUsablePower(state, aiRole, aiUserId);
  if (!powerId) return false;

  const powerAction = buildPowerAction(powerId, state, context);
  if (!powerAction) return false;

  applyAIAction(room, powerAction, aiUserId, roomId, context);

  return true;
}

const AI_PENDING = new Set();

function aiDelay({ base = 1500, variance = 1200 } = {}) {
  return Math.min(base + Math.random() * variance, 2500);
}
function aiDelayForState(
  state,
  aiUserId
) {
  const aiRole =
    getAIRole(
      state,
      aiUserId
    );

  const isAdvancedNotesPractice =
    state.isTutorial &&
    state.tutorialStage === "advanced" &&
    aiRole === "guesser" &&
    state.phase === "normal" &&
    state.turn === aiUserId &&
    !state.pendingGuess &&
    state.history?.length === 1;

  return isAdvancedNotesPractice
    ? 18000
    : aiDelay();
}
// Decides what a given seat's AI-controlled player should do right now, but
// doesn't execute it — returns the action closure (or null if there's
// nothing to do) so callers can choose how/when to run it. maybeRunAI below
// is the real-game caller: it schedules the result behind aiDelay() so a
// live opponent feels like it's "thinking". The power-simulation runner
// (core/simulation/runPowerSimulation.js) is the other caller — it needs
// the exact same guess/secret/power-usage logic for BOTH simulated seats,
// synchronously and with no artificial delay, so it calls this directly
// instead of going through the real-game scheduling path.
function computeAIActionForUser(room, roomId, context, aiUserId) {
  const state = room.state;
  const aiLogic = getAI(state);
  const aiRole = getAIRole(state, aiUserId);
  if (!aiRole) return null;

  maybeClaimQuest(room, roomId, context, aiUserId);
  maybeRespondToClaim(room, roomId, context, aiUserId);

  let actionFn = null;

  const isTutorial =
    state.isTutorial && state.history.length < state.scriptedTurns;

  // -----------------------------
  // NORMAL PHASE
  // -----------------------------
  if (state.phase === "normal" && state.turn === aiUserId) {
    if (aiRole === "guesser" && !state.pendingGuess) {
      actionFn = () => {
        maybeUsePower(room, state, aiUserId, roomId, context, isTutorial);

        // Double Tap (and any future turn-consuming guesser power) already
        // submitted the guesses and handed the turn to the setter — don't
        // also fire a normal guess on top of it.
        if (state.pendingGuess || state.turn !== aiUserId || state.gameOver) {
          return;
        }

        let guess = aiLogic.pickGuess(
          state,
          context.WORDS.guesses,
          context.WORDS.secrets
        );

        if (isTutorial) {
          guess = state.tutorialGuessesAI[state.history.length];
        } else if (state.isTutorial && Array.isArray(state.tutorialGuessesAIExtra)) {
          // A few more scripted guesses right after the scriptedTurns
          // window closes (see tutorialMode.js) -- indexed relative to
          // where that window left off, not from history.length directly.
          const extraIndex = state.history.length - state.scriptedTurns;
          if (extraIndex >= 0 && extraIndex < state.tutorialGuessesAIExtra.length) {
            guess = state.tutorialGuessesAIExtra[extraIndex];
          }
        }

        applyAIAction(
          room,
          { type: "SUBMIT_GUESS", guess },
          aiUserId,
          roomId,
          context
        );
      };
    }

    if (aiRole === "setter" && state.pendingGuess) {
      // simultaneousAllWrong: the opening guess missed every letter, so
      // the setter is locked into keeping that same secret this round
      // (server rejects SET_SECRET_NEW while this is set) — same as
      // freezeActive, just from a different rule. Unless the guesser used
      // Break Cover (rouletteSecret), which explicitly overrides that lock
      // (see normal.js) and forces a new secret instead — the AI has to
      // follow the same override a human setter now can, or the power
      // would silently do nothing against an AI opponent.
      // stealthGuessActive means THIS pendingGuess is hidden from the
      // setter — safeState.js already masks it to "?????" for a human's
      // client (safe.pendingGuess), but the AI reads room.state directly,
      // so without this check it would see the real guess straight through
      // its own opponent's power. There's no informed basis to switch
      // without seeing what was guessed, so keep — same call a blind
      // human would reasonably make.
      if (
        state?.powers?.freezeActive ||
        (state.simultaneousAllWrong && !state.powers?.rouletteSecretActive) ||
        state?.powers?.stealthGuessActive
      ) {
        actionFn = () => {
          maybeUsePower(room, state, aiUserId, roomId, context, isTutorial);

          applyAIAction(
            room,
            { type: "SET_SECRET_SAME" },
            aiUserId,
            roomId,
            context
          );
        };
      } else {
        actionFn = () => {
          maybeUsePower(room, state, aiUserId, roomId, context, isTutorial);

          let secret = aiLogic.pickSecret(state, context.WORDS.secrets);

          if (isTutorial) {
            secret = state.tutorialSecretsAI[state.history.length];
          }

          applyAIAction(
            room,
            { type: "SET_SECRET_NEW", secret },
            aiUserId,
            roomId,
            context
          );
        };
      }
    }
  }

  // -----------------------------
  // SIMULTANEOUS PHASE
  // -----------------------------
  if (!actionFn && state.phase === "simultaneous") {
    if (aiRole === "guesser" && !state.simultaneousGuessSubmitted) {
      actionFn = () => {
        let guess = aiLogic.pickGuess(
          state,
          context.WORDS.guesses,
          context.WORDS.secrets
        );

        if (isTutorial) {
          guess = state.tutorialGuessesAI[0];
        }

        // Daily Challenge: same opening guess for every player that day
        // (see dailyConfig.js/lobby.js's SET_DAILY_POWERS) -- only the
        // very first, un-informed guess is pinned; anything after reacts
        // normally to feedback like any other AI guess.
        if (state.isDaily && state._dailyOpeningGuess && !state.history.length) {
          guess = state._dailyOpeningGuess;
        }

        applyAIAction(
          room,
          { type: "SUBMIT_GUESS", guess },
          aiUserId,
          roomId,
          context
        );
      };
    }

    if (aiRole === "setter" && !state.simultaneousSecretSubmitted) {
      actionFn = () => {
        let secret = aiLogic.pickSecret(state, context.WORDS.secrets);

        if (isTutorial) {
          secret = state.tutorialSecretsAI[0];
        }

        // Daily Challenge: the word every player that day has to guess is
        // the same (see the matching comment on the guesser branch above).
        if (state.isDaily && state._dailySecret && !state.history.length) {
          secret = state._dailySecret;
        }

        applyAIAction(
          room,
          { type: "SET_SECRET_NEW", secret },
          aiUserId,
          roomId,
          context
        );
      };
    }
  }

  return actionFn;
}

// The quest badge now requires an explicit click to claim either reward
// (see questServer.js's attemptQuestClaim) -- a real human just taps it,
// so give the AI the equivalent: as soon as its quest is ready, claim the
// green letter immediately, no "thinking" delay needed since there's no
// real decision here. Deliberately doesn't take the early-yellow trade —
// that's a judgment call (forfeit a guaranteed green for an earlier
// yellow) not worth modeling, and the AI never took it before this
// feature existed either. Lives in computeAIActionForUser (rather than
// maybeRunAI) so the power-simulation runner, which calls that directly
// for both simulated seats, gets it too.
function maybeClaimQuest(room, roomId, context, aiUserId) {
  const state = room.state;
  const aiRole = getAIRole(state, aiUserId);
  if (aiRole !== "guesser") return;
  // Only claim on the AI's OWN turn. A human taps the quest badge during
  // their turn; the AI was claiming the instant the quest went ready --
  // which is at the end of its guess, i.e. during the SETTER's (the human's)
  // turn -- so from the human's side the reward popped up mid-their-turn,
  // out of nowhere. Deferring to the AI's next turn matches how a human
  // would claim it and keeps the reward landing right before the AI's next
  // guess (where it's actually useful) instead of on the opponent's clock.
  if (state.turn !== aiUserId) return;
  const q = state.powers?.quest;
  if (!q?.type || q.used || !q.ready) return;
  applyAIAction(room, { type: "USE_QUEST" }, aiUserId, roomId, context);
}

// Marked Weakness: the AI has no real way to know if the setter's claim is
// true (that's the whole point), so it estimates from what it can see --
// among the secrets still consistent with its own guess feedback, what
// fraction actually contain the claimed letter. Accepting always costs 1
// point; calling costs 2 if the claim turns out true, or nets a free
// letter (and costs nothing) if it was a bluff. Expected cost of calling
// is 2 * P(true), which beats accepting's flat 1 exactly when P(true) <
// 0.5 -- so call when the claim looks unlikely, accept when it looks
// credible. Same computeAIActionForUser placement as maybeClaimQuest, for
// the same reason (power-simulation runner needs it too).
function maybeRespondToClaim(room, roomId, context, aiUserId) {
  const state = room.state;
  const aiRole = getAIRole(state, aiUserId);
  if (aiRole !== "guesser") return;

  const p = state.powers;
  if (!p?.revealPenaltyUsed || p.revealPenaltyResolved) return;

  const feasible = feasibleSecretsFor(state, context.WORDS.secrets);
  if (!feasible.length) return;

  const letter = p.revealPenaltyLetter;
  const containingFraction =
    feasible.filter(r => r.word.includes(letter)).length / feasible.length;

  const accept = containingFraction >= 0.5;
  applyAIAction(
    room,
    { type: accept ? "USE_REVEAL_PENALTY_ACCEPT" : "USE_REVEAL_PENALTY_CALL" },
    aiUserId,
    roomId,
    context
  );
}

function maybeRunAI(room, roomId, context) {
  const state = room.state;

  const aiPlayer = Object.values(room.playersByUserId || {}).find((p) => p.isAI);
  if (!aiPlayer) return;

  const aiUserId = aiPlayer.userId;
  if (AI_PENDING.has(roomId)) return;

  const actionFn = computeAIActionForUser(room, roomId, context, aiUserId);
  if (!actionFn) return;

  AI_PENDING.add(roomId);

  setTimeout(() => {
    AI_PENDING.delete(roomId);

    if (room.state !== state) return;
    if (state.gameOver) return;

    // This callback runs on its own tick, well after maybeRunAI's own
    // synchronous body returned — the try/catch around the *call* to
    // maybeRunAI() in socketHandlers.js can't see an exception thrown in
    // here. Node has no other handler for it either (uncaughtException
    // just kills the process), so a single bad AI move used to take down
    // the whole server and disconnect every connected player. Contain it.
    try {
      actionFn();
    } catch (err) {
      console.error("AI action crashed:", err);
    }
}, aiDelayForState(
  state,
  aiUserId
));
}

module.exports = {
  maybeRunAI,
  buildPowerAction,
  computeAIActionForUser,
  pickPriorityPower,
  pickRandomUsablePower,
  isPowerContextuallyUsable
};
