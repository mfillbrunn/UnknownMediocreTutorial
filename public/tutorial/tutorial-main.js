const tutorialSteps = [
  {
    title: "The mission",
    description:
      "One player is the Spy, operating under cover with a secret word. The other is the Inspector, tasked with uncovering it using limited intelligence. In the opening round, both players submit a word simultaneously. From then on, turns alternate as the investigation unfolds.",
    image: "/./assets/menu-bg.jpg"
  },
  {
    title: "Inspector view",
    description:
      "This is the Inspector’s interface during the investigation. The core mechanics will feel familiar if you’ve played Wordle-style games—but information here is not always what it seems.",
    image: "/./assets/tutorial/guesser.jpg"
  },
  {
    title: "Inspector view (explained)",
    description:
      "The Inspector has access to special investigative powers that help narrow down the truth. You may continue guessing words even when some letters are known to be incorrect—this is not hard mode, and restraint is rarely rewarded.",
    image: "/./assets/tutorial/guesser_tips.jpg"
  },
  {
    title: "Spy view",
    description:
      "This is the Spy’s interface. The Spy may alter the secret word between rounds, as long as all previous feedback remains internally consistent. Misdirection is allowed—contradiction is not.",
    image: "/./assets/tutorial/setter.jpg"
  },
  {
    title: "Spy view (explained)",
    description:
      "The Spy has access to deception-focused powers and additional intelligence tools. These abilities are designed to obscure the truth and complicate the Inspector’s investigation.",
    image: "/./assets/tutorial/setter_tips.jpg"
  },
  {
    title: "Powers",
    description:
      "Both sides have access to many special powers - try them out!",
    image: "/./assets/tutorial/powers.jpg"
  },
  {
    title: "The outcome",
    description:
      "Each player plays once as the Spy and once as the Inspector, using the same set of powers. Powers may be used once per game, and only one per turn. The player who solves the case in fewer guesses wins; if tied, the faster investigation prevails.",
    image: "/./assets/tutorial/loss-or-win.jpg"
  }
];



tutorialSteps.forEach(step => {
  const img = new Image();
  img.src = step.image;
});


let tutorialIndex = 0;

const overlay = document.getElementById("tutorialOverlay");
const img = document.getElementById("tutorialImage");
const title = document.getElementById("tutorialTitle");
const desc = document.getElementById("tutorialDescription");
const nextBtn = document.getElementById("tutorialNext");
const prevBtn = document.getElementById("tutorialPrev");
const closeBtn = document.getElementById("tutorialClose");

function showTutorial() {
  document.body.style.overflow = "hidden";
  document.getElementById("startupScreen")?.classList.add("disabled");
  overlay.classList.remove("hidden");

  img.style.opacity = 1;
  hide("startupScreen");
  document.body.classList.remove("menu-mode");
  tutorialIndex = 0;
  renderStep();
}


function hideTutorial() {
  document.body.style.overflow = "";
  document.getElementById("startupScreen")?.classList.remove("disabled");
  overlay.classList.add("hidden");
  show("startupScreen");
  document.body.classList.add("menu-mode");
}


function renderStep() {
  const step = tutorialSteps[tutorialIndex];

  // fade out
  img.style.opacity = 0;

  setTimeout(() => {
       img.onload = () => {
      img.style.opacity = 1;
    };    
    img.src = step.image;
    title.textContent = step.title;
    desc.textContent = step.description;
  }, 200);

  prevBtn.disabled = tutorialIndex === 0;
  nextBtn.textContent =
    tutorialIndex === tutorialSteps.length - 1 ? "Finish" : "Next";
}

nextBtn.onclick = () => {
  if (tutorialIndex < tutorialSteps.length - 1) {
    tutorialIndex++;
    renderStep();
  } else {
    hideTutorial();
  }
};

prevBtn.onclick = () => {
  if (tutorialIndex > 0) {
    tutorialIndex--;
    renderStep();
  }
};

closeBtn.onclick = hideTutorial;
overlay.addEventListener("click", e => {
  if (e.target === overlay) hideTutorial();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
    hideTutorial();
  }
});

document.addEventListener("keydown", e => {
  if (overlay.classList.contains("hidden")) return;

  if (e.key === "ArrowRight") nextBtn.click();
  if (e.key === "ArrowLeft")  prevBtn.click();
});
