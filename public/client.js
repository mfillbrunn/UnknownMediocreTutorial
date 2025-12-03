// client.js — Updated Multiplayer Front-End Logic (Improved UI + Sync + Powers + Animations)
// With Corrected Lobby Flow: Create/Join Room → Show Code → Choose Role → Enter Game

// =============================================================
// SOCKET INITIALIZATION
// =============================================================
const socket = io({ autoConnect: true, reconnection: true });

let roomId = null;
let myPlayerRole = null; // "A", "B", "spectator"

// authoritative server-side state
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
  hideTilePendingCount: 0,
  revealGreenUsed: false,
  freezeSecretUsed: false,
  freezeActive: false
};

let revealGreenInfo = null;

// constraint helpers
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
let letterStates = new Array(26).fill("unknown");
let positionGreens = new Array(5).fill(null);
let letterNotPositions = Array.from({ length: 26 }, () => new Set());

function idxFromLetter(ch) {
  return ch.charCodeAt(0) - 65;
}

// =============================================================
// DOM HELPERS
// =============================================================
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

function showPopup(message, duration = 1200) {
  const box = $("turnPopup");
  box.innerText = message;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), duration);
}

function showToast(msg) {
  const t = $("toast");
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// =============================================================
// LOBBY LOGIC
// =============================================================

const lobbyStatus = $("lobbyStatus");
const roomInfoDiv = $("roomInfo");
const roomCodeLabel = $("roomCodeLabel");
const playerRoleLabel = $("playerRoleLabel");

/* -------------------------------------------------------------
   CREATE ROOM — new logic: NO auto-assign, show code + role picker
------------------------------------------------------------- */
$("createRoomBtn").onclick = () => {
  socket.emit("createRoom", (res) => {
    if (!res.ok) {
      lobbyStatus.innerText = "Error creating room.";
      return;
    }

    roomId = res.roomId;

    // Show room code and role picker
    lobbyStatus.innerText = `Room created! Share this code:\n${roomId}`;
    roomCodeLabel.innerText = roomId;
    roomInfoDiv.style.display = "block";

    // Role picker for the creator
    $("rolePicker").innerHTML = "";
    res.availableRoles.forEach(r => {
      const btn = document.createElement("button");
      btn.innerText = r.toUpperCase();
      btn.onclick = () => {
        socket.emit("chooseRole", { roomId, role: r }, (cRes) => {
          if (cRes.ok) {
            myPlayerRole = r;
            playerRoleLabel.innerText = `Player ${myPlayerRole}`;
          }
        });
      };
      $("rolePicker").appendChild(btn);
    });
  });
};

/* -------------------------------------------------------------
   JOIN ROOM — new logic: NO auto-assign, show code + role picker
------------------------------------------------------------- */
$("joinRoomBtn").onclick = () => {
  const input = $("joinRoomInput").value.trim().toUpperCase();
  if (!input) return;

  socket.emit("joinRoom", input, (res) => {
    if (!res.ok) {
      lobbyStatus.innerText = res.error;
      return;
    }

    roomId = res.roomId;

    lobbyStatus.innerText = `Joined room ${roomId}. Pick your role:`;
    roomCodeLabel.innerText = roomId;
    roomInfoDiv.style.display = "block";

    $("rolePicker").innerHTML = "";
    res.availableRoles.forEach(r => {
      const btn = document.createElement("button");
      btn.innerText = r.toUpperCase();
      btn.onclick = () => {
        socket.emit("chooseRole", { roomId, role: r }, (cRes) => {
          if (cRes.ok) {
            myPlayerRole = r;
            playerRoleLabel.innerText = `Player ${myPlayerRole}`;
          }
        });
      };
      $("rolePicker").appendChild(btn);
    });
  });
};

/* 
   ENTER GAME — allowed only after room chosen + role chosen
*/
$("enterGameBtn").onclick = () => {
  if (!roomId) {
    alert("Create or join a room first.");
    return;
  }
  if (!myPlayerRole) {
    alert("Pick a role first.");
    return;
  }
  showScreen("menu");
  renderAll();
};

$("backToLobbyBtn").onclick = () => showScreen("lobby");

// =============================================================
// SOCKET EVENTS
// =============================================================

// Full state from server
socket.on("stateUpdate", (s) => {
  roundNumber = s.roundNumber;
  setter = s.setter;
  guesser = s.guesser;
  turn = s.turn;

  secret = s.secret;
  pendingGuess = s.pendingGuess;
  guessCount = s.guessCount;
  firstSecretSet = s.firstSecretSet;
  history = s.history || [];
  roundStats = s.roundStats || roundStats;
  powers = s.powers || powers;
  revealGreenInfo = s.revealGreenInfo || null;

  renderAll();
  handleTurnChange();
});

// Power notifications → toast
socket.on("powerUsed", ({ player, type }) => {
  const nice = {
    "USE_HIDE_TILE": "Hide Tile",
    "USE_REVEAL_GREEN": "Reveal Green",
    "USE_FREEZE_SECRET": "Freeze Secret"
  }[type] || type;

  showToast(`Player ${player} used ${nice}!`);
});

// Flip animations
socket.on("animateTurn", ({ type }) => {
  if (type === "guesserSubmitted") animateGuessRow();
  if (type === "setterSubmitted") animateFeedbackRow();
});

// Rejoin after tab minimizing / reconnection
socket.on("reconnect", () => {
  if (roomId && myPlayerRole) {
    socket.emit("rejoinRoom", { roomId, role: myPlayerRole });
  }
});

// =============================================================
// TURN LOGIC
// =============================================================

let lastTurn = null;

function handleTurnChange() {
  if (turn === lastTurn) return;
  lastTurn = turn;

  if (!myPlayerRole) return;

  if (turn === myPlayerRole) {
    showPopup("YOUR TURN!", 1200);
    if (myPlayerRole === setter) showScreen("setterScreen");
    else if (myPlayerRole === guesser) showScreen("guesserScreen");
  } else if (turn === "none") {
    showPopup("Round Finished", 1500);
  } else {
    showPopup("Waiting for opponent…", 1000);
  }
}

// =============================================================
// SEND ACTION
// =============================================================
function sendAction(type, extra = {}) {
  if (!roomId) return alert("Not in a room.");
  socket.emit("gameAction", { roomId, action: { type, ...extra } });
}

// =============================================================
// CONSTRAINT LOGIC
// =============================================================
function resetConstraints() {
  letterStates = new Array(26).fill("unknown");
  positionGreens = new Array(5).fill(null);
  letterNotPositions = Array.from({ length: 26 }, () => new Set());
}

function statePriority(s) {
  return { unknown: 0, gray: 1, yellow: 2, green: 3 }[s] ?? 0;
}

function computeConstraints() {
  resetConstraints();

  for (const h of history) {
    const guess = h.guess.toUpperCase();
    const fb = h.fb;
    const hidden = h.hiddenIndices || [];

    for (let i = 0; i < 5; i++) {
      if (hidden.includes(i)) continue;

      const ch = guess[i];
      const idx = idxFromLetter(ch);

      if (fb[i] === "🟩") {
        positionGreens[i] = ch;
        if (statePriority(letterStates[idx]) < 3) letterStates[idx] = "green";
      } else if (fb[i] === "🟨") {
        if (statePriority(letterStates[idx]) < 2) letterStates[idx] = "yellow";
        letterNotPositions[idx].add(i);
      } else if (fb[i] === "⬛") {
        if (letterStates[idx] === "unknown" || letterStates[idx] === "gray") {
          letterStates[idx] = "gray";
        }
      }
    }
  }

  if (revealGreenInfo) {
    const pos = revealGreenInfo.pos;
    const letter = revealGreenInfo.letter;
    positionGreens[pos] = letter;
    const idx = idxFromLetter(letter);
    if (statePriority(letterStates[idx]) < 3) letterStates[idx] = "green";
  }
}

// =============================================================
// RENDERING
// =============================================================
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
      parts.push(notPos.length ? `${letter} (not ${notPos.join(", ")})` : letter);
    }
  }
  $("mustContainSetter").innerText = parts.length ? parts.join(", ") : "none";
  $("mustContainGuesser").innerText = parts.length ? parts.join(", ") : "none";
}

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
      fb[i] = pos !== -1 ? "🟨" : "⬛";
      if (pos !== -1) rem[pos] = null;
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
    const guessUp = h.guess.toUpperCase();
    const fb = h.fb;
    const hi = h.hiddenIndices || [];

    setterLines.push(`${guessUp}   ${fb.join("")}`);

    const masked = fb.map((x, i) => (hi.includes(i) ? "❔" : x));
    guesserLines.push(`${guessUp}   ${masked.join("")}`);
  }

  $("historySetter").innerText = setterLines.join("\n");
  $("historyGuesser").innerText = guesserLines.join("\n");
}

function handleKeyPress(target, key) {
  const id = target === "setter" ? "newSecretInput" : "guessInput";
  const input = $(id);
  if (!input) return;

  if (key === "BACK") input.value = input.value.slice(0, -1);
  else if (input.value.length < 5) input.value += key;
}

function renderKeyboard(id, target) {
  const container = $(id);
  container.innerHTML = "";

  KEY_ROWS.forEach((row, rowIndex) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";

    row.split("").forEach(ch => {
      const btn = document.createElement("span");
      btn.className = "key";

      const idx = idxFromLetter(ch);
      const st = letterStates[idx];

      if (st === "green") btn.classList.add("key-green");
      else if (st === "yellow") btn.classList.add("key-yellow");
      else if (st === "gray") btn.classList.add("key-gray");

      btn.innerText = ch;
      btn.onclick = () => handleKeyPress(target, ch);
      rowDiv.appendChild(btn);
    });

    if (rowIndex === 2) {
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
  $("btnHideTile").classList.toggle("power-used", powers.hideTileUsed);
  $("btnRevealGreen").classList.toggle("power-used", powers.revealGreenUsed);
  $("btnFreezeSecret").classList.toggle("power-used", powers.freezeSecretUsed);

  // Freeze secret → lock setter UI
  if (powers.freezeActive && myPlayerRole === setter) {
    $("submitSetterNewBtn").disabled = true;
    $("submitSetterNewBtn").classList.add("disabled");

    $("submitSetterSameBtn").disabled = false;
    $("submitSetterSameBtn").classList.add("highlight-green");
  } else {
    $("submitSetterNewBtn").disabled = false;
    $("submitSetterNewBtn").classList.remove("disabled");
    $("submitSetterSameBtn").classList.remove("highlight-green");
  }
}

function renderMenu() {
  $("menuRoomCode").innerText = roomId || "-";
  $("menuPlayerRole").innerText = myPlayerRole ? `Player ${myPlayerRole}` : "-";

  $("roundLabel").innerText = roundNumber;
  $("roleLabel").innerText =
    `Round ${roundNumber}: Player ${setter} = Setter, Player ${guesser} = Guesser`;

  $("turnLabel").innerText =
    turn === setter
      ? `Setter (Player ${setter})`
      : (turn === guesser ? `Guesser (Player ${guesser})` : "Round finished");

  $("setterWho").innerText = `(Player ${setter})`;
  $("guesserWho").innerText = `(Player ${guesser})`;
  $("guessCountMenu").innerText = guessCount;

  $("btnSetter").classList.remove("turn-active");
  $("btnGuesser").classList.remove("turn-active");
  if (turn === setter) $("btnSetter").classList.add("turn-active");
  if (turn === guesser) $("btnGuesser").classList.add("turn-active");

  renderRoundSummary();
}

function renderRoundSummary() {
  const box = $("roundSummary");
  box.style.display = "none";

  const stats = roundStats[roundNumber];
  if (!stats || stats.guesses == null || turn !== "none") return;

  box.style.display = "block";

  if (roundNumber === 1) {
    box.innerText =
      `Round 1 complete.\nGuesser (Player ${stats.guesser}) needed ${stats.guesses} guesses.\nPress below to start round 2.`;

    const br = document.createElement("br");
    const btn = document.createElement("button");
    btn.innerText = "Start Round 2";
    btn.onclick = () => sendAction("START_ROUND_2");
    box.appendChild(br);
    box.appendChild(btn);

  } else {
    const g1 = roundStats[1].guesses;
    const g2 = roundStats[2].guesses;
    const guesser1 = roundStats[1].guesser;
    const guesser2 = roundStats[2].guesser;

    let txt =
      `Round 1: Player ${guesser1} – ${g1} guesses\n` +
      `Round 2: Player ${guesser2} – ${g2} guesses\n`;

    txt += (g1 < g2)
      ? `Winner: Player ${guesser1}`
      : (g2 < g1)
      ? `Winner: Player ${guesser2}`
      : "Draw!";

    box.innerText = txt;

    const br = document.createElement("br");
    const btn = document.createElement("button");
    btn.innerText = "Start New Match";
    btn.onclick = () => sendAction("NEW_MATCH");
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

// Full update
function renderAll() {
  computeConstraints();
  renderPatterns();
  renderHistory();
  renderMenu();
  renderSetterScreen();
  renderGuesserScreen();
  updatePowerButtons();
}

// =============================================================
// ANIMATIONS (Wordle-like flip)
// =============================================================
function animateGuessRow() {
  const popup = $("guessAnim");
  popup.classList.add("flip");
  setTimeout(() => popup.classList.remove("flip"), 700);
}

function animateFeedbackRow() {
  const popup = $("feedbackAnim");
  popup.classList.add("flip");
  setTimeout(() => popup.classList.remove("flip"), 700);
}

// =============================================================
// BUTTON HANDLERS
// =============================================================

$("btnSetter").onclick = () => {
  if (myPlayerRole !== setter) return alert("You are not the setter.");
  showScreen("setterScreen");
};

$("btnGuesser").onclick = () => {
  if (myPlayerRole !== guesser) return alert("You are not the guesser.");
  showScreen("guesserScreen");
};

$("setterBackToMenuBtn").onclick = () => showScreen("menu");
$("guesserBackToMenuBtn").onclick = () => showScreen("menu");

// Guess
$("submitGuessBtn").onclick = () => {
  if (myPlayerRole !== guesser) return alert("Not the guesser.");
  if (turn !== guesser) return alert("Not your turn.");

  const g = $("guessInput").value.trim().toLowerCase();
  if (g.length !== 5) return alert("Guess must be 5 letters.");

  $("guessInput").value = "";
  sendAction("SUBMIT_GUESS", { guess: g });
};

// Setter
$("submitSetterNewBtn").onclick = () => {
  if (myPlayerRole !== setter) return alert("Not the setter.");
  if (turn !== setter) return alert("Not your turn.");

  const w = $("newSecretInput").value.trim().toLowerCase();
  if (w.length !== 5) return alert("Secret must be 5 letters.");

  $("newSecretInput").value = "";
  sendAction("SET_SECRET_NEW", { secret: w });
};

$("submitSetterSameBtn").onclick = () => {
  if (myPlayerRole !== setter) return alert("Not the setter.");
  if (turn !== setter) return alert("Not your turn.");
  if (!firstSecretSet) return alert("You must set a first secret.");

  sendAction("SET_SECRET_SAME");
};

// Powers
$("btnHideTile").onclick = () => {
  if (myPlayerRole !== setter) return alert("Only setter.");
  if (powers.hideTileUsed && powers.hideTilePendingCount === 0) {
    return alert("Hide tile already fully used.");
  }
  sendAction("USE_HIDE_TILE");
};

$("btnRevealGreen").onclick = () => {
  if (myPlayerRole !== guesser) return alert("Only guesser.");
  if (powers.revealGreenUsed) return alert("Already used.");
  sendAction("USE_REVEAL_GREEN");
};

$("btnFreezeSecret").onclick = () => {
  if (myPlayerRole !== guesser) return alert("Only guesser.");
  if (powers.freezeSecretUsed) return alert("Already used.");
  sendAction("USE_FREEZE_SECRET");
};

// Menu new match
$("newMatchBtn").onclick = () => sendAction("NEW_MATCH");

renderAll();
