// client/summary.js

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

function getPowerId(p) {
  return typeof p === "string" ? p : p?.id;
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

  let scoreText = "";
  if (winner !== null) {
    scoreText =
      winReason === "timeout"
        ? `Final score (before timeout): ${
            didWin
              ? `${winnerPoints} – ${loserPoints}`
              : `${loserPoints} – ${winnerPoints}`
          }`
        : `Score: ${
            didWin
              ? `${winnerPoints} – ${loserPoints}`
              : `${loserPoints} – ${winnerPoints}`
          }`;
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
// POWERS (labeled, icon + text)
// ----------------------------
const { setter, guesser } =
  getActivePowersByRole(state.activePowers);

let powersBlock = "";

if (setter.length) {
  powersBlock += `
    <p class="match-power-line">
      <span class="power-label setter">
        ${setter.map(p =>
          `${powerToInlineIcon(p)} ${powerToInlineLabel(p)}`
        ).join("\u00A0\u00A0")}
      </span>
    </p>
  `;
}

if (guesser.length) {
  powersBlock += `
    <p class="match-power-line">
      <span class="power-label guesser">
        ${guesser.map(p =>
          `${powerToInlineIcon(p)} ${powerToInlineLabel(p)}`
        ).join("\u00A0\u00A0")}
      </span>
    </p>
  `;
}


  // ----------------------------
  // Top bar: room code (share button lives statically above the container)
  // ----------------------------
  let html = `
    <div class="summary-top-bar">
      <span class="summary-room-chip">Room <b>${window.roomId || "—"}</b></span>
    </div>
  `;

  // ----------------------------
  // Result header (lead with the outcome, not the actions)
  // ----------------------------
  const resultClass = didWin ? "win" : winReason === "tie" ? "tie" : "loss";

  html += `
    <div class="match-header match-header--${resultClass}">
      <div class="match-result-icon">${resultIcon}</div>
      <h2>${resultText}</h2>
      <p class="match-players-line">
        <span class="${didWin ? "me-winner" : ""}">${myName}</span>
        <span class="vs">vs</span>
        <span class="${!didWin && winner ? "me-winner" : ""}">${opponentName}</span>
      </p>
      ${scoreText ? `<h3>${scoreText}</h3>` : ""}
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
  // Actions
  // ----------------------------
  html += `
    <div class="summary-actions">
      <button id="newMatchBtn" class="new-match-btn">
        <span class="new-match-icon">↻</span> New Match
      </button>
      <button id="leaveSummaryBtn" class="secondary-btn danger">
        Leave
      </button>
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
  let html = `
    <div class="summary-top-bar">
      <span class="summary-room-chip">Room <b>${window.roomId || "—"}</b></span>
    </div>
    <h3 class="summary-heading">Round Summary</h3>
  `;
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
    if (state.powers.revealPenaltyUsed) {
      const letter = state.powers.revealPenaltyLetter;
      const count = state.powers.revealPenaltyCount;

      const penalty =
        count === 1 ? 2 :
        count === 2 ? 3 : 4;

      html += `
        <p class="reveal-penalty-summary">
          ⚠️ The Spy revealed the letter <b>${letter}</b>
          (${count}× in secret), adding <b>+${penalty}</b> guesses.
        </p>
      `;
    }

  html += `<p><b>Total guesses:</b> ${state.guessCount}</p>`;

  html += `
  <div class="summary-table-wrap">
  <table class="summary-table summary-table--round">
    <thead>
      <tr>
        <th>#</th>
        <th>Secret</th>
        <th>Guess</th>
        <th>Feedback</th>
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

  const gp = h.powersGuesser || [];
  const sp = h.powersSetter || [];

  let powersCell = "";
  if (gp.length || sp.length) {
    powersCell = `
      <div class="summary-powers compact">
        ${gp.length ? `
          <div class="powers-row guesser">
            ${gp.map(p => powerToEmojiOnly(getPowerId(p))).join("")}
          </div>` : ""}
        ${sp.length ? `
          <div class="powers-row setter">
            ${sp.map(p => powerToEmojiOnly(getPowerId(p))).join("")}
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
    <div class="stored-round">
      <h4>Round ${index + 1} – ${getPlayerName(round.setter)} was Spy</h4>

      <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
        <tr>
          <th>#</th>
          <th>Secret</th>
          <th>Guess</th>
          <th>Feedback</th>
          <th>Secrets</th>
        </tr>
        </thead>
        <tbody>
  `;
  if (round.powers?.revealPenaltyUsed) {
    const letter = round.powers.revealPenaltyLetter;
    const count = round.powers.revealPenaltyCount;

    const penalty =
      count === 1 ? 2 :
      count === 2 ? 3 : 4;

    html += `
      <p class="round-note round-note--setter">
        ⚠️ The Spy revealed the letter <b>${letter}</b>
        (${count}× in secret), adding <b>+${penalty}</b> guesses.
      </p>
    `;
  }

  round.history.forEach((h, i) => {
    const remaining = computeRemainingFromRound(round, i);

    const gpIcons = (h.powersGuesser || [])
  .map(p => powerToEmojiOnly(getPowerId(p)))
  .filter(Boolean);

    const spIcons = (h.powersSetter || [])
  .map(p => powerToEmojiOnly(getPowerId(p)))
  .filter(Boolean);

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
        <td>${h.finalSecret?.toUpperCase() || "???"}</td>
        <td>${h.guess?.toUpperCase() || ""}</td>
        <td>${Array.isArray(h.fb) ? h.fb.join("") : ""}</td>
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
  const roundLines = rounds.map((r, i) => {
     const secret =
      r.history?.[r.history.length - 1]?.finalSecret?.toUpperCase() || "?????";
    const guesses = r.guessCount;
     if (finalWinReason === "timeout") {
        return `R${i + 1}: ${secret} (${guesses}) ⏱`;
      }
    const roundWinner = getPlayerName(r.guesser);
    const timeoutMark = r.timeoutLoser ? " ⏱" : "";

    return `R${i + 1}: ${roundWinner} guessed ${secret} (${guesses})${timeoutMark}`;
  });

  // -----------------------
  // Assemble final text
  // -----------------------
  const lines = [
    "VS Wordle result",
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


