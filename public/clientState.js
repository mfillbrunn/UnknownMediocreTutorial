// clientState.js
export const ClientState = {
  roomId: null,
  myRole: null,
  state: null,
  localGuesserDraft: "",
  roleAssigned: false,
  lastSimulSecret: false,
  lastSimulGuess: false,
  KeepEnabled: true,
  NewEnabled: true,
  rouletteInterval: null,
  rouletteWords: null,
  lastTimeRemaining: { A: null, B: null },
  isRejoining: false
};

export const VOWELS = new Set(["A", "E", "I", "O", "U"]);
