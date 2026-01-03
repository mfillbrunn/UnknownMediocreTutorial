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

  const didWin = winner && myRole === winner;

  const winnerPoints = winner ? points[winner] : points.A;
  const loserPoints = winner ? points[winner === "A" ? "B" : "A"] : points.A;

  const resultIcon =
    winReason === "tie" ? "↔️" : didWin ? "🏆" : "❌";

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


function powerToInlineIcon(powerId) {
  const meta = window.POWER_METADATA?.[powerId];
  if (!meta) return powerId;

  // Emoji-first for share text
  if (meta.emoji) return meta.emoji;

  // Fallback: short label
  return meta.label;
}



///SUMMARY SCREEN ROUTER
window.updateSummary = function updateSummary() {
  const container = $("roundSummary");
  if (  !state || state.phase !== "gameOver") {
    container.innerHTML = "";
    return;
  }
  if (state.gameOverView === "round") {
    renderRoundSummary(container);
    return;
  }
  if (state.gameOverView === "match") {
    renderMatchSummary(container);
    return;
  }
  return;
}

///MATCH SUMMARY

function renderMatchSummary(container) {
  const rounds = state.matchRounds || [];
  const names = state.playerNames || { A: "A", B: "B" };

  // ----------------------------
  // Compute points + time
  // ----------------------------
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

let resultText =
  winReason === "tie"
    ? `${resultIcon} You tied`
    : didWin
      ? `${resultIcon} You won`
      : `${resultIcon} You lost`;

let scoreText;
if (didWin===true){
  const scoreText = `Score: ${winnerPoints} – ${loserPoints}`;
} else if (didWin===false){
  const scoreText = `Score: ${loserPoints} – ${winnerPoints}`;
}
const timeoutRound = rounds.find(r => r.timeoutLoser);

    let timeoutNote = "";
    if (timeoutRound) {
      const loserName = names[timeoutRound.timeoutLoser];
      timeoutNote = `
        <p class="timeout-note">
          ⏱ ${loserName} lost on time
        </p>
      `;
    }

  // ----------------------------
  // Header
  // ----------------------------
  let html = `
  <div class="match-header">
    <h2>${resultText}</h2>
    <h3>${scoreText}</h3>

    <p class="match-meta">
      Time control:
      ${
        state.timeControl?.enabled
        ? state.timeControl.mode === "round"
          ? `Round timer: ${state.timeControl.roundSeconds}s / round`
          : `${state.timeControl.initialSeconds / 60} min +${state.timeControl.incrementSeconds}s`
        : "No time"

      }
    </p>

    ${
      winReason === "time"
        ? `<p class="tie-breaker">
             Tie on points. Winner by lower total time.
           </p>`
        : ""
    }
  </div>
`;


  // ----------------------------
  //COMPETITIVE  Match summary table
  // ----------------------------
  html += `
    <table class="match-summary-table">
      <tr>
        <th>Round</th>
        <th>Setter</th>
        <th>Guesser</th>
        <th>Guesses</th>
        <th>Time (${names.A})</th>
        <th>Time (${names.B})</th>
      </tr>
  `;

  rounds.forEach((r, i) => {
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${names[r.setter]}</td>
        <td>${names[r.guesser]}</td>
        <td>
          ${r.guessCount}
          ${
            r.timeoutLoser
              ? `<span class="timeout-badge">⏱</span>`
              : ""
          }
        </td>
      <td>${r.time?.A || 0}</td>
      <td>${r.time?.B || 0}</td>
      </tr>
    `;
  });

  html += `
      <tr class="total-row">
        <td><b>Total</b></td>
        <td colspan="2"></td>
        <td></td>
        <td><b>${time.A} (${names.A})</b></td>
        <td><b>${time.B} (${names.B})</b></td>
      </tr>
    </table>
  `;

  // ----------------------------
  // Toggle round details
  // ----------------------------
  html += `
    <div class="round-details-toggle">
      <button id="toggleRoundsBtn" class="secondary-btn">
        Show Round Details
      </button>
    </div>

    <div id="roundDetails" hidden>
      ${rounds.map((r, i) => renderStoredRoundSummary(r, i)).join("")}
    </div>
  `;

  container.innerHTML = html;

  // Toggle logic
  $("toggleRoundsBtn").onclick = () => {
    const details = $("roundDetails");
    const btn = $("toggleRoundsBtn");
    const open = details.hasAttribute("hidden");

    details.toggleAttribute("hidden");
    btn.textContent = open ? "Hide Round Details" : "Show Round Details";
  };
}


///COMPETITIVE  ROUND SUMMARY
function renderRoundSummary(container) {
   
  let html = `<h3>Round Summary</h3>`;

  const setterName =
    state.playerNames?.[state.setter] || "Setter";
  const guesserName =
    state.playerNames?.[state.guesser] || "Guesser";
  if (state.timeoutLoser) {
  const loser =
    state.timeoutLoser === state.setter
      ? setterName
      : guesserName;

  html += `
    <p class="timeout-summary">
      ⏱ ${loser} lost on time
      ${
        state.phase === "gameOver" && state.history.length === 0
          ? "(simultaneous round timeout)"
          : ""
      }
    </p>
  `;
}

  html += `
    <p class="summary-players">
      <b>${setterName}</b> (Setter) vs
      <b>${guesserName}</b> (Guesser)
    </p>
  `;

  const lastEntry = state.history[state.history.length - 1];
  if (
    lastEntry &&
    state.powers?.assassinWord &&
    lastEntry.guess === state.powers.assassinWord
  ) {
    html += `
      <p class="assassin-summary">
        ☠ ${guesserName} guessed the assassin word
        "${lastEntry.guess.toUpperCase()}"
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
        <th>Powers</th>
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

  let powersCell = "—";
  if (gp.length || sp.length) {
    powersCell = `
      <div class="summary-powers compact">
        ${gp.length ? `
          <div class="powers-row guesser">
            ${gp.map(powerToInlineIcon).join("")}
          </div>` : ""}
        ${sp.length ? `
          <div class="powers-row setter">
            ${sp.map(powerToInlineIcon).join("")}
          </div>` : ""}
      </div>
    `;
  }

  const remaining =
    isFinal ? 0 : computeRemainingAfterIndex(i);

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

  container.innerHTML = html;

  const btn = $("nextRoundBtn");
  if (btn) {
    btn.onclick = () => {
      sendGameAction(roomId, { type: "NEXT_ROUND" });
    };
  }
};

/// STORED ROUND DETAILS
function renderStoredRoundSummary(round, index) {
  const names = state.playerNames || { A: "A", B: "B" };

  let html = `
    <div class="stored-round">
      <h4>Round ${index + 1} – ${names[round.setter]} was Setter</h4>
      <table class="summary-table">
        <tr>
          <th>#</th>
          <th>Secret</th>
          <th>Guess</th>
          <th>Feedback</th>
        </tr>
  `;

  round.history.forEach((h, i) => {
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${h.finalSecret?.toUpperCase() || "???"}</td>
        <td>${h.guess?.toUpperCase() || ""}</td>
        <td>${Array.isArray(h.fb) ? h.fb.join("") : ""}</td>
      </tr>
    `;
  });

  html += `</table></div>`;
  return html;
}

function buildShareText(state, myRole) {
  const rounds = state.matchRounds || [];
  const names = state.playerNames || { A: "A", B: "B" };

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

  const winnerName =
  winReason === "tie"
    ? names.A
    : names[winner];

const loserName =
  winReason === "tie"
    ? names.B
    : names[winner === "A" ? "B" : "A"];

const winnerLabel =
  winReason === "time"
    ? `**${winnerName} (win by tiebreaker)**`
    : `**${winnerName}**`;


  // -----------------------
  // Time control line
  // -----------------------
  let timeLine = "No time";
  if (state.timeControl?.enabled) {
    timeLine =
      state.timeControl.mode === "round"
        ? `${state.timeControl.roundSeconds}s/round`
        : `${state.timeControl.initialSeconds / 60}min total`;
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
    const winnerOfRound = names[r.guesser];
    const secret =
      r.history?.[r.history.length - 1]?.finalSecret?.toUpperCase() || "?????";
    const guesses = r.guessCount;

    const timeoutMark = r.timeoutLoser ? " ⏱" : "";

    return `R${i + 1}: ${winnerOfRound} guessed ${secret} (${guesses})${timeoutMark}`;
  });

  // -----------------------
  // Assemble final text
  // -----------------------
  const lines = [
    "VS Wordle result",
    `${resultIcon} ${winnerLabel} ${winnerPoints}–${loserPoints} ${loserName}`,
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


