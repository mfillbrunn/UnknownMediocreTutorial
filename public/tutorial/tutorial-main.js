const tutorialSteps = [
  {
    title: "How the game works",
    description:
      "One player sets a secret word. The other player tries to guess it using feedback.",
    image: "/public/assets/tutorial/overview.jpg"
  },
  {
    title: "Guesser view",
    description:
      "This is the guesser’s screen during play.",
    image: "/public/assets/tutorial/guesser.jpg"
  },
  {
    title: "Guesser view (annotated)",
    description:
      "Feedback colors, keyboard hints, and timers explained.",
    image: "/public/assets/tutorial/guesser-annotated.jpg"
  },
  {
    title: "Setter view",
    description:
      "The setter chooses the secret word and sees extra information.",
    image: "/public/assets/tutorial/setter.jpg"
  },
  {
    title: "Setter view (annotated)",
    description:
      "Some UI elements are only visible to the setter.",
    image: "/public/assets/tutorial/setter-annotated.jpg"
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
  document.getElementById("startupScreen")?.classList.add("disabled");
  overlay.classList.remove("hidden");
  tutorialIndex = 0;
  renderStep();
}

function hideTutorial() {
  document.getElementById("startupScreen")?.classList.remove("disabled");
  overlay.classList.add("hidden");
}


function renderStep() {
  const step = tutorialSteps[tutorialIndex];

  // fade out
  img.style.opacity = 0;
  img.style.transform = "scale(0.98)";

  setTimeout(() => {
    img.src = step.image;
    title.textContent = step.title;
    desc.textContent = step.description;

    img.onload = () => {
      img.style.opacity = 1;
      img.style.transform = "scale(1)";
    };
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
