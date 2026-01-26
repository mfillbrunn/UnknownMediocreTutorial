// client/summary.js

///CALCULATE WINNER

function computeMatchResult(state, myRole) {
  const rounds = state.matchRounds || [];

  const points = { A: 0, B: 0 };
  const time = { A: 0, B: 0 };

  rounds.forEach(r => {
    points[r.setter] += r.guessCount;
    time.A += r.time?.A || 0;
    time.B += r.time?.B || 0;
  });

  let winner = null;
  let winReason = "points";

if (state.timeoutLoser) {
    winner = state.timeoutLoser === "A" ? "B" : "A";
    winReason = "timeout";
  } else {
    // Normal resolution
    if (points.A > points.B) {
      winner = "A";
    } else if (points.B > points.A) {
      winner = "B";
    } else if (time.A !== time.B) {
      winner = time.A <= time.B ? "A" : "B";
      winReason = "time";
    } else {
      winReason = "tie";
    }
  }

  const didWin = winner && myRole === winner;

  const winnerPoints = winner ? points[winner] : points.A;
  const loserPoints = winner ? points[winner === "A" ? "B" : "A"] : points.A;

  const resultIcon =
    winReason === "tie"
      ? "↔️"
      : winReason === "timeout"
      ? "⏱️"
      : didWin
      ? "🏆"
      : "❌";

  return {
    points,
    time,
    winner,
    winReason,        
    didWin,
    winnerPoints,
    loserPoints,
    resultIcon
  };
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
  } = computeMatchResult(state, myRole);

  let resultText;
  if (winReason === "timeout") {
    resultText = didWin
      ? `⏱️ You won by timeout`
      : `⏱️ You lost on time`;
  } else if (winReason === "tie") {
    resultText = `${resultIcon} You tied`;
  } else {
    resultText = didWin
      ? `${resultIcon} You won`
      : `${resultIcon} You lost`;
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
    const loserName = getNameByRole(state.timeoutLoser);
    timeoutNote = `
      <p class="timeout-note">
        ⏱ ${loserName} lost on time
      </p>
    `;
  }

  let assassinationNote = "";
  if (state.powers?.assassinated) {
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
  // Actions (next to Share)
  // ----------------------------
  let html = `
    <div class="summary-actions">
      <button id="newMatchBtn" class="primary-btn">
        New Match
      </button>
      <button id="leaveSummaryBtn" class="secondary-btn danger">
        Leave
      </button>
    </div>
  `;
  // ----------------------------
  // Header
  // ----------------------------
 
  html += `
    <div class="match-header">
      <h2>${resultText}</h2>
      <h3>${scoreText}</h3>
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

    <p class="match-meta">
      Time control:
      ${
        state.timeControl?.enabled
          ? state.timeControl.mode === "round"
            ? `${formatDuration(state.timeControl.roundSeconds)} / round`
            : `${formatDuration(state.timeControl.initialSeconds)} +${formatDuration(state.timeControl.incrementSeconds)}`
          : "No time"
      }
    </p>

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
  container.innerHTML = html;

  const leaveBtn = $("leaveSummaryBtn");
  if (leaveBtn) {
    leaveBtn.onclick = () => {
      socket.emit("leaveRoom", {}, () => {
        roomId = null;
        clearRoom();
        state = null;
        window.state = null;
        showStartup();
      });
    };
  }
}


/////////////////////////////////
/////////COMPETITIVE  ROUND SUMMARY
////////////////////////////
function renderRoundSummary(container) {
  let html = ""
  // Competitive mode: Next Round button
  if (state.gameOverView === "round" && state.canNextRound) {
     html += `
      <div class="summary-actions">
        <button id="nextRoundBtn" class="primary-btn">
          Next Round
        </button>
      </div>
    `;
  }
html += `<h3>Round Summary</h3>`;
  const setterPlayerId = Object.keys(state.roles || {})
  .find(id => state.roles[id] === "A");

const guesserPlayerId = Object.keys(state.roles || {})
  .find(id => state.roles[id] === "B");

const setterName =
  setterPlayerId ? state.playerNames[setterPlayerId] : "—";

const guesserName =
  guesserPlayerId ? state.playerNames[guesserPlayerId] : "—";
if (state.timeoutLoser)  {
  const loserName = getNameByRole(state.timeoutLoser);

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

const roundTimeA = lastRound?.time?.A ?? 0;
const roundTimeB = lastRound?.time?.B ?? 0;


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

  const lastEntry = state.history[state.history.length - 1];
  if (state.powers.assassinated) {
    html += `
      <p class="assassin-summary">
        ☠ ${guesserName} guessed the assassin word
        "${state.powers.assassinWord.toUpperCase()}"
      </p>
    `;
  }

  html += `<p><b>Total guesses:</b> ${state.guessCount}</p>`;

  html += `
  <table class="summary-table summary-table--round">
    <thead>
      <tr>
        <th>#</th>
        <th>Secret</th>
        <th>Guess</th>
        <th>Feedback</th>
        <th></th>
        <th># Words</th>
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

 const remaining =
  state.timeoutLoser
    ? "—"
    : isFinal
      ? 0
      : computeRemainingAfterIndex(i);

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
`;
  container.innerHTML = html;

  const btn = $("nextRoundBtn");
  if (btn) {
    btn.onclick = () => {
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
      <h4>Round ${index + 1} – ${getNameByRole(round.setter)} was Spy</h4>

      <table class="summary-table">
        <tr>
          <th>#</th>
          <th>Secret</th>
          <th>Guess</th>
          <th>Feedback</th>
          <th></th>
          <th>Secrets</th>
        </tr>
  `;

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
        <td class="powers-cell">${powersCell}</td>
        <td>${remaining}</td>
      </tr>
    `;
  });

  html += `</table></div>`;
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
} = computeMatchResult(state, myRole);
let finalWinner = winner;
let finalWinReason = winReason;
let assassinationLine = null;
if (state.powers?.assassinated) {
  assassinationLine = "☠ Assassination triggered";
}

if (state.timeoutLoser) {
  finalWinner = state.timeoutLoser === "A" ? "B" : "A";
  finalWinReason = "timeout";
}
const winnerName =
  finalWinReason  === "tie"
    ? getNameByRole("A")
    : getNameByRole(finalWinner);

const loserName =
  finalWinReason === "tie"
    ? getNameByRole("B")
    : getNameByRole(finalWinner === "A" ? "B" : "A");

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
    const roundWinner = getNameByRole(r.guesser);
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

function getNameByRole(role) {
  const id = Object.keys(state.roles || {})
    .find(pid => state.roles[pid] === role);
  return id ? state.playerNames?.[id] || "—" : "—";
}

function updateMenuRoomCode() {
  const el = document.getElementById("menuRoomCode");
  if (!el) return;
  if (!window.roomId) return;

  el.textContent = window.roomId;
}

function computeRemainingFromRound(round, idx) {
  if (round.timeoutLoser) return "—";
  if (idx === round.history.length - 1) return 0;

  const tempState = {
    history: round.history.slice(0, idx + 1),
    secret: round.history[idx].finalSecret,
    phase: "playing"
  };

  return computeRemainingAfterIndexFromState(idx, tempState);
}


