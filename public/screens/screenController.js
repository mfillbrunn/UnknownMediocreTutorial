// screenController.js
import { DOM } from "../domUtils.js";
import { ClientState } from "../clientState.js";

export function updateScreens() {
  const { state, myRole } = ClientState;
  if (!state) return;

  if (state.phase === "lobby") {
    showLobby();
    return;
  }

  DOM.hide("lobby");
  DOM.hide("menu");

  if (state.phase === "gameOver" || state.phase === "roundSummary") {
    DOM.show("menu");
    return;
  }

  if (myRole === state.setter) {
    DOM.show("setterScreen");
    DOM.hide("guesserScreen");
  } else {
    DOM.show("guesserScreen");
    DOM.hide("setterScreen");
  }
}

function showLobby() {
  DOM.show("lobby");
  DOM.hide("menu");
  DOM.hide("setterScreen");
  DOM.hide("guesserScreen");
}
