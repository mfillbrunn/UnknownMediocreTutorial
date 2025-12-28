// client/ui/summary.js

export function updateSummary(state, helpers) {
  const { $, computeRemainingAfterIndex } = helpers;
  const container = $("roundSummary");

  if (!state || !state.gameOver) {
    container.innerHTML = "";
    return;
  }

  let html = "";

  // Title depends on mode / round
  const roundLabel =
    state.matchMeta?.roundIndex != null
      ? `Round ${state.matchMeta.roundIndex + 1} Summary`
      : "Round Summary";

  html += `<h3>${roundLabel}</h3>`;

  const setterName =
    state.playerNames?.[state.setter] || "Setter";
  const guesserName =
    state.playerNames?.[state.guesser] || "Guesser";

  html += `
    <p class="summary-players">
      <b>${setterName}</b> (Setter) vs <b>${guesserName}</b> (Guesser)
    </p>
  `;

  // Assassin notice
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

  html += `<p><b>Total guesses:</b> ${state.guessCount + 1}</p>`;

  html += `
    <table class="summary-table">
      <tr>
        <th>#</th>
        <th>Secret</th>
        <th>Guess</th>
        <th>Feedback</th>
        <th>Powers Used</th>
        <th>Remaining</th>
      </tr>
  `;

  state.history.forEach((h, i) => {
    const secretCell = h.finalSecret ? h.finalSecret.toUpperCase() : "???";
    const guessCell = h.guess ? h.guess.toUpperCase() : "";
    const fbCell = Array.isArray(h.fb) ? h.fb.join("") : "";

    const gp = h.powersGuesser || [];
    const sp = h.powersSetter || [];

    let powersCell = "—";
    if (gp.length || sp.length) {
      powersCell = `<div class="summary-powers">`;
      if (gp.length) {
        powersCell += `<div class="summary-powers-guesser"><b>Guesser:</b> ${gp.join(", ")}</div>`;
      }
      if (sp.length) {
        powersCell += `<div class="summary-powers-setter"><b>Setter:</b> ${sp.join(", ")}</div>`;
      }
      powersCell += `</div>`;
    }

    const remaining =
      i === state.history.length - 1 ? 0 : computeRemainingAfterIndex(i);

    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${secretCell}</td>
        <td>${guessCell}</td>
        <td>${fbCell}</td>
        <td>${powersCell}</td>
        <td>${remaining}</td>
      </tr>
    `;
  });

  html += `</table>`;

  // Competitive mode: Next Round button
  if (
    state.phase === "roundSummary" &&
    state.matchMeta &&
    !state.matchMeta.matchOver
  ) {
    html += `
      <div class="summary-actions">
        <button id="nextRoundBtn" class="primary-btn">Next Round</button>
      </div>
    `;
  }

  container.innerHTML = html;

  // Wire button (if present)
  const btn = $("nextRoundBtn");
  if (btn) {
    btn.onclick = () => {
      window.sendGameAction(state.roomId, { type: "NEXT_ROUND" });
    };
  }
}
