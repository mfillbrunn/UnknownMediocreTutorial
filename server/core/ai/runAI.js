// core/ai/runAI.js

const { getAI } = require("./aiDifficulty");
const { applyAIAction } = require("./aiActions");
const powerMetadata = require("../../powers/powerMetadata");
const { isPowerAllowed } = require("../../powers/POWER_RULES");
const { pickLetterLockoutLetter, pickReconSweepLetters, feasibleSecretsFor } = require("./genericAI");

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

  // Marked Weakness (revealPenalty) rewards the SETTER with bonus score
  // for every occurrence of the revealed letter in their own secret (see
  // revealPenaltyServer.js / the power's description) — so deliberately
  // revealing a letter that IS in the secret is a bet in the setter's
  // favor, not against it. Held back until the guesser already has at
  // least 3 colored (green/yellow) tiles: early in the round that same
  // reveal would hand over a disproportionate amount of fresh
  // information for the guaranteed bonus to be worth it.
  revealPenalty: (state) => countColoredTiles(state) >= 3,

  // Inside Job (magicMode) converts this guess's own yellow tiles into
  // green constraints — it only has something to work with once the AI
  // already has real yellow letters in play to potentially re-place.
  magicMode: (state) => countKnownYellowLetters(state) >= 2
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
    // exact "known" set here. Deliberately pick a letter that IS in the
    // setter's own secret: the power rewards the SETTER with bonus score
    // for every occurrence of the revealed letter in the final secret
    // (see powerMetadata's description) — revealing a true letter is a
    // bet in the setter's own favor, not a risk. EXTRA_ELIGIBILITY above
    // already holds this power back until the guesser has enough info
    // that the reveal isn't giving away more than they could already
    // suspect. If every letter in the secret is already known, there's no
    // safe/useful reveal left — skip rather than fall back to gambling on
    // a random unknown letter.
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
      // freezeActive, just from a different rule. stealthGuessActive
      // means THIS pendingGuess is hidden from the setter — safeState.js
      // already masks it to "?????" for a human's client
      // (safe.pendingGuess), but the AI reads room.state directly, so
      // without this check it would see the real guess straight through
      // its own opponent's power. There's no informed basis to switch
      // without seeing what was guessed, so keep — same call a blind
      // human would reasonably make.
      if (
        state?.powers?.freezeActive ||
        state.simultaneousAllWrong ||
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
  }, aiDelay());
}

module.exports = {
  maybeRunAI,
  buildPowerAction,
  computeAIActionForUser,
  pickPriorityPower,
  pickRandomUsablePower,
  isPowerContextuallyUsable
};
