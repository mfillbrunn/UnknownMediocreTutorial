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

  // ---- Opening Cuddle: the meadow portal ---------------------------------
  //
  // Picking Cuddle opens a circle of its meadow backdrop out of the button
  // until it fills the screen, switches to Cuddle underneath (whose own
  // backdrop is the same picture, see cuddle/cuddle-meadow.css), then lets
  // the portal fade away as Cuddle's content rises in. The click is caught
  // on the way down so cuddle-ui.js's own handler on the button doesn't
  // switch screens before the portal has opened; this calls it afterwards.
  const MEADOW_IMAGE = "cuddle/backgrounds/cuddle-meadow.webp";
  const PORTAL_OPEN_MS = 620;
  let portalBusy = false;

  function preloadMeadow() {
    const image = new Image();
    image.decoding = "async";
    image.src = MEADOW_IMAGE;
  }

  function openCuddleThroughPortal(button) {
    setChosen("cuddle");
    const open = () => window.CuddleMode?.open?.();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || portalBusy || !window.CuddleMode) {
      open();
      return;
    }
    portalBusy = true;
    const rect = button.getBoundingClientRect();
    const portal = document.createElement("div");
    portal.className = "umt-meadow-portal";
    portal.setAttribute("aria-hidden", "true");
    // Opens from the button's icon (the Cuddle logo), not its middle.
    portal.style.setProperty("--portal-x", `${Math.round(rect.left + Math.min(40, rect.width / 2))}px`);
    portal.style.setProperty("--portal-y", `${Math.round(rect.top + rect.height / 2)}px`);
    document.body.appendChild(portal);

    setTimeout(() => {
      document.body.classList.add("umt-meadow-arriving");
      open();
      requestAnimationFrame(() => portal.classList.add("is-leaving"));
      setTimeout(() => {
        portal.remove();
        document.body.classList.remove("umt-meadow-arriving");
        portalBusy = false;
      }, 600);
    }, PORTAL_OPEN_MS);
  }

  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("#cuddleBtn") : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openCuddleThroughPortal(button);
  }, true);

  // Fetch the picture while the player is still choosing, so the portal
  // opens onto it rather than onto plain blue.
  if (document.readyState === "complete") setTimeout(preloadMeadow, 300);
  else window.addEventListener("load", () => setTimeout(preloadMeadow, 300), { once: true });

  window.UmtGameHub = Object.freeze({
    showHub,
    openVowelPlay,
    // Called by player-insights.js when a Vowel Play game is live, so the
    // menu after it is Vowel Play's even if it was reached by a link.
    markVowelPlay() { if (chosen !== "vowelplay") setChosen("vowelplay"); },
    current: () => chosen
  });
}());
