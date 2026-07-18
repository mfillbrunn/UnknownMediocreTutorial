// client/dev-powers.js — Dev Mode power picker (host chooses which powers
// are in play instead of automatically getting all of them).
//
// Mirrors the SETTER_POWERS/GUESSER_POWERS pools in
// server/core/phases/lobby.js — kept in sync manually, same as every
// other client/server power-pool duplication in this codebase.

const DEV_SETTER_POWERS = [
  "hideTile",
  "suggestSecret",
  "confuseColors",
  "countOnly",
  "blindSpot",
  "vowelRefresh",
  "forceGuess",
  "blindGuess",
  "fakeFeedback",
  "revealPenalty"
];

const DEV_GUESSER_POWERS = [
  "suggestGuess",
  "rouletteSecret",
  "forceTimer",
  "revealHistory",
  "stealthGuess",
  "revealGreen",
  "freezeSecret",
  "magicMode",
  "revealLetter",
  "nonsense",
  "betMiss",
  "fieldReport",
  "wiretap",
  "letterProbe",
  "revealLocation",
  "doubleGuess",
  "letterProfile"
];

function buildDevPowerCheckboxes(containerId, powerIds, lastSelected) {
  const list = document.getElementById(containerId);
  if (!list) return;

  // lastSelected is the array the host confirmed last time (may be empty
  // from "Deselect All"). Only fall back to "all checked" when nothing has
  // ever been confirmed yet (null/undefined).
  const hasPriorSelection = Array.isArray(lastSelected);

  list.innerHTML = powerIds.map(id => {
    const meta = window.POWER_METADATA?.[id];
    const checked = hasPriorSelection ? lastSelected.includes(id) : true;
    return `
      <label class="dev-power-checkbox">
        <input type="checkbox" value="${id}" ${checked ? "checked" : ""} />
        <span class="dev-power-checkbox-emoji">${meta?.emoji || ""}</span>
        <span class="dev-power-checkbox-label">${meta?.label || id}</span>
      </label>
    `;
  }).join("");
}

function getCheckedDevPowers(containerId) {
  const list = document.getElementById(containerId);
  if (!list) return [];
  return Array.from(list.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);
}

window.openDevPowersModal = function () {
  buildDevPowerCheckboxes("devSetterPowersList", DEV_SETTER_POWERS, window.state?._devSetterPowers);
  buildDevPowerCheckboxes("devGuesserPowersList", DEV_GUESSER_POWERS, window.state?._devGuesserPowers);
  document.getElementById("devPowersModal")?.classList.add("active");
};

function closeDevPowersModal() {
  document.getElementById("devPowersModal")?.classList.remove("active");
}

document.getElementById("devPowersConfirmBtn")?.addEventListener("click", () => {
  const setterPowers = getCheckedDevPowers("devSetterPowersList");
  const guesserPowers = getCheckedDevPowers("devGuesserPowersList");

  sendGameAction({
    type: "SET_DEV_POWERS",
    setterPowers,
    guesserPowers,
    userId: window.currentUser.id
  });

  closeDevPowersModal();
});

document.getElementById("devPowersAllBtn")?.addEventListener("click", () => {
  document.querySelectorAll("#devPowersModal input[type=checkbox]").forEach(cb => { cb.checked = true; });
});

document.getElementById("devPowersNoneBtn")?.addEventListener("click", () => {
  document.querySelectorAll("#devPowersModal input[type=checkbox]").forEach(cb => { cb.checked = false; });
});

document.getElementById("devPowersCancelBtn")?.addEventListener("click", () => {
  closeDevPowersModal();
});
