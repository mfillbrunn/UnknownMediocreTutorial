// client/game-hub.js — the first screen: pick Vowel Play or Cuddle.
//
// #gameHubScreen is the page's opening screen. Picking Vowel Play shows
// the Vowel Play menu (#startupScreen); picking Cuddle opens Cuddle
// (cuddle-ui.js binds #cuddleBtn itself). Every existing "back to the menu"
// path in Vowel Play calls showStartup(), so that is wrapped here: until
// Vowel Play has been picked (or a Vowel Play game has been joined some
// other way -- an invite link, a rejoin), showStartup() lands on the game
// choice instead.
//
// Loaded right after helpers.js, which defines window.showStartup, and
// before client.js, whose DOMContentLoaded handler calls it.

(function () {
  let chosen = null; // "vowelplay" | "cuddle" | null

  function setChosen(game) {
    chosen = game;
    document.body.dataset.umtGame = game || "";
  }

  const vowelPlayMenu = window.showStartup;

  function showHub() {
    setChosen(null);
    window.showScreen("gameHubScreen");
    document.body.classList.add("menu-mode");
  }

  // The first-run "want a tutorial?" offer is about Vowel Play, so it waits
  // until Vowel Play is actually picked.
  let onboardingPending = false;

  function openVowelPlay() {
    setChosen("vowelplay");
    vowelPlayMenu();
    if (onboardingPending) {
      onboardingPending = false;
      window.__umtOfferOnboarding?.();
    }
  }

  window.showStartup = function showStartupOrHub() {
    if (chosen === "vowelplay") return vowelPlayMenu.apply(this, arguments);
    return showHub();
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("hubVowelPlayBtn")?.addEventListener("click", openVowelPlay);
    document.getElementById("cuddleBtn")?.addEventListener("click", () => setChosen("cuddle"));
    document.getElementById("vpBackToHubBtn")?.addEventListener("click", showHub);
    document.getElementById("hubBugReportBtn")?.addEventListener("click", () => window.openBugReport?.());

    const offer = window.maybeOfferOnboarding;
    if (typeof offer === "function") {
      window.__umtOfferOnboarding = offer;
      window.maybeOfferOnboarding = function () {
        if (chosen === "vowelplay") return offer.apply(this, arguments);
        onboardingPending = true;
        return undefined;
      };
    }
  });

  window.UmtGameHub = Object.freeze({
    showHub,
    openVowelPlay,
    // Called by player-insights.js when a Vowel Play game is live, so the
    // menu after it is Vowel Play's even if it was reached by a link.
    markVowelPlay() { if (chosen !== "vowelplay") setChosen("vowelplay"); },
    current: () => chosen
  });
}());
