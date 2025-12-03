// client.js - front-end multiplayer logic for Competitive Wordle – Powers Edition

// ----------------- SOCKET & LOBBY STATE -----------------

const socket = io();

// room info
let roomId = null;
let myPlayerRole = null; // "A", "B", or "spectator"

// authoritative game state from server
let roundNumber = 1;
let setter = "A";
let guesser = "B";
let turn = "A";

let secret = "";
let pendingGuess = "";
let guessCount = 0;
let firstSecretSet = false;
let history = [];
let roundStats = {
  1: { guesser: null, guesses: null },
  2: { guesser: null, guesses: null }
};
let powers = {
  hideTileUsed: false,
  hideTilePending: false,
  revealGreenUsed: false,
  freezeSecretUsed: false,
  freezeActive: false
};
let revealGreenInfo = null;

// derived constraint structures
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
let letterStates = new Array(26).fill("unknown"); // unknown, gray, yellow, green
let positionGreens = new Array(5).fill(null);
let letterNotPositions = Array.from({ length: 26 }, () => new Set());

function idxFromLetter(ch) {
  return ch.charCodeAt(0) - 65;
}

// ----------------- DOM HELPERS -----------------

function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

// ----------------- LOBBY UI -----------------

const lobbyStatus = $("lobbyStatus");
const roomInfoDiv = $("roomInfo");
const roomCodeLabel = $("roomCodeLabel");
const playerRoleLabel = $("playerRoleLabel");

$("createRoomBtn").onclick = () => {
  socket.emit("createRoom", (res) => {
    roomId = res.roomId;
    myPlayerRole = res.playerRole;
    lobbyStatus.innerText = `Room created. Share this code:\n${roomId}`;
    roomCodeLabel.innerText = roomId;
    playerRoleLabel.innerText = `Player ${myPlayerRole}`;
    roomInfoDiv.style.display = "block";
  });
};

$("joinRoomBtn").onclick = () => {
  const input = $("joinRoomInput").value.trim().toUpperCase();
  if (!input) return;
  socket.emit("joinRoom", input, (res) => {
    if (!res.ok) {
      lobbyStatus.innerText = res.error;
      return;
    }
    roomId = res.roomId;
    myPlayerRole = res.playerRole;
    lobbyStatus.innerText = `Joined room ${roomId}.`;
    roomCodeLabel.innerText = roomId;
    playerRoleLabel.innerText = (myPlayerRole === "spectator")
      ? "Spectator"
      : `Player ${myPlayerRole}`;
    roomInfoDiv.style.display = "block";
  });
};

$("enterGameBtn").onclick = () => {
  if (!roomId) {
    alert("Create or join a room first.");
    return;
  }
  showScreen("menu");
  renderAll();
};

$("backToLobbyBtn").onclick = () => {
  showScreen("lobby");
};

// ----------------- STATE UPDATE FROM SERVER -----------------

socket.on("stateUpdate", (serverState) => {
  roundNumber = serverState.roundNumber;
  setter = serverState.setter;
  guesser = serverState.guesser;
  turn = serverState.turn;

  secret = serverState.secret;
  pendingGuess = serverState.pendingGuess;
  guessCount = serverState.guessCount;
  firstSecretSet = serverState.firstSecretSet;
  history = serverState.history || [];
  roundStats = serverState.roundStats || roundStats;
  powers = serverState.powers || powers;
  revealGreenInfo = serverState.revealGreenInfo || null;

  renderAll();
});

// ----------------- ACTION SENDER -----------------

function sendAction(type, extra = {}) {
  if (!roomId) {
    alert("Not in a room.");
    return;
  }
  socket.emit("gameAction", {
    roomId,
    action: { type, ...extra }
  });
}

// ----------------- GAME RENDERING -----------------

function resetConstraints() {
  letterStates = new Array(26).fill("unknown");
  positionGreens = new Array(5).fill(null);
  letterNotPositions = Array.from({ length: 26 }, () => new Set());
}

function statePriority(s) {
  if (s === "unknown") return 0;
  if (s === "gray") return 1;
  if (s === "yellow") return 2;
  if (s === "green") return 3;
  return 0;
}

function computeConstraints() {
  resetConstraints();

  for (const h of history) {
    const guess = h.guess.toUpperCase();
    const fb = h.fb;
    for (let i = 0; i < 5; i++) {
      const ch = guess[i];
      const idx = idxFromLetter(ch);
      if (fb[i] === "🟩") {
        positionGreens[i] = ch;
        if (statePriority(letterStates[idx]) < statePriority("green")) {
          letterStates[idx] = "green";
        }
      } else if (fb[i] === "🟨") {
        if (statePriority(letterStates[idx]) < statePriority("yellow")) {
          letterStates[idx] = "yellow";
        }
        letterNotPositions[idx].add(i);
      } else if (fb[i] === "⬛") {
        if (letterStates[idx] === "unknown" || letterStates[idx] === "gray") {
          letterStates[idx] = "gray";
        }
      }
    }
  }

  // incorporate reveal-green info (optional)
  if (revealGreenInfo && revealGreenInfo.letter && typeof revealGreenInfo.pos === "number") {
    const pos = revealGreenInfo.pos;
    const letter = revealGreenInfo.letter;
    positionGreens[pos] = letter;
    const idx = idxFromLetter(letter);
    if (statePriority(letterStates[idx]) < statePriority("green")) {
      letterStates[idx] = "green";
    }
  }
}

function renderPatterns() {
  const patternArr = [];
  for (let i = 0; i < 5; i++) {
    patternArr.push(positionGreens[i] ? positionGreens[i] : "-");
  }
  const patt = patternArr.join(" ");

  $("knownPatternSetter").innerText = patt;
  $("knownPatternGuesser").innerText = patt;

  const parts = [];
  for (let idx = 0; idx < 26; idx++) {
    if (letterStates[idx] === "yellow") {
      const letter = String.fromCharCode(65 + idx);
      const notPos = Array.from(letterNotPositions[idx]).map(p => p + 1);
      if (notPos.length)
        parts.push(`${letter} (not ${notPos.join(", ")})`);
      else
        parts.push(letter);
    }
  }
  const must = parts.length ? parts.join(", ") : "none";
  $("mustContainSetter").innerText = must;
  $("mustContainGuesser").innerText = must;
}

// used only for setter hypothetical
function scoreGuessLocal(secretWord, guess) {
  const fb = ["", "", "", "", ""];
  const rem = secretWord.split("");

  for (let i = 0; i < 5; i++) {
    if (guess[i] === secretWord[i]) {
      fb[i] = "🟩";
      rem[i] = null;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (fb[i] === "") {
      const pos = rem.indexOf(guess[i]);
      if (pos !== -1) {
        fb[i] = "🟨";
        rem[pos] = null;
      } else {
        fb[i] = "⬛";
      }
    }
  }
  return fb;
}

function renderHypothetical() {
  const box = $("hypotheticalBox");
  if (!pendingGuess || !secret || !firstSecretSet) {
    box.style.display = "none";
    return;
  }
  const fb = scoreGuessLocal(secret, pendingGuess);
  box.innerHTML = `<b>If you KEEP the same secret, feedback would be:</b><br>${fb.join("")}`;
  box.style.display = "block";
}

function renderHistory() {
  if (!history.length) {
    $("historySetter").innerText = "No guesses yet.";
    $("historyGuesser").innerText = "No guesses yet.";
    return;
  }

  const setterLines = [];
  const guesserLines = [];

  for (const h of history) {
    const fullFB = h.fb.join("");
    const guessUp = h.guess.toUpperCase();
    setterLines.push(`${guessUp}   ${fullFB}`);

    const fbArr = h.fb.map((x, i) => (h.hiddenIndex === i ? "❔" : x));
    guesserLines.push(`${guessUp}   ${fbArr.join("")}`);
  }

  $("historySetter").innerText = setterLines.join("\n");
  $("historyGuesser").innerText = guesserLines.join("\n");
}

function handleKeyPress(target, key) {
  const inputId = target === "setter" ? "newSecretInput" : "guessInput";
  const input = $(inputId);

  if (!input) return;

  if (key === "BACK") {
    input.value = input.value.slice(0, -1);
    return;
  }
  if (input.value.length >= 5) return;
  input.value += key;
}

function renderKeyboard(containerId, target) {
  const container = $(containerId);
  container.innerHTML = "";

  const guessLetters = pendingGuess ? pendingGuess.toUpperCase().split("") : [];

  KEY_ROWS.forEach((row, rowIndex) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    row.split("").forEach(ch => {
      const btn = document.createElement("span");
      btn.className = "key";
      const idx = idxFromLetter(ch);
      const state = letterStates[idx];

      if (state === "green") btn.classList.add("key-green");
      else if (state === "yellow") btn.classList.add("key-yellow");
      else if (state === "gray") btn.classList.add("key-gray");

      if (target === "setter" && guessLetters.includes(ch)) {
        btn.classList.add("key-red-outline");
      }

      btn.innerText = ch;
      btn.onclick = () => handleKeyPress(target, ch);
      rowDiv.appendChild(btn);
    });

    if (rowIndex === KEY_ROWS.length - 1) {
      const back = document.createElement("span");
      back.className = "key key-special";
      back.innerText = "⌫";
      back.onclick = () => handleKeyPress(target, "BACK");
      rowDiv.appendChild(back);
    }

    container.appendChild(rowDiv);
  });
}

function updatePowerButtons() {
  const hideBtn = $("btnHideTile");
  const revealBtn = $("btnRevealGreen");
  const freezeBtn = $("btnFreezeSecret");

  hideBtn.classList.toggle("power-used", powers.hideTileUsed);
  revealBtn.classList.toggle("power-used", powers.revealGreenUsed);
  freezeBtn.classList.toggle("power-used", powers.freezeSecretUsed);
}

function renderMenu() {
  $("menuRoomCode").innerText = roomId || "-";
  $("menuPlayerRole").innerText = myPlayerRole
    ? (myPlayerRole === "spectator" ? "Spectator" : `Player ${myPlayerRole}`)
    : "-";

  $("roundLabel").innerText = String(roundNumber);
  const roleLabelText =
    `Round ${roundNumber}: Player ${setter} = Setter, Player ${guesser} = Guesser`;
  $("roleLabel").innerText = roleLabelText;

  const turnText =
    turn === setter
      ? `Setter (Player ${setter})`
      : (turn === guesser ? `Guesser (Player ${guesser})` : "Round finished");
  $("turnLabel").innerText = turnText;

  $("setterWho").innerText = `(Player ${setter})`;
  $("guesserWho").innerText = `(Player ${guesser})`;
  $("guessCountMenu").innerText = String(guessCount);

  // highlight active turn button
  $("btnSetter").classList.remove("turn-active");
  $("btnGuesser").classList.remove("turn-active");
  if (turn === setter) $("btnSetter").classList.add("turn-active");
  else if (turn === guesser) $("btnGuesser").classList.add("turn-active");

  // badges on screens
  $("setterRoleTag").innerText = `Player ${setter} (Setter)`;
  $("guesserRoleTag").innerText = `Player ${guesser} (Guesser)`;

  // round summary
  renderRoundSummary();
}

function renderRoundSummary() {
  const box = $("roundSummary");
  box.style.display = "none";
  box.innerHTML = "";

  // Round considered over if turn === "none" and stats exist for this round
  const stats = roundStats[roundNumber];
  if (!stats || stats.guesses == null || turn !== "none") {
    return;
  }

  box.style.display = "block";

  if (roundNumber === 1) {
    box.innerText =
      `Round 1 complete.\nGuesser (Player ${stats.guesser}) needed ${stats.guesses} guesses.\nPress "Start Round 2" to swap roles.`;

    const br = document.createElement("br");
    const btn = document.createElement("button");
    btn.innerText = "Start Round 2";
    btn.onclick = () => {
      sendAction("START_ROUND_2");
    };
    box.appendChild(br);
    box.appendChild(btn);
  } else {
    const g1 = roundStats[1].guesses;
    const g2 = roundStats[2].guesses;
    const guesser1 = roundStats[1].guesser;
    const guesser2 = roundStats[2].guesser;

    let txt =
      `Round 1: Guesser Player ${guesser1} – ${g1} guesses\n` +
      `Round 2: Guesser Player ${guesser2} – ${g2} guesses\n`;

    if (g1 < g2) {
      txt += `Winner: Player ${guesser1}`;
    } else if (g2 < g1) {
      txt += `Winner: Player ${guesser2}`;
    } else {
      txt += "Result: Draw (same number of guesses).";
    }

    box.innerText = txt;
    const br = document.createElement("br");
    const btn = document.createElement("button");
    btn.innerText = "Start New Match";
    btn.onclick = () => {
      sendAction("NEW_MATCH");
    };
    box.appendChild(br);
    box.appendChild(btn);
  }
}

function renderSetterScreen() {
  $("secretWordDisplay").innerText = secret ? secret.toUpperCase() : "NONE";
  $("pendingGuessDisplay").innerText = pendingGuess ? pendingGuess.toUpperCase() : "-";
  renderHypothetical();
  renderHistory();
  renderKeyboard("keyboardSetter", "setter");
}

function renderGuesserScreen() {
  renderHistory();
  renderKeyboard("keyboardGuesser", "guesser");
}

function renderAll() {
  computeConstraints();
  renderPatterns();
  renderHistory();
  renderMenu();
  renderSetterScreen();
  renderGuesserScreen();
  updatePowerButtons();
}

// ----------------- BUTTON HANDLERS -----------------

// Menu "Setter Screen" button
$("btnSetter").onclick = () => {
  if (!myPlayerRole || myPlayerRole === "spectator") {
    alert("You are not a player.");
    return;
  }
  if (setter !== myPlayerRole) {
    alert(`You are Player ${myPlayerRole}, but Player ${setter} is the setter this round.`);
    return;
  }
  showScreen("setterScreen");
};

// Menu "Guesser Screen" button
$("btnGuesser").onclick = () => {
  if (!myPlayerRole || myPlayerRole === "spectator") {
    alert("You are not a player.");
    return;
  }
  if (guesser !== myPlayerRole) {
    alert(`You are Player ${myPlayerRole}, but Player ${guesser} is the guesser this round.`);
    return;
  }
  showScreen("guesserScreen");
};

$("setterBackToMenuBtn").onclick = () => {
  showScreen("menu");
};

$("guesserBackToMenuBtn").onclick = () => {
  showScreen("menu");
};

// Guess submission
$("submitGuessBtn").onclick = () => {
  if (myPlayerRole !== guesser) {
    alert("You are not the guesser this round.");
    return;
  }
  if (turn !== guesser) {
    alert("It's not the guesser's turn.");
    return;
  }

  const g = $("guessInput").value.trim().toLowerCase();
  if (g.length !== 5) {
    alert("Guess must be 5 letters.");
    return;
  }
  $("guessInput").value = "";

  sendAction("SUBMIT_GUESS", { guess: g });
};

// Setter new secret
$("submitSetterNewBtn").onclick = () => {
  if (myPlayerRole !== setter) {
    alert("You are not the setter this round.");
    return;
  }
  if (turn !== setter) {
    alert("It's not the setter's turn.");
    return;
  }
  const w = $("newSecretInput").value.trim().toLowerCase();
  if (w.length !== 5) {
    alert("Secret must be 5 letters.");
    return;
  }
  $("newSecretInput").value = "";

  sendAction("SET_SECRET_NEW", { secret: w });
};

// Setter same secret
$("submitSetterSameBtn").onclick = () => {
  if (myPlayerRole !== setter) {
    alert("You are not the setter this round.");
    return;
  }
  if (turn !== setter) {
    alert("It's not the setter's turn.");
    return;
  }
  if (!firstSecretSet) {
    alert("You must set the first secret first.");
    return;
  }
  sendAction("SET_SECRET_SAME");
};

// Powers
$("btnHideTile").onclick = () => {
  if (myPlayerRole !== setter) {
    alert("Only the setter can use this power.");
    return;
  }
  if (powers.hideTileUsed) {
    alert("Hide-tile power already used this round.");
    return;
  }
  sendAction("USE_HIDE_TILE");
};

$("btnRevealGreen").onclick = () => {
  if (myPlayerRole !== guesser) {
    alert("Only the guesser can use this power.");
    return;
  }
  if (powers.revealGreenUsed) {
    alert("Reveal-green power already used this round.");
    return;
  }
  sendAction("USE_REVEAL_GREEN");
};

$("btnFreezeSecret").onclick = () => {
  if (myPlayerRole !== guesser) {
    alert("Only the guesser can use this power.");
    return;
  }
  if (powers.freezeSecretUsed) {
    alert("Freeze-secret power already used this round.");
    return;
  }
  sendAction("USE_FREEZE_SECRET");
};

// New match from menu (hard reset)
$("newMatchBtn").onclick = () => {
  sendAction("NEW_MATCH");
};

// ----------------- INIT -----------------

// initial render for lobby
renderAll();
