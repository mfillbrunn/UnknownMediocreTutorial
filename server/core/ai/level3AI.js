const level2 = require("./level2AI");
const AI_POWER_META = require("./aiPowerMeta");

const BASE_POWER_PROB = 0.25;

//helpers
function roleToSemantic(state, role) {
  if (role === state.guesser) return "guesser";
  if (role === state.setter) return "setter";
  return null;
}


function maybeUsePower(state) {
  if (!state.activePowers || state.activePowers.length === 0) return null;
  if (state.powerUsedThisTurn) return null;
  const turn = state.history?.length || 0;
  const p = Math.min(BASE_POWER_PROB + turn * 0.05, 0.5);
  if (Math.random() > p) return null;

  const role = state.turn;
  if (!role) return null;
  const semanticRole = roleToSemantic(state, state.turn);
  if (!semanticRole) return null;
  const usable = state.activePowers.filter(pid => {
    const meta = AI_POWER_META[pid];
    if (!meta) return false;
    if (meta.aiUsable === false) return false;
    if (meta.role !== semanticRole) return false;
    if (meta.isUsed(state)) return false;
    return true;
  });

  if (usable.length === 0) return null;

  const chosen = usable[Math.floor(Math.random() * usable.length)];
  return AI_POWER_META[chosen].buildAction(state);
}

module.exports = {
  ...level2,
  maybeUsePower
};
