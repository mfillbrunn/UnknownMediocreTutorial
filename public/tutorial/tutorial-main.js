const tutorialSteps = [
  {
    title: "How the game works",
    description:
      "One player - the setter - sets a secret word. The other player - the guesser - tries to guess it using feedback. The first round of each game will be simultaneous, so both players type in a word. Afterwards, they take turns.",
    image: "/./assets/menu-bg.jpg"
  },
  {
    title: "Guesser view",
    description:
      "This is the guesser’s screen during play. The guesser role is similar to other wordle games.",
    image: "/./assets/tutorial/guesser.jpg"
  },
  {
    title: "Guesser view (annotated)",
    description:
      "The guesser players can use powers to help them find out the word easier. They can guess any word even if they know the letters aren't in the secret word anymore.",
    image: "/./assets/tutorial/guesser_tips.jpg"
  },
  {
    title: "Setter view",
    description:
      "The setter can change the secret word every round, but it has to fit all previous rounds.",
    image: "/./assets/tutorial/setter.jpg"
  },
  {
    title: "Setter view (annotated)",
    description:
      "Some UI elements are only visible to the setter. The setter's powers typically hinder the guesser.",
    image: "/./assets/tutorial/setter_tips.jpg"
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
