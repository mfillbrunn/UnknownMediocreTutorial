// public/single-player/story-player.js
//
// Walks a stage's preStory/postStory frames/beats one at a time into
// #spStoryView. Every beat's speaker/text is set via textContent only --
// never innerHTML -- since story content is authored data, not markup,
// and this is the one place in the campaign UI that renders the most
// "free text" per screen. A beat may optionally carry a `choices` array
// ({id, text}[]); neither shipped stage uses one, but the branching
// socket event (singlePlayer:storyChoice) is wired here so a future
// stage can add one without any client changes.

(function () {
  "use strict";

  function setImage(frame) {
    const img = document.getElementById("spStoryImage");
    if (!img) return;
    if (frame.image) {
      img.onerror = () => img.classList.add("hidden");
      img.src = frame.image;
      img.alt = frame.alt || "";
      img.classList.remove("hidden");
    } else {
      img.removeAttribute("src");
      img.classList.add("hidden");
    }
  }

  function runStory(stage, frames, roomId, { storyPhase, onComplete }) {
    window.showScreen("singlePlayerScreen");
    window.SinglePlayerCampaign.showView("spStoryView");

    let frameIndex = 0;
    let beatIndex = 0;

    function checkpoint() {
      window.SinglePlayerCampaign.emit("singlePlayer:storyStep", {
        roomId,
        storyPhase,
        frameIndex,
        beatIndex
      });
    }

    function renderChoices(beat) {
      const choicesEl = document.getElementById("spStoryChoices");
      const nextBtn = document.getElementById("spStoryNextBtn");
      if (!choicesEl || !nextBtn) return;
      choicesEl.innerHTML = "";

      if (!Array.isArray(beat.choices) || !beat.choices.length) {
        choicesEl.classList.add("hidden");
        nextBtn.classList.remove("hidden");
        return;
      }

      nextBtn.classList.add("hidden");
      choicesEl.classList.remove("hidden");
      beat.choices.forEach(choice => {
        const choiceBtn = document.createElement("button");
        choiceBtn.type = "button";
        choiceBtn.className = "sp-btn sp-story-choice";
        choiceBtn.textContent = choice.text || choice.id;
        choiceBtn.addEventListener("click", () => {
          window.SinglePlayerCampaign.emit("singlePlayer:storyChoice", {
            roomId,
            choiceId: beat.id,
            optionId: choice.id
          }).then(advance);
        });
        choicesEl.appendChild(choiceBtn);
      });
    }

    function renderCurrent() {
      const frame = frames[frameIndex];
      if (!frame) {
        onComplete();
        return;
      }
      const beat = frame.beats[beatIndex];
      if (!beat) {
        onComplete();
        return;
      }

      setImage(frame);

      const textbox = document.getElementById("spStoryTextbox");
      if (textbox) textbox.classList.toggle("sp-story-side-right", beat.side === "right");

      const speakerEl = document.getElementById("spStorySpeaker");
      if (speakerEl) speakerEl.textContent = beat.speaker || "";

      const textEl = document.getElementById("spStoryText");
      if (textEl) textEl.textContent = beat.text || "";

      renderChoices(beat);
      checkpoint();
    }

    function advance() {
      beatIndex += 1;
      const frame = frames[frameIndex];
      if (frame && beatIndex >= frame.beats.length) {
        frameIndex += 1;
        beatIndex = 0;
      }
      renderCurrent();
    }

    const nextBtn = document.getElementById("spStoryNextBtn");
    if (nextBtn) nextBtn.onclick = advance;

    renderCurrent();
  }

  function playPreStory(stage, roomId) {
    runStory(stage, stage.preStory?.frames || [], roomId, {
      storyPhase: "pre_story",
      onComplete: () => {
        window.SinglePlayerCampaign.emit("singlePlayer:storyStep", {
          roomId,
          storyPhase: "in_game",
          frameIndex: 0,
          beatIndex: 0
        }).then(() => window.SinglePlayerCampaign.enterGameForActiveStage());
      }
    });
  }

  function playPostStory(stage, roomId) {
    runStory(stage, stage.postStory?.frames || [], roomId, {
      storyPhase: "post_story",
      onComplete: () => window.SinglePlayerCampaign.finalizeStageAttempt()
    });
  }

  window.SinglePlayerStoryPlayer = { playPreStory, playPostStory };
})();
