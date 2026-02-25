// Lobby events
onLobbyEvent(evt => {
  switch (evt.type) {

    case "playerJoined":
      toast("A player joined.");
      $("waitingForPlayer")?.classList.add("hidden");
      break;

  case "rolesSwitched":
    toast("Roles have been switched.");
    break;
case "playerKicked":
  toast("Opponent disconnected too long. You win.");
  break;

case "playerLeft": {
      const msg =
        evt.reason === "kicked"
          ? "Your opponent was kicked."
          : evt.reason === "disconnect"
          ? "Your opponent disconnected."
          : "Your opponent left the room.";
    
      toast(msg);
      break;
    }

    case "playerReady":
      
      toast(`Player is READY`);
      if (evt.playerId === socket.id) {
        enableReadyButton(false);
      }
      break;
    case "playerDisconnected":
      toast("Your opponent disconnected. Waiting to reconnect…");
      break;

    case "hideLobby":
      $("waitingForPlayer")?.classList.add("hidden");
      hide("lobby");
      hide("menu");
      show(myRole === "A" ? "setterScreen" : "guesserScreen");
      enableReadyButton(false);
      break;

      case "enterLobby":
        myRole = null;
        show("lobby");
        hide("menu");
        break;
      
    case "gameOverShowMenu":
      hide("setterScreen");
      hide("guesserScreen");
      show("menu");
      enableReadyButton(false);
      break;
  }
});

// State updates
onStateUpdate(newState => {
  const prevPhase = state?.phase;
  const prevSetterDraft = state?.setterDraft || "";
  state = JSON.parse(JSON.stringify(newState));
  if (prevPhase !== "simultaneous" && state.phase === "simultaneous" && prevRenderState.length > 0) {
      prevRenderState = [];
      $("setterGuesserSubmitted").innerHTML = "";
      $("historyGuesser").innerHTML = "";
  }  
  const newMyRole = state.roles && state.roles[socket.id];
  if (newMyRole !== myRole) {
    myRole = newMyRole;
    updateRoleLabels();
  }
  const setterCanEdit =  myRole === state.setter &&  ((state.phase === "normal" && state.turn === state.setter &&!!state.pendingGuess) || (state.phase === "simultaneous" && !state.secret && !state.simultaneousSecretSubmitted));
  if (setterCanEdit) {
    state.setterDraft = prevSetterDraft;
  } else {
    state.setterDraft = "";
  }
  if (!PowerEngine._initialized && roomId && myRole && state && state.phase !== "lobby") {
      PowerEngine.renderButtons(roomId);
      PowerEngine._initialized = true;
  }
  // Extra clearing after simultaneous round
  if (prevPhase !== state.phase) {stopSecretRoulette();}
  window.state = state;   
  updateRoleCards();
  updateHostControls();
  updateRankedUI();
  updateShuffleUI();
  updateDevUI();
  updateTimerAccess(); 
  updateTimerPresetUI();
  updateWaitingIndicator();
  updatePowerInfoState(state);
  updateTimerVisibility();
  updateAppHeader(state);
  updateLobbyHeader();
  updateUI();
  updateSummary();
  maybeStartRouletteFromState(state);
  if (state.phase === "simultaneous"){renderSetterRemainingBox(state, myRole, "");}
  if (state.phase === "normal"){renderSetterRemainingBox(state, myRole, state.secret);}
  tutorialSteps(state, myRole);
  remainingCache.setterOld = null;
});


// Power UI hook (client-side effects)
let powerQueue = [];

onPowerUsed(data => {
  console.log(data.type);
  console.log(data.variant);
  console.log(!PowerEngine._initialized);
  if (!PowerEngine._initialized) {
    powerQueue.push(data);
    return;
  }
  triggerPowerFX(data.type, data.variant);
  const mod = PowerEngine.powers[data.type];
  mod?.effects?.onPowerUsed?.(data);
  PowerEngine.updateButtonStates(state, myRole);
  if (state.powers?.vowelRefreshActive && state.powers?.rouletteSecretActive){
    stopSecretRoulette();
    startSecretRoulette(state.powers.rouletteSecretFeasible);
    }
});


// After renderButtons is called:
if (!PowerEngine._initialized && roomId && roleAssigned) {
  PowerEngine.renderButtons(roomId);
  PowerEngine._initialized = true;

  // flush queue
  for (const p of powerQueue) {
    const mod = PowerEngine.powers[p.type];
    mod?.effects?.onPowerUsed?.(p);
  }
  powerQueue = [];
}

