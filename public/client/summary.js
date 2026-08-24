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
    return `<p class="${noteClass}">⚠️ The Secretkeeper claimed <b>${letter}</b> was in the secret — the Guesser accepted, adding <b>+1</b> guess.</p>`;
  }

  if (powers.revealPenaltyResult === "wrongCall") {
    return `<p class="${noteClass}">⚠️ The Secretkeeper claimed <b>${letter}</b> was in the secret — the Guesser called it, but it was true. <b>+2</b> guesses for the Secretkeeper.</p>`;
  }

  return `<p class="${noteClass}">⚠️ The Secretkeeper claimed <b>${letter}</b> was in the secret — the Guesser called the bluff, and caught it.</p>`;
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
    // The Secretkeeper (that round's setter) is credited with a point per guess it
    // took the Guesser to win.
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
  if (userId === "AI" && state?.isTutorial) return "AI Tutorial";
  return (userId && state.players?.[userId]?.name) || "—";
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



// REFINEMENT V4 SHARE VISIBILITY: sharing belongs to the completed match,
// not the between-round decision screen.
function setSummaryShareVisibility(visible) {
  const btn = $("shareResultBtn");
  if (!btn) return;
  btn.classList.toggle("hidden", !visible);
  if (visible) {
    btn.removeAttribute("aria-hidden");
    btn.tabIndex = 0;
  } else {
    btn.setAttribute("aria-hidden", "true");
    btn.tabIndex = -1;
    btn.style.removeProperty("top");
  }
}

// Lines the Share button up with whichever heading is currently showing
// (the win/loss line in the match summary, "Round Summary" in the round
// summary) instead of it sitting on its own row above everything.
function positionShareButton() {
  const btn = $("shareResultBtn");
  const panel = btn?.closest(".panel");
  if (!btn || !panel || btn.classList.contains("hidden")) return;

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
    setSummaryShareVisibility(false);
    container.innerHTML = "";
    if (globalNewMatchBtn) globalNewMatchBtn.classList.remove("hidden");
    return;
  }

  updateMenuRoomCode();

  if (state.gameOverView === "round") {
    setSummaryShareVisibility(false);
    if (globalNewMatchBtn) globalNewMatchBtn.classList.add("hidden");
    renderRoundSummary(container);
    return;
  }

  if (state.gameOverView === "match") {
    setSummaryShareVisibility(true);
    if (globalNewMatchBtn) globalNewMatchBtn.classList.add("hidden");
    renderMatchSummary(container);
    return;
  }
};


///MATCH SUMMARY
function renderMatchSummary(container) {
  setSummaryShareVisibility(true);
  const rounds = state.matchRounds || [];

  const {
    points,
    winner,
    winReason,
    didWin
  } = computeMatchResult(state, myUserId());

  const playerIds = Object.keys(state.players || {});
  const opponentId = playerIds.find(id => id !== myUserId()) || null;
  const myName = getPlayerName(myUserId());
  const opponentName = getPlayerName(opponentId);

  // One bold word for the headline (see .match-header h2's uppercase) --
  // any timeout-specific detail is called out separately by timeoutNote
  // further down instead of being folded into this.
  const resultText = winReason === "tie" ? "Tie" : didWin ? "Victory" : "Defeat";

  // Mine vs. theirs, not winner vs. loser -- the scoreboard always shows
  // the viewer's own number first/green regardless of who actually won,
  // same "you" convention as the live in-game score header.
  const myPoints = points[myUserId()] || 0;
  const oppPoints = points[opponentId] || 0;

  // Total time each player spent across the WHOLE match, by player identity
  // rather than by role -- state.timeSpentMs is keyed by user id and roles
  // swap between round 1 and round 2, so a role-colored line (like
  // formatTimeSpent's, used on the single-round summary right after a round
  // ends) would tint each player a different color from round to round.
  const totalTimeSpent = state.timeSpentMs || {};
  const myMs = Number(totalTimeSpent[myUserId()]) || 0;
  const opponentMs = Number(totalTimeSpent[opponentId]) || 0;

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

  // Daily Challenge is a once-a-day, fixed-setup event -- New Match and
  // Replay don't apply (there's nothing to re-roll or replay into), so only
  // offer Leave (back to the menu, where the day's result/rankings live).
  const isDaily = !!state.isDaily;

  let html = `
    <div class="match-header match-header--${resultClass}">
      <h2>${resultText}</h2>
      <div class="match-scoreboard">
        <div class="match-score-line">
          <span class="match-score-mine">${myPoints}</span>
          <span class="match-score-sep">–</span>
          <span class="match-score-theirs">${oppPoints}</span>
        </div>
        <div class="match-name-row">
          <div class="match-side match-side--mine">
            <span class="match-side-name">${summaryEscapeText(myName)}</span>
            <span class="match-side-label">You</span>
          </div>
          <span class="match-vs">vs</span>
          <div class="match-side match-side--theirs">
            <span class="match-side-name">${summaryEscapeText(opponentName)}</span>
            <span class="match-side-label">Opponent</span>
          </div>
        </div>
        <div class="match-time-row">
          <div class="match-side match-side--mine">
            <strong class="match-side-time">${formatSpentMs(myMs)}</strong>
            <span class="match-side-label">Total time</span>
          </div>
          <div class="match-side match-side--theirs">
            <strong class="match-side-time">${formatSpentMs(opponentMs)}</strong>
            <span class="match-side-label">Total time</span>
          </div>
        </div>
      </div>
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

    <div id="matchSummaryActions" class="summary-actions">
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

    <div class="match-info-block">
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
    </div>
  `;

  // ----------------------------
  // Round summaries ONLY (table removed)
  // ----------------------------
  html += `
    <div id="roundDetails">
      ${rounds.map((r, i) => renderStoredRoundSummary(r, i)).join("")}
    </div>
  `;

  container.innerHTML = html;
  positionShareButton();

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


// Total time each player spent on their own turns this match, banked
// server-side in state.timeSpentMs (see bankTurnTime in core/rooms.js).
// Deliberately NOT named formatDuration: this file already declares one
// of those further down (taking SECONDS, for the time-control readouts).
// Two hoisted declarations of the same name in one script scope means the
// last one wins for every call site, so an ms-based twin silently sent
// these millisecond values through the seconds formatter and reported a
// 7-second turn as "2h".
function formatSpentMs(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}

// COMPETITIVE UI POLISH V2: structured clock cards shared by round and match summaries.
function summaryEscapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// A round's feedback used to render as h.fb.join("") -- a run-together
// string like "greenyellowgraygraygreen" instead of the colored tiles the
// live board itself uses. Reuses the same .tile-<color> classes the board
// already defines (global, !important) so these stay visually identical to
// the real thing; an unrecognized/missing value gets a hollow placeholder
// rather than silently disappearing.
function renderFeedbackTiles(fb) {
  if (!Array.isArray(fb)) return "";
  const known = new Set(["green", "yellow", "gray", "blue", "purple"]);
  return `<span class="summary-feedback-tiles">${fb
    .map(color => `<span class="summary-feedback-tile ${known.has(color) ? `tile-${color}` : "tile-blank"}"></span>`)
    .join("")}</span>`;
}

function summaryRoundSeconds(round, userId) {
  const value = Number(round?.time?.[userId]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function renderRoundClockPanel(round, label = "ROUND CLOCK") {
  if (!round || !round.time || typeof round.time !== "object") return "";
  const setterId = round.setter;
  const guesserId = round.guesser;
  const setterName = summaryEscapeText(getPlayerName(setterId));
  const guesserName = summaryEscapeText(getPlayerName(guesserId));
  const setterSeconds = summaryRoundSeconds(round, setterId);
  const guesserSeconds = summaryRoundSeconds(round, guesserId);
  const safeLabel = summaryEscapeText(label);

  return `
    <section class="summary-clock-panel summary-clock-panel--round" aria-label="${safeLabel}">
      <div class="summary-clock-kicker">
        <span class="summary-clock-symbol" aria-hidden="true">&#9201;</span>
        <span>${safeLabel}</span>
      </div>
      <div class="summary-clock-grid">
        <div class="summary-clock-player is-setter">
          <span class="summary-clock-name">${setterName}</span>
          <span class="summary-clock-role">Secretkeeper</span>
          <strong class="summary-clock-value">${formatDuration(setterSeconds)}</strong>
        </div>
        <span class="summary-clock-vs" aria-hidden="true">VS</span>
        <div class="summary-clock-player is-guesser">
          <span class="summary-clock-name">${guesserName}</span>
          <span class="summary-clock-role">Guesser</span>
          <strong class="summary-clock-value">${formatDuration(guesserSeconds)}</strong>
        </div>
      </div>
    </section>
  `;
}

// Mirrors round-time-summary's own markup (icon, role-colored names, a
// dedicated value span) instead of a plain "<b>Time taken:</b> A x · B y"
// line -- that plain version had no CSS of its own at all (nothing in
// features.css ever targeted .summary-time-spent), so it fell back to
// default paragraph styling right next to a sibling block that's actually
// designed to match the rest of the summary screen.
function formatTimeSpent(state, setterName, guesserName) {
  const spent = state?.timeSpentMs;
  if (!spent) return "";
  const setterMs = Number(spent[state.setter]) || 0;
  const guesserMs = Number(spent[state.guesser]) || 0;
  if (!setterMs && !guesserMs) return "";
  return `
    <p class="summary-time-spent">
      ⏱ Time taken:
      <span style="color: var(--setter-color); font-weight: 600;">
        ${setterName}
      </span>
      : <span class="time-value">
        ${formatSpentMs(setterMs)}
      </span>
      &nbsp;|&nbsp;
      <span style="color: var(--guesser-color); font-weight: 600;">
        ${guesserName}
      </span>
      : <span class="time-value">
        ${formatSpentMs(guesserMs)}
      </span>
    </p>
  `;
}

/////////////////////////////////
/////////COMPETITIVE  ROUND SUMMARY
////////////////////////////
function renderRoundSummary(container) {
  setSummaryShareVisibility(false);
  let html = `<h3 class="summary-heading">Round Summary</h3>`;
  // The round that just ended is still reflected by state.setter/guesser —
  // roles swap for the *next* round only once NEXT_ROUND is sent.
  const setterName = getPlayerName(state.setter);
  const guesserName = getPlayerName(state.guesser);

  // The headline stat for the round -- shown first, above the clock panel
  // and any conditional notes, instead of tucked down by the table.
  html += `<p class="summary-guess-count"><b>Total guesses:</b> ${state.guessCount}</p>`;

if (state.timeoutLoser)  {
  const loserName = getPlayerName(state.timeoutLoser);

  const note ="(lost on time)";

  html += `
    <p class="timeout-summary">
      ⏱ ${loserName} ${note}
    </p>
  `;
}


// Use the archived round snapshot, keyed by stable player id. This avoids
  // mixing milliseconds from the match accumulator with per-round seconds.
  const lastRound = state.matchRounds[state.matchRounds.length - 1];
  html += renderRoundClockPanel(lastRound, "ROUND CLOCK");
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

  // Per-player timing is rendered once from lastRound.time above.

  html += `
  <div class="summary-table-wrap">
  <table class="summary-table summary-table--round">
    <thead>
      <tr>
        <th>#</th>
        <th>Secret</th>
        <th>Guess</th>
        <th>Result</th>
        <th>Left</th>
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

  const fbCell = renderFeedbackTiles(h.fb);

  const archivedEntry = lastRound?.history?.[i];
  const remainingValue = archivedEntry?.remainingAfter ?? (isFinal ? 0 : null);
  const remaining = remainingValue === null ? "—" : remainingValue;

  html += `
    <tr class="${isFinal ? "final-row" : ""}">
      <td class="turn-index">${i + 1}</td>
      <td class="secret-cell">${secretCell}</td>
      <td class="guess-cell">${guessCell}</td>
      <td class="feedback-cell">${fbCell}</td>
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
  const myId = myUserId();
  // Whichever of the two names is the viewer's own gets called out in
  // green (same convention as the match header above) so it's a quick
  // "was I setting or guessing this round" scan, not a re-read of names.
  const setterName = round.setter === myId
    ? `<span class="match-you-name">${summaryEscapeText(getPlayerName(round.setter))}</span>`
    : summaryEscapeText(getPlayerName(round.setter));
  const guesserName = round.guesser === myId
    ? `<span class="match-you-name">${summaryEscapeText(getPlayerName(round.guesser))}</span>`
    : summaryEscapeText(getPlayerName(round.guesser));
  const roundClockHtml = renderRoundClockPanel(round, `ROUND ${index + 1} CLOCK`);
  let html = `
    <div class="stored-round" data-round-index="${index}">
      <div class="stored-round-header">
        <div class="stored-round-title-block">
          <span class="stored-round-kicker">ROUND ${index + 1}</span>
          <h4>${setterName} set the secret</h4>
          <p>${guesserName} guessed this round</p>
        </div>
        ${roundClockHtml}
      </div>
      ${formatRevealPenaltySummary(round.powers, "round-note round-note--setter")}
      <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
        <tr>
          <th>#</th>
          <th>Secret</th>
          <th>Guess</th>
          <th>Result</th>
          <th>Left</th>
        </tr>
        </thead>
        <tbody>
  `;

  round.history.forEach((h, i) => {
    const remainingValue = computeRemainingFromRound(round, i);
    const remaining = remainingValue === null || remainingValue === undefined ? "—" : remainingValue;

    html += `
      <tr>
        <td>${i + 1}</td>
        <td class="secret-cell">${h.finalSecret?.toUpperCase() || "???"}</td>
        <td class="guess-cell">${h.guess?.toUpperCase() || ""}</td>
        <td class="feedback-cell">${renderFeedbackTiles(h.fb)}</td>
        <td class="remaining-cell">${remaining}</td>
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
  return round?.history?.[idx]?.remainingAfter ?? null;
}


