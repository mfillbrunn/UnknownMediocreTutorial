// client/tooltips.js -- two things the rest of the client actually uses:
// the power-metadata lookup, and the power/quest action modal.
//
// The hover-tooltip system that gave this file its name was disabled
// behind a permanently-false flag, and the "power info panel" it fed
// (buildPowerInfoPanel/initPowerInfoButton/updatePowerInfoState) queried
// #powerInfoPanelSetter/#powerInfoPanelGuesser and #powerInfoBtn*, none of
// which exist in index.html any more -- so every one of those paths was
// dead on arrival. Both are gone; what follows is what still runs.

// powerEngine.js (or a shared client helper)
window.getPowerMeta = function (
  id,
  variant
) {
  const base =
    window.POWER_METADATA?.[id];

  if (!base) {
    return null;
  }

  const variantMeta =
    variant &&
    base.variants?.[variant]
      ? base.variants[variant]
      : null;

  return {
    ...base,
    ...(variantMeta || {}),

    opponentDesc:
      variantMeta?.opponentDesc ||
      base.opponentDesc ||
      window
        .OPPONENT_POWER_DESCRIPTIONS
        ?.[id] ||
      base.short ||
      base.desc
  };
};

// POWER ACTION MODAL -- tapping a power/quest badge opens this instead of
// firing the action directly: title/desc for context, plus an explicit Use
// button (hidden/disabled when there's nothing to use right now). See
// powerEngine.js's createPowerButton (powers) and quest.js's
// updateQuestBadge (the guesser's quest) for the two callers.
function showPowerActionPopup({ emoji, title, desc, descHtml, useLabel = "Use", showUse = true, useEnabled = true, onUse }) {
  const modal = document.getElementById("powerActionModal");
  if (!modal) return;

  modal.querySelector(".power-action-emoji").textContent = emoji || "";
  modal.querySelector(".power-action-title").textContent = title || "";

  // descHtml (e.g. the Rare Letters quest's used/missing letter grid) opts
  // into markup; plain callers keep going through textContent so nothing
  // else has to worry about escaping.
  const descEl = modal.querySelector(".power-action-desc");
  if (descHtml) {
    descEl.innerHTML = descHtml;
  } else {
    descEl.textContent = desc || "";
  }

  const useBtn = document.getElementById("powerActionUseBtn");
  useBtn.style.display = showUse ? "" : "none";
  useBtn.textContent = useLabel;
  useBtn.disabled = !useEnabled;
  useBtn.onclick = () => {
    hidePowerActionPopup();
    if (useEnabled) onUse?.();
  };

  modal.classList.add("active");
  window.tutorialOnPowerActionModalOpen?.();
}
window.showPowerActionPopup = showPowerActionPopup;

function hidePowerActionPopup() {
  document.getElementById("powerActionModal")?.classList.remove("active");
  window.tutorialOnPowerActionModalClose?.();
}
window.hidePowerActionPopup = hidePowerActionPopup;

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("powerActionModal");
  document.getElementById("powerActionCloseBtn")?.addEventListener("click", hidePowerActionPopup);
  // Tapping the dark backdrop (not the card itself) dismisses it, same as
  // every other modal's Cancel button but without requiring the tap to
  // land on a specific button.
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hidePowerActionPopup();
  });
});

