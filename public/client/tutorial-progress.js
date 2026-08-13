// client/tutorial-progress.js — tracks which tutorials the player has
// completed at least once, purely locally (same pattern as every other
// per-browser preference here: guideOn, physicalKeyboardActive, ...), so
// How to Play can show a checkmark next to ones already done. Also owns
// the one-time "want a tour?" prompt shown the first time someone lands
// on the main menu with nothing else going on.
(() => {
  "use strict";

  const COMPLETED_KEY = "tutorialsCompleted";
  const ONBOARDING_KEY = "onboardingPromptSeen";

  function readCompleted() {
    try {
      return JSON.parse(localStorage.getItem(COMPLETED_KEY) || "{}");
    } catch {
      return {};
    }
  }

  window.isTutorialCompleted = function (key) {
    return !!readCompleted()[key];
  };

  // Called from tutorial-ui.js's showTutorialDoneModal() the instant a
  // tutorial reaches its real "done" screen -- idempotent, so replaying an
  // already-completed tutorial is a harmless no-op past the first time.
  window.markTutorialCompleted = function (key) {
    if (!key) return;
    const done = readCompleted();
    if (done[key]) return;
    done[key] = true;
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(done));
    window.refreshTutorialCompletionBadges?.();
  };

  // Paints a checkmark on every How to Play tutorial button whose
  // data-tutorial-key has been completed. Called once the screen's DOM
  // exists and again any time a tutorial finishes while How to Play might
  // be sitting underneath it (Leave/Next Tutorial both drop back through
  // the startup screen, one tap from here).
  window.refreshTutorialCompletionBadges = function () {
    const done = readCompleted();
    document
      .querySelectorAll("#howToPlayScreen [data-tutorial-key]")
      .forEach(btn => {
        btn.classList.toggle(
          "tutorial-completed",
          !!done[btn.dataset.tutorialKey]
        );
      });
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.refreshTutorialCompletionBadges();
  });

  // ---- First-time onboarding prompt ----

  function shouldOfferOnboarding() {
    if (localStorage.getItem(ONBOARDING_KEY)) return false;
    // Never interrupt someone landing via an invite link or returning to
    // a game already in progress -- only offer this on a genuinely fresh
    // "just arrived at the main menu with nothing else going on" landing.
    if (window._pendingInviteCode) return false;
    if (window.roomId || localStorage.getItem("roomId")) return false;
    return true;
  }

  function dismissOnboardingPrompt() {
    localStorage.setItem(ONBOARDING_KEY, "true");
    document.getElementById("onboardingPromptModal")?.classList.remove("active");
  }

  // Called from auth.js once sign-in has resolved and the player has
  // actually landed on the plain startup screen (same guard condition
  // that decided to show that screen in the first place).
  window.maybeOfferOnboarding = function () {
    if (!shouldOfferOnboarding()) return;
    document.getElementById("onboardingPromptModal")?.classList.add("active");
  };

  document.getElementById("onboardingSkipBtn")?.addEventListener("click", () => {
    dismissOnboardingPrompt();
  });

  document.getElementById("onboardingStartBtn")?.addEventListener("click", () => {
    dismissOnboardingPrompt();
    // Main Menu Tutorial first, chained into the Basics Tutorial next (see
    // tutorial-menu.js's final step / TUTORIAL_DONE_COPY.tutorial) --
    // exactly the guided sequence a first-time player asked for here, and
    // still reachable any time afterward from How to Play, numbered 1 and
    // 2 in that same order.
    window.startMainMenuTutorial?.();
  });
})();
