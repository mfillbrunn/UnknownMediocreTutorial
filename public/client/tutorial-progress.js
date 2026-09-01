// client/tutorial-progress.js — tracks which tutorials the player has
// completed at least once, purely locally (same pattern as every other
// per-browser preference here: guideOn, physicalKeyboardActive, ...), so
// How to Play can show a checkmark next to ones already done. Also owns
// the one-time "want a tour?" prompt shown the first time someone lands
// on the home screen with nothing else going on.
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
    // Start with the ELI5 Basics tutorial. The separate menu tour was removed.
    document.getElementById("startTutorialBtn")?.click();
  });
})();

/* UMT_REQUESTED_FIXES_20260901: BRIEF MENU TUTORIALS START */
(() => {
  "use strict";

  const TUTORIALS = {
    advanced: {
      name: "Advanced UI",
      steps: [
        {
          title: "Side panels",
          body: "The side panel keeps rewards, powers, and supporting information out of the main board.",
          bullets: [
            "Use the side-column arrow to hide or show it at any time.",
            "Your choice stays in place after reward previews and opponent powers."
          ]
        },
        {
          title: "The constrained row",
          body: "The outlined row summarizes the feedback pattern the active word must obey.",
          bullets: [
            "Blue identifies the Guesser view; red identifies the Secretkeeper view.",
            "Use the grid button in the header to hide or show the row."
          ]
        },
        {
          title: "Editing tools",
          body: "Use the board directly rather than searching for a separate editor.",
          bullets: [
            "Type or tap letters, and use locks where a screen offers them.",
            "The Secretkeeper can Keep a valid secret or Change it when the rules allow."
          ]
        },
        {
          title: "Logs, notes, and exits",
          body: "Open the log when you need the move history and use notes for private reminders.",
          bullets: [
            "Concede ends the current contest; Leave returns to the menu.",
            "That is all you need for the advanced interface."
          ]
        }
      ]
    },
    options: {
      name: "Options & Actions",
      steps: [
        {
          title: "Choose how to play",
          body: "Quick Play starts the shortest route. Play opens the wider set of multiplayer and solo choices.",
          bullets: [
            "Choose a human or AI opponent, then choose the offered difficulty.",
            "Campaign, Challenges, Cuddle, Daily Challenge, and saved games are solo choices."
          ]
        },
        {
          title: "As the Guesser",
          body: "Enter a valid guess, read the feedback, and use the constrained row as a compact reminder.",
          bullets: [
            "Green is in the correct place; yellow is present elsewhere; gray is not useful for that secret.",
            "Powers and rewards appear in the side panel when available."
          ]
        },
        {
          title: "As the Secretkeeper",
          body: "Respond with feedback that remains consistent with at least one possible secret.",
          bullets: [
            "Keep your word when it still works, or change it only through an allowed action.",
            "Stars and constraints show the commitments already created by earlier feedback."
          ]
        },
        {
          title: "Rewards and powers",
          body: "Select rewards when offered and activate powers only when their timing is valid.",
          bullets: [
            "You can reveal and hide the reward area without losing control of the side panel.",
            "Opponent powers may change the board, but they do not lock your panel toggle."
          ]
        },
        {
          title: "Daily and challenge play",
          body: "Daily Challenge gives everyone the same date-seeded setup and automatic opening. Challenges pit you against powered AIs.",
          bullets: [
            "Daily play covers both roles; your first decision comes after the shared opening.",
            "Challenge results award up to three stars based on the listed goals."
          ]
        }
      ]
    }
  };

  let activeKey = null;
  let stepIndex = 0;
  let previousFocus = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function ensureOverlay() {
    let overlay = byId("guidedMenuTutorialOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "guidedMenuTutorialOverlay";
    overlay.className = "guided-menu-tutorial-overlay hidden";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <section class="guided-menu-tutorial-card" role="dialog" aria-modal="true" aria-labelledby="guidedMenuTutorialTitle">
        <button id="guidedMenuTutorialClose" class="guided-menu-tutorial-close" type="button" aria-label="Close tutorial">&times;</button>
        <p id="guidedMenuTutorialProgress" class="guided-menu-tutorial-progress"></p>
        <h2 id="guidedMenuTutorialTitle" class="guided-menu-tutorial-title"></h2>
        <p id="guidedMenuTutorialBody" class="guided-menu-tutorial-body"></p>
        <ul id="guidedMenuTutorialList" class="guided-menu-tutorial-list"></ul>
        <div class="guided-menu-tutorial-actions">
          <button id="guidedMenuTutorialPrev" type="button">Back</button>
          <button id="guidedMenuTutorialNext" type="button">Next</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    byId("guidedMenuTutorialClose")?.addEventListener("click", () => closeTutorial(false));
    byId("guidedMenuTutorialPrev")?.addEventListener("click", () => {
      if (stepIndex > 0) {
        stepIndex -= 1;
        render();
      }
    });
    byId("guidedMenuTutorialNext")?.addEventListener("click", () => {
      const tutorial = TUTORIALS[activeKey];
      if (!tutorial) return;
      if (stepIndex < tutorial.steps.length - 1) {
        stepIndex += 1;
        render();
      } else {
        closeTutorial(true);
      }
    });
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeTutorial(false);
    });
    return overlay;
  }

  function render() {
    const tutorial = TUTORIALS[activeKey];
    if (!tutorial) return;
    const step = tutorial.steps[stepIndex];

    byId("guidedMenuTutorialProgress").textContent =
      `${tutorial.name} - Step ${stepIndex + 1} of ${tutorial.steps.length}`;
    byId("guidedMenuTutorialTitle").textContent = step.title;
    byId("guidedMenuTutorialBody").textContent = step.body;

    const list = byId("guidedMenuTutorialList");
    list.replaceChildren(...step.bullets.map(itemText => {
      const item = document.createElement("li");
      item.textContent = itemText;
      return item;
    }));

    const previous = byId("guidedMenuTutorialPrev");
    const next = byId("guidedMenuTutorialNext");
    previous.disabled = stepIndex === 0;
    next.textContent = stepIndex === tutorial.steps.length - 1 ? "Finish" : "Next";
  }

  function openTutorial(key, opener) {
    if (!TUTORIALS[key]) return;
    activeKey = key;
    stepIndex = 0;
    previousFocus = opener || document.activeElement;
    const overlay = ensureOverlay();
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    render();
    window.setTimeout(() => byId("guidedMenuTutorialNext")?.focus(), 0);
  }

  function closeTutorial(completed) {
    const overlay = byId("guidedMenuTutorialOverlay");
    if (!overlay || overlay.classList.contains("hidden")) return;

    if (completed && activeKey) {
      if (typeof window.markTutorialCompleted === "function") {
        window.markTutorialCompleted(activeKey);
      } else {
        try {
          window.localStorage.setItem(`tutorialCompleted:${activeKey}`, "true");
        } catch (_) {
          // Completion persistence is optional when storage is unavailable.
        }
      }
      window.refreshTutorialCompletionBadges?.();
    }

    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    activeKey = null;
    previousFocus?.focus?.();
    previousFocus = null;
  }

  // Capture the old Advanced button before its longer scripted tutorial starts.
  // Quest and Stars retain their existing concise guided tutorials; Basics
  // remains the one intentionally detailed walkthrough.
  document.addEventListener("click", event => {
    const rawTarget = event.target;
    const target = rawTarget instanceof Element
      ? rawTarget
      : rawTarget?.parentElement;
    const button = target?.closest?.(
      "#showAdvancedTutorialBtn, #startOptionsTutorialBtn"
    );
    if (!button) return;

    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    openTutorial(
      button.id === "showAdvancedTutorialBtn" ? "advanced" : "options",
      button
    );
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeTutorial(false);
  });
})();
/* UMT_REQUESTED_FIXES_20260901: BRIEF MENU TUTORIALS END */
