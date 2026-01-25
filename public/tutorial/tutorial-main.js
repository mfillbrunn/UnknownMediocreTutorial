const tutorialSteps = [
  {
    title: "How the game works",
    description:
      "One player - the setter - chooses a secret word. The other player - the guesser - tries to find it using feedback. In the first round, both players submit a word at the same time. After that, they take turns.",
    image: "/./assets/menu-bg.jpg"
  },
  {
    title: "Guesser view",
    description:
      "This is the guesser’s screen during play. The core gameplay will feel familiar if you’ve played other Wordle-style games.",
    image: "/./assets/tutorial/guesser.jpg"
  },
  {
    title: "Guesser view (explained)",
    description:
      "The guesser can use guesser-specific powers to help narrow down the secret word. Also - you can still guess words even if you already know some letters are wrong (this is not hard mode - trust me, don't try it).",
    image: "/./assets/tutorial/guesser_tips.jpg"
  },
  {
    title: "Setter view",
    description:
      "The setter may change the secret word each round, as long as it remains consistent with the feedback from all previous rounds.",
    image: "/./assets/tutorial/setter.jpg"
  },
  {
    title: "Setter view (explained)",
    description:
      "The setter also has setter-specific powers, and some extra UI elements. The setter’s powers are generally designed to make things harder for the guesser.",
    image: "/./assets/tutorial/setter_tips.jpg"
  } 
  ,{
    title: "The winner",
    description:
      "You play two rounds—one in each role—using the same powers. Each power can be used once per game, and only one power may be used per turn. The winner is the player who needs fewer guesses; if tied, the faster time wins.",
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
