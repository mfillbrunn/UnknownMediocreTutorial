// client/summary.js

// Marked Weakness summary line -- shared by the match summary (state.powers)
// and each archived round's history block (round.powers). Always resolved
// immediately in play (see revealPenaltyServer.js's resolveClaim), so this
// just recaps whichever of the three outcomes already happened; if the
// guesser never responded before the round ended, there's nothing to show.
function formatRevealPenaltySummary(powers, noteClass = "reveal-penalty-summary") {
  if (!powers?.revealPenaltyUsed || !powers.revealPenaltyResolved) return "";

  const letter = powers.revealPenaltyLetter;

  if (powers.revealPenaltyResult === "accepted") {
    return `<p class="${noteClass}">⚠️ The Spy claimed <b>${letter}</b> was in the secret — the Inspector accepted, adding <b>+1</b> guess.</p>`;
  }

  if (powers.revealPenaltyResult === "wrongCall") {
    return `<p class="${noteClass}">⚠️ The Spy claimed <b>${letter}</b> was in the secret — the Inspector called it, but it was true. <b>+2</b> guesses for the Spy.</p>`;
  }

  return `<p class="${noteClass}">⚠️ The Spy claimed <b>${letter}</b> was in the secret — the Inspector called the bluff, and caught it.</p>`;
}

///CALCULATE WINNER

// Points/time are tracked per user ID (the only identity that's stable
// across a match — roles swap every round). "A"/"B" were never real keys
// on state (state.roles/state.playerNames don't exist), which used to make
// this always resolve to a tie and every player name blank.
function computeMatchResult(state, viewerUserId) {
  const rounds = state.matchRounds || [];

  const points = {};
  const time = {};

  const addPoints = (id, n) => { if (id) points[id] = (points[id] || 0) + (n || 0); };
  const addTime = (id, n) => { if (id) time[id] = (time[id] || 0) + (n || 0); };

  rounds.forEach(r => {
    // The Spy (that round's setter) is credited with a point per guess it
    // took the Inspector to win.
    addPoints(r.setter, r.guessCount);
    for (const [uid, secs] of Object.entries(r.time || {})) {
      addTime(uid, secs);
    }
  });

  const playerIds = Object.keys(state.players || {});
  const [idA, idB] = playerIds;

  let winner = null;
  let tie = false;
  let winReason = "points";

  if (state.timeoutLoser) {
    winner = playerIds.find(id => id !== state.timeoutLoser) || null;
    winReason = "timeout";
  } else {
    const pA = points[idA] || 0;
    const pB = points[idB] || 0;
    if (pA > pB) {
      winner = idA;
    } else if (pB > pA) {
      winner = idB;
    } else {
      const tA = time[idA] || 0;
      const tB = time[idB] || 0;
      if (tA !== tB) {
        winner = tA <= tB ? idA : idB;
        winReason = "time";
      } else {
        tie = true;
        winReason = "tie";
      }
    }
  }

  const didWin = winner != null && viewerUserId != null && winner === viewerUserId;

  const winnerPoints = winner != null ? (points[winner] || 0) : (points[idA] || 0);
  const loserPoints = winner != null
    ? (points[winner === idA ? idB : idA] || 0)
    : (points[idB] || 0);

  const resultIcon =
    winReason === "tie"
      ? "🤝"
      : winReason === "timeout"
      ? "⏱️"
      : didWin
      ? "🏆"
      : "🥈";

  return {
    points,
    time,
    winner,
    tie,
    winReason,
    didWin,
    winnerPoints,
    loserPoints,
    resultIcon
  };
}

function getPlayerName(userId) {
  return (userId && state.players?.[userId]?.name) || "—";
}

function normalizePowerId(p) {
  return typeof p === "string" ? p : p?.id;
}

function powerToEmojiOnly(p) {
  const id = normalizePowerId(p);
  const meta = window.POWER_METADATA?.[id];
  return meta?.emoji || "";
}

// Per-turn power-use icons come from the history entry's powerEvents (each
// tagged with the role that triggered it), not a powersGuesser/powersSetter
// field — no such field is ever written server-side.
function powersUsedByRole(entry, role) {
  const events = Array.isArray(entry?.powerEvents) ? entry.powerEvents : [];
  return events
    .filter(e => e.actorRole === role)
    .map(e => powerToEmojiOnly(e.id))
    .filter(Boolean);
}

function powerToInlineIcon(powerId) {
  const meta = window.POWER_METADATA?.[powerId];
  if (!meta) return powerId;

  // Emoji-first for share text
  if (meta.emoji) return meta.emoji;

  // Fallback: short label
  return meta.label;
}

function powerToInlineLabel(powerId) {
  const meta = window.POWER_METADATA?.[powerId];
  if (!meta) return powerId;
  if (meta.label) return meta.label;
}



// Lines the Share button up with whichever heading is currently showing
// (the win/loss line in the match summary, "Round Summary" in the round
// summary) instead of it sitting on its own row above everything.
function positionShareButton() {
  const btn = $("shareResultBtn");
  const panel = btn?.closest(".panel");
  if (!btn || !panel) return;

  const heading = document.querySelector(
    "#roundSummary .match-header h2, #roundSummary .summary-heading"
  );
  if (!heading) {
    btn.style.top = "0";
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  const headingRect = heading.getBoundingClientRect();
  const top =
    headingRect.top - panelRect.top + headingRect.height / 2 - btn.offsetHeight / 2;
  btn.style.top = `${Math.max(0, top)}px`;
}

///SUMMARY SCREEN ROUTER
window.updateSummary = function updateSummary() {
  const container = $("roundSummary");
  const globalNewMatchBtn = $("newMatchBtn");

  if (!state || state.phase !== "gameOver") {
    container.innerHTML = "";
    if (globalNewMatchBtn) globalNewMatchBtn.classList.remove("hidden");
    return;
  }

  updateMenuRoomCode();

  if (state.gameOverView === "round") {
    if (globalNewMatchBtn) globalNewMatchBtn.classList.add("hidden");
    renderRoundSummary(container);
    return;
  }

  if (state.gameOverView === "match") {
    if (globalNewMatchBtn) globalNewMatchBtn.classList.add("hidden");
    renderMatchSummary(container);
    return;
  }
};


///MATCH SUMMARY
function renderMatchSummary(container) {
  const rounds = state.matchRounds || [];

  const {
    points,
    time,
    winner,
    winReason,
    didWin,
    winnerPoints,
    loserPoints,
    resultIcon
  } = computeMatchResult(state, myUserId());

  const playerIds = Object.keys(state.players || {});
  const opponentId = playerIds.find(id => id !== myUserId()) || null;
  const myName = getPlayerName(myUserId());
  const opponentName = getPlayerName(opponentId);

  let resultText;
  if (winReason === "timeout") {
    resultText = didWin
      ? `You won by timeout`
      : `You lost on time`;
  } else if (winReason === "tie") {
    resultText = `You tied`;
  } else {
    resultText = didWin
      ? `You won`
      : `You lost`;
  }

  // Just the numbers now -- shown large, right under the win/loss headline
  // (see the html below), so a "Score:"/"Final score (before timeout):"
  // prefix would be redundant; the timeout case is still called out
  // separately by timeoutNote further down.
  let scoreText = "";
  if (winner !== null) {
    scoreText = didWin
      ? `${winnerPoints} – ${loserPoints}`
      : `${loserPoints} – ${winnerPoints}`;
  }

  // Ranked matches get an Elo delta computed async (after the match's
  // profile rows are read/updated) and pushed in a follow-up broadcast —
  // may not have landed yet on the very first gameOver render, in which
  // case this just silently omits it until the next state update arrives.
  let eloHtml = "";
  const myEloChange = state.ranked ? state.eloChange?.[myUserId()] : null;
  if (typeof myEloChange === "number") {
    const sign = myEloChange > 0 ? "+" : "";
    const eloClass = myEloChange > 0 ? "elo-gain" : myEloChange < 0 ? "elo-loss" : "elo-even";
    eloHtml = `<p class="match-elo-change ${eloClass}">${sign}${myEloChange} Elo</p>`;
  }

  let timeoutNote = "";
  if (winReason === "timeout" && state.timeoutLoser) {
    const loserName = getPlayerName(state.timeoutLoser);
    timeoutNote = `
      <p class="timeout-note">
        ⏱ ${loserName} lost on time
      </p>
    `;
  }

  let assassinationNote = "";
  if (state.powers?.assassinWordassassinated) {
    assassinationNote = `
      <p class="assassination-note">
        ☠ Assassination triggered — instant loss
      </p>
    `;
  }

 // ----------------------------
// POWERS (icon + text, no "Setter/Guesser Powers:" label)
// ----------------------------
const { setter, guesser } =
  getActivePowersByRole(state.activePowers);

// The guesser's quest is always-on for the whole match (not part of
// activePowers -- see questServer.js's file header), so it's not picked
// up by getActivePowersByRole above; add it to the guesser list here.
const questType = state.powers?.quest?.type;
const questMeta = questType ? window.QUEST_METADATA?.[questType] : null;

const setterEntries = setter.map(p => `${powerToInlineIcon(p)} ${powerToInlineLabel(p)}`);
const guesserEntries = guesser.map(p => `${powerToInlineIcon(p)} ${powerToInlineLabel(p)}`);
if (questMeta) {
  guesserEntries.push(`${questMeta.emoji || "\uD83C\uDFAF"} ${questMeta.label}`);
}

let powersBlock = "";

if (setterEntries.length) {
  powersBlock += `
    <p class="match-power-line">
      <span class="power-label setter">
        ${setterEntries.join("\u00A0\u00A0")}
      </span>
    </p>
  `;
}

if (guesserEntries.length) {
  powersBlock += `
    <p class="match-power-line">
      <span class="power-label guesser">
        ${guesserEntries.join("\u00A0\u00A0")}
      </span>
    </p>
  `;
}


  // ----------------------------
  // Result header (lead with the outcome, not the actions) — room code
  // isn't repeated here, it's already shown in the app header above.
  // ----------------------------
  const resultClass = didWin ? "win" : winReason === "tie" ? "tie" : "loss";

  let html = `
    <div class="match-header match-header--${resultClass}">
      <h2>${resultText}</h2>
      ${scoreText ? `<p class="match-score-line">${scoreText}</p>` : ""}
      <p class="match-players-line">
        <span class="${didWin ? "me-winner" : ""}">${myName}</span>
        <span class="vs">vs</span>
        <span class="${!didWin && winner ? "me-winner" : ""}">${opponentName}</span>
      </p>
      ${eloHtml}
      ${timeoutNote}
      ${assassinationNote}
      ${
        winReason === "time"
          ? `<p class="tie-breaker">
               Tie on points. Winner by lower total time.
             </p>`
          : ""
      }
    </div>

    <div class="match-meta-row">
      <span class="match-meta-chip">
        ⏱ ${
          state.timeControl?.enabled
            ? state.timeControl.mode === "round"
              ? `${formatDuration(state.timeControl.roundSeconds)} / round`
              : `${formatDuration(state.timeControl.initialSeconds)} +${formatDuration(state.timeControl.incrementSeconds)}`
            : "No time"
        }
      </span>
    </div>

    ${powersBlock}
  `;

  // ----------------------------
  // Round summaries ONLY (table removed)
  // ----------------------------
  html += `
    <div id="roundDetails">
      ${rounds.map((r, i) => renderStoredRoundSummary(r, i)).join("")}
    </div>
  `;

  // ----------------------------
  // Tutorial 1 → Tutorial 2 handoff: offer the powers follow-up right
  // here instead of making the player find it again from How to Play.
  // ----------------------------
  const offerTutorial2 = state.isTutorial && state.tutorialStage !== 2;
  const tutorial2Cta = offerTutorial2
    ? `
      <div class="summary-actions">
        <button id="continueToTutorial2Btn" class="primary-btn">
          Continue to Tutorial 2: Powers ▶
        </button>
      </div>
    `
    : "";

  // ----------------------------
  // Actions (bottom, below the round details)
  // ----------------------------
  // Daily Challenge is a once-a-day, fixed-setup event -- New Match and
  // Replay don't apply (there's nothing to re-roll or replay into), so only
  // offer Leave (back to the menu, where the day's result/rankings live).
  const isDaily = !!state.isDaily;
  html += `
    ${tutorial2Cta}
    <div class="summary-actions">
      ${isDaily ? "" : `<button id="newMatchBtn" class="primary-btn">
        New Match
      </button>
      <button id="replayMatchBtn" class="secondary-btn">
        Replay
      </button>`}
      <button id="leaveSummaryBtn" class="secondary-btn danger">
        Leave
      </button>
    </div>
  `;

  container.innerHTML = html;
  positionShareButton();

  const continueTutorial2Btn = $("continueToTutorial2Btn");
  if (continueTutorial2Btn) {
    continueTutorial2Btn.onclick = () => {
      resetKeyboards();
      window.continueToTutorial2?.();
    };
  }

  const replayBtn = $("replayMatchBtn");
  if (replayBtn) {
    replayBtn.onclick = () => {
      resetKeyboards();
      // Same reasoning as newMatchBtn in socket-events.js: REPLAY_MATCH
      // also reuses this room without ever going through clearRoom(), so
      // transient client-only UI state has to be cleared here explicitly.
      window.resetTransientGameUI?.();
      sendGameAction({ type: "REPLAY_MATCH" });
    };
  }

  const leaveBtn = $("leaveSummaryBtn");
  if (leaveBtn) {
    leaveBtn.onclick = () => {
      byId("tutorialBubble")?.classList.add("hidden");

      socket.emit("leaveRoom", {}, () => {
        roomId = null;
        clearRoom();
        state = null;
        window.state = null;
        resetKeyboards();
        showStartup();
      });
    };
  }
}


/////////////////////////////////
/////////COMPETITIVE  ROUND SUMMARY
////////////////////////////
function renderRoundSummary(container) {
  let html = `<h3 class="summary-heading">Round Summary</h3>`;
  // The round that just ended is still reflected by state.setter/guesser —
  // roles swap for the *next* round only once NEXT_ROUND is sent.
  const setterName = getPlayerName(state.setter);
  const guesserName = getPlayerName(state.guesser);

if (state.timeoutLoser)  {
  const loserName = getPlayerName(state.timeoutLoser);

  const note ="(lost on time)";

  html += `
    <p class="timeout-summary">
      ⏱ ${loserName} ${note}
    </p>
  `;
}


  html += `
    <p class="summary-players">
      <b>${setterName}</b> (Spy) vs
      <b>${guesserName}</b> (Inspector)
    </p>
  `;
// ---- Round time used ----
const lastRound =
  state.matchRounds[state.matchRounds.length - 1];

const roundTimeA = lastRound?.time?.[state.setter] ?? 0;
const roundTimeB = lastRound?.time?.[state.guesser] ?? 0;

if (state.timeControl?.enabled) {
html += `
  <p class="round-time-summary">
  ⏱
  <span style="color: var(--setter-color); font-weight: 600;">
    ${setterName}
  </span>
  : <span class="time-value">
    ${formatDuration(roundTimeA)}
  </span>
  &nbsp;|&nbsp;
  <span style="color: var(--guesser-color); font-weight: 600;">
    ${guesserName}
  </span>
  : <span class="time-value">
    ${formatDuration(roundTimeB)}
  </span>
</p>
`;
}
  const lastEntry = state.history[state.history.length - 1];
  if (state.powers.assassinWordassassinated) {
    html += `
      <p class="assassin-summary">
        ☠ ${guesserName} guessed the assassin word
        "${state.powers.assassinWord.toUpperCase()}"
      </p>
    `;
  }
    html += formatRevealPenaltySummary(state.powers);

  html += `<p class="summary-guess-count"><b>Total guesses:</b> ${state.guessCount}</p>`;

  html += `
  <div class="summary-table-wrap">
  <table class="summary-table summary-table--round">
    <thead>
      <tr>
        <th>#</th>
        <th>Secret</th>
        <th>Guess</th>
        <th>Feedback</th>
        <th>Powers</th>
        <th>Secrets</th>
      </tr>
    </thead>
    <tbody>
`;

for (let i = 0; i < state.history.length; i++) {
  const h = state.history[i];
  const isFinal = i === state.history.length - 1;

  const secretCell = h.finalSecret
    ? h.finalSecret.toUpperCase()
    : "???";

  const guessCell = h.guess
    ? h.guess.toUpperCase()
    : "";

  const fbCell = Array.isArray(h.fb)
    ? h.fb.join("")
    : "";

  const gp = powersUsedByRole(h, "guesser");
  const sp = powersUsedByRole(h, "setter");

  let powersCell = "";
  if (gp.length || sp.length) {
    powersCell = `
      <div class="summary-powers compact">
        ${gp.length ? `
          <div class="powers-row guesser">
            ${gp.join("")}
          </div>` : ""}
        ${sp.length ? `
          <div class="powers-row setter">
            ${sp.join("")}
          </div>` : ""}
      </div>
    `;
  }

 const archivedEntry = lastRound?.history?.[i];
  const remaining = archivedEntry?.remainingAfter ?? (isFinal ? 0 : "?");

  html += `
    <tr class="${isFinal ? "final-row" : ""}">
      <td class="turn-index">${i + 1}</td>
      <td class="secret-cell">${secretCell}</td>
      <td class="guess-cell">${guessCell}</td>
      <td class="feedback-cell">${fbCell}</td>
      <td class="powers-cell">${powersCell}</td>
      <td class="remaining-cell">${remaining}</td>
    </tr>
  `;
}

html += `
    </tbody>
  </table>
  </div>
`;

  // Competitive mode: Next Round action, after the round's own details
  if (state.gameOverView === "round" && state.canNextRound) {
    html += `
      <div class="summary-actions">
        <button id="nextRoundBtn" class="primary-btn">
          Next Round
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
  positionShareButton();

  const btn = $("nextRoundBtn");
  if (btn) {
    btn.onclick = () => {
      resetKeyboards();
      sendGameAction({ type: "NEXT_ROUND" });
    };
  }
};

///////////////////////////////
///////////STORED ROUND DETAILS
/////////////////
function renderStoredRoundSummary(round, index) {

  let html = `
    <div class="stored-round" data-round-index="${index}">
      <h4>Round ${index + 1} – ${getPlayerName(round.setter)} was Spy</h4>

      <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
        <tr>
          <th>#</th>
          <th>Secret</th>
          <th>Guess</th>
          <th>Feedback</th>
          <th>Powers</th>
          <th>Secrets</th>
        </tr>
        </thead>
        <tbody>
  `;
  html += formatRevealPenaltySummary(round.powers, "round-note round-note--setter");

  round.history.forEach((h, i) => {
    const remaining = computeRemainingFromRound(round, i);

    const gpIcons = powersUsedByRole(h, "guesser");
    const spIcons = powersUsedByRole(h, "setter");

    let powersCell = "";
    if (gpIcons.length || spIcons.length) {
      powersCell = `
        <div class="summary-powers compact">
          ${gpIcons.length ? `
            <div class="powers-row guesser">
              ${gpIcons.join("")}
            </div>` : ""}
          ${spIcons.length ? `
            <div class="powers-row setter">
              ${spIcons.join("")}
            </div>` : ""}
        </div>
      `;
    }

    html += `
      <tr>
        <td>${i + 1}</td>
        <td class="secret-cell">${h.finalSecret?.toUpperCase() || "???"}</td>
        <td class="guess-cell">${h.guess?.toUpperCase() || ""}</td>
        <td class="feedback-cell">${Array.isArray(h.fb) ? h.fb.join("") : ""}</td>
        <td class="powers-cell">${powersCell}</td>
        <td>${remaining}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div></div>`;
  return html;
}



///// SHARE TEXT
function buildShareText(state, myRole) {
  const rounds = state.matchRounds || [];

  // -----------------------
  // Determine winner
  // -----------------------
  const {
  points,
  time,
  winner,
  winReason,
  winnerPoints,
  loserPoints,
  resultIcon
} = computeMatchResult(state, myUserId());
const finalWinner = winner;
const finalWinReason = winReason;
let assassinationLine = null;
if (state.powers?.assassinWordassassinated) {
  assassinationLine = "☠ Assassination triggered";
}

const playerIds = Object.keys(state.players || {});
const winnerName = winner != null ? getPlayerName(winner) : getPlayerName(playerIds[0]);
const loserName = winner != null
  ? getPlayerName(playerIds.find(id => id !== winner))
  : getPlayerName(playerIds[1]);

let winnerLabel;

if (finalWinReason === "timeout") {
  winnerLabel = `**${winnerName} (win by timeout)**`;
} else if (finalWinReason === "time") {
  winnerLabel = `**${winnerName} (win by tiebreaker)**`;
} else if (finalWinReason === "tie") {
  winnerLabel = `**${winnerName}**`;
} else {
  winnerLabel = `**${winnerName}**`;
}

  // -----------------------
  // Time control line
  // -----------------------
  let timeLine = "No time";
  if (state.timeControl?.enabled) {
    timeLine =
      state.timeControl.mode === "round"
        ? `${formatDuration(state.timeControl.roundSeconds)}/round`
        : `${formatDuration(state.timeControl.initialSeconds)} total`;

  }

  // -----------------------
  // Powers (points)
  // -----------------------
const { setter, guesser } =
  getActivePowersByRole(state.activePowers);

let powersLine = null;
if (setter.length || guesser.length) {
  const setterIcons = setter.length
    ? setter.map(powerToInlineIcon).join(" ")
    : "—";

  const guesserIcons = guesser.length
    ? guesser.map(powerToInlineIcon).join(" ")
    : "—";

  powersLine =
    `${setterIcons} | ${guesserIcons}`;
}

  // -----------------------
  // Per-round lines
  // -----------------------
const hideWords =
  !!state.isDaily;

const roundLines =
  rounds.map((r, i) => {
    const guesses =
      r.guessCount;

    const roundWinner =
      getPlayerName(
        r.guesser
      );

    const timeoutMark =
      r.timeoutLoser
        ? " ⏱"
        : "";

    /*
     * Daily Challenge results must not reveal either
     * secret, even after the match ends.
     */
    if (hideWords) {
      const guessLabel =
        guesses === 1
          ? "guess"
          : "guesses";

      return (
        `R${i + 1}: ` +
        `${roundWinner} — ` +
        `${guesses} ${guessLabel}` +
        `${timeoutMark}`
      );
    }

    const secret =
      r.history?.[
        r.history.length - 1
      ]?.finalSecret
        ?.toUpperCase() ||
      "?????";

    if (
      finalWinReason ===
      "timeout"
    ) {
      return (
        `R${i + 1}: ` +
        `${secret} (${guesses}) ⏱`
      );
    }

    return (
      `R${i + 1}: ` +
      `${roundWinner} guessed ` +
      `${secret} (${guesses})` +
      `${timeoutMark}`
    );
  });

  // -----------------------
  // Assemble final text
  // -----------------------
  const lines = [
    "Vowel Play result",
    `${resultIcon} ${winnerLabel} ${winnerPoints}–${loserPoints} ${loserName}`,
    assassinationLine,
    `${powersLine} ⏱ ${timeLine}`,
    ...roundLines
  ].filter(Boolean);

  return lines.join("\n");
}

function getActivePowersByRole(activePowers = []) {
  const byRole = {
    setter: [],
    guesser: []
  };

  activePowers.forEach(id => {
    const power = PowerEngine.powers?.[id];
    const meta = window.POWER_METADATA?.[id];
    if (!power || !meta) return;

    const role = power.role; // "setter" | "guesser"
    if (byRole[role]) {
      byRole[role].push(id);
    }
  });

  return byRole;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return secs === 0
    ? `${mins}m`
    : `${mins}m ${secs}s`;
}

function updateMenuRoomCode() {
  const el = document.getElementById("menuRoomCode");
  if (!el) return;
  if (!window.roomId) return;

  el.textContent = window.roomId;
}

function computeRemainingFromRound(round, idx) {
  return round?.history?.[idx]?.remainingAfter ?? "?";
}


