// Main Menu Tutorial: a short tour of the startup screen's own buttons.
// Unlike every other tutorial, this one runs with no room and no game
// state at all -- window.state is null the whole time -- so it can't go
// through the normal state-driven tutorialSteps() dispatch. Instead it's
// a plain click-through sequence driven directly off the Continue
// button (see tutorial-ui.js's window._menuTutorialActive branch in that
// button's click handler) and TutorialCore's step counter.

function menuTutorialShow(text, {
  title = "Main Menu Tutorial",
  current = null,
  total = null,
  placement = "bottom",
  compact = false,
  mode = "advance",
  visualHtml = "",
  key = null
} = {}) {
  showTutorial(text, {
    title,
    progressCurrent: current,
    progressTotal: total,
    tone: "menu",
    placement,
    compact,
    mode,
    visualHtml,
    key: key || undefined
  });
}

// Launched from the "Tutorial: Main Menu" button in How to Play (see
// socket-events.js). Doesn't touch window.state/roomId at all -- there is
// no room yet, and there doesn't need to be one for this tour.
window.startMainMenuTutorial = function startMainMenuTutorial() {
  showScreen("startupScreen");
  window._menuTutorialActive = true;
  window.TutorialCore?.setStep(0);
  runMainMenuTutorial();
};

function runMainMenuTutorial() {
  const api = window.TutorialCore;
  if (!api) return;

  api.clearHighlights();
  const step = api.getStep();
  const total = 9;

  if (step === 0) {
    menuTutorialShow(
      "Quick tour of the main menu -- what each button gets you into.",
      { current: 1, total }
    );
    api.setMode("advance");
    return;
  }

  if (step === 1) {
    menuTutorialShow(
      "Quick Play jumps straight into a match: choose a human opponent or an AI difficulty.",
      { title: "Quick Play", current: 2, total }
    );
    api.highlight(byId("quickPlayBtn"));
    api.setMode("advance");
    return;
  }

  if (step === 2) {
    menuTutorialShow(
      "The lightning bolt next to it skips the menu entirely and instantly repeats whatever mode you played last.",
      { title: "Quick Play: repeat last", current: 3, total }
    );
    api.highlight(byId("playQuickBtn"));
    api.setMode("advance");
    return;
  }

  if (step === 3) {
    menuTutorialShow(
      "Play with a Friend sends an invite link for a casual, no-timer match -- good when you don't both need to be online at the same time.",
      { title: "Play with a Friend", current: 4, total }
    );
    api.highlight(byId("playFriendMainBtn"));
    api.setMode("advance");
    return;
  }

  if (step === 4) {
    menuTutorialShow(
      "Ranked queues you against another ranked player for a scored, timed match that affects your rating.",
      { title: "Ranked", current: 5, total }
    );
    api.highlight(byId("rankedMenuBtn"));
    api.setMode("advance");
    return;
  }

  if (step === 5) {
    menuTutorialShow(
      "Daily Challenge gives everyone the same secret word that day, so you can compare your result with everyone else who played it.",
      { title: "Daily Challenge", current: 6, total }
    );
    api.highlight(byId("dailyBtn"));
    api.setMode("advance");
    return;
  }

  if (step === 6) {
    menuTutorialShow(
      "My Games lists every match you've got going that isn't finished, and flags the ones where it's your turn to move.",
      { title: "My Games", current: 7, total }
    );
    api.highlight(byId("myGamesBtn"));
    api.setMode("advance");
    return;
  }

  if (step === 7) {
    menuTutorialShow(
      "Tutorials is this whole hub: Rules, the Powers library, and every tutorial -- including this one.",
      { title: "Tutorials", current: 8, total }
    );
    api.highlight(byId("howToPlayBtn"));
    api.setMode("advance");
    return;
  }

  window._menuTutorialActive = false;
  // Explicit rather than left to whatever tutorialEndNextMode happened to
  // still be set to from a previous tutorial run this session -- chains
  // straight into the Basics Tutorial, matching Tutorials' own #1 -> #2
  // order and the guided first-time sequence (see tutorial-progress.js).
  api.setNextTutorial("tutorial");
  menuTutorialShow(
    "That's the whole main menu. Let's keep going with the Tutorial to learn the basics, or explore the rest under Tutorials.",
    { title: "Main Menu Tutorial done", current: 9, total, mode: "end" }
  );
}

window.runMainMenuTutorial = runMainMenuTutorial;
