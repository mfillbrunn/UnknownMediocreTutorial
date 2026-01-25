const tutorialSteps = [
  {
    title: "How the game works",
    description:
      "One player sets a secret word. The other player tries to guess it using feedback.",
    image: "/public/assets/menu-bg.jpg"
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
    image: "/public/assets/tutorial/guesser_tips.jpg"
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
    image: "/public/assets/tutorial/setter_tips.jpg"
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
  img.style.transform = "scale(1)";
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
  img.style.transform = "scale(0.98)";

  setTimeout(() => {
       img.onload = () => {
      img.style.opacity = 1;
      img.style.transform = "scale(1)";
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
