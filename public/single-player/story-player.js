// public/single-player/story-player.js
// UMT_STORY_FLOW_FIX_V1
// Serializes narration checkpoints and makes every transition user-driven.
(function () {
  "use strict";

  function setImage(frame) {
    const img = document.getElementById("spStoryImage");
    if (!img) return;
    if (frame.image) {
      img.onerror = () => {
        img.removeAttribute("src");
        img.classList.add("hidden");
      };
      img.src = frame.image;
      img.alt = frame.alt || "";
      img.classList.remove("hidden");
    } else {
      img.removeAttribute("src");
      img.alt = "";
      img.classList.add("hidden");
    }
  }

  function normalizeFrames(frames) {
    return (Array.isArray(frames) ? frames : []).map(frame => {
      if (!frame || typeof frame !== "object") return null;
      const beats = (Array.isArray(frame.beats) ? frame.beats : []).filter(beat =>
        beat && typeof beat === "object" && (
          String(beat.text || "").trim() ||
          String(beat.speaker || "").trim() ||
          (Array.isArray(beat.choices) && beat.choices.length)
        )
      );
      return beats.length ? { ...frame, beats } : null;
    }).filter(Boolean);
  }

  function ensureAuxiliaryElement(id, className, parent, before) {
    let el = document.getElementById(id);
    if (el || !parent) return el;
    el = document.createElement("div");
    el.id = id;
    el.className = className;
    if (before) parent.insertBefore(el, before);
    else parent.appendChild(el);
    return el;
  }

  function runStory(stage, rawFrames, roomId, { storyPhase, onComplete }) {
    const frames = normalizeFrames(rawFrames);
    if (!frames.length) {
      return Promise.resolve(onComplete?.()).then(result => {
        if (result?.ok === false) throw new Error(result.error || "Could not continue.");
        return result || { ok: true };
      });
    }

    window.showScreen("singlePlayerScreen");
    window.SinglePlayerCampaign.showView("spStoryView");

    const textbox = document.getElementById("spStoryTextbox");
    const choicesEl = document.getElementById("spStoryChoices");
    const nextBtn = document.getElementById("spStoryNextBtn");
    const progressEl = ensureAuxiliaryElement("spStoryProgress", "sp-story-progress", textbox, textbox?.firstChild || null);
    const errorEl = ensureAuxiliaryElement("spStoryError", "sp-story-error hidden", textbox, choicesEl || nextBtn || null);

    let frameIndex = 0;
    let beatIndex = 0;
    let completed = false;
    let advancing = false;
    let checkpointQueue = Promise.resolve({ ok: true });
    const totalBeats = frames.reduce((sum, frame) => sum + frame.beats.length, 0);

    function currentFrame() {
      return frames[frameIndex] || null;
    }

    function currentBeat() {
      return currentFrame()?.beats?.[beatIndex] || null;
    }

    function currentOrdinal() {
      let prior = 0;
      for (let index = 0; index < frameIndex; index += 1) prior += frames[index].beats.length;
      return Math.min(totalBeats, prior + beatIndex + 1);
    }

    function isFinalBeat() {
      return frameIndex === frames.length - 1 && beatIndex === frames[frameIndex].beats.length - 1;
    }

    function errorMessage(result, fallback) {
      return result?.error || fallback;
    }

    function showError(message) {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
      }
      if (typeof toast === "function") toast(message);
    }

    function clearError() {
      if (!errorEl) return;
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }

    function setControlsLocked(locked) {
      if (nextBtn) {
        nextBtn.disabled = locked;
        nextBtn.setAttribute("aria-busy", String(locked));
      }
      choicesEl?.querySelectorAll("button").forEach(button => {
        button.disabled = locked;
        button.setAttribute("aria-busy", String(locked));
      });
    }

    function queueCheckpoint() {
      const payload = { roomId, storyPhase, frameIndex, beatIndex };
      checkpointQueue = checkpointQueue.catch(() => ({ ok: false })).then(async () => {
        const result = await window.SinglePlayerCampaign.emit("singlePlayer:storyStep", payload);
        if (!result?.ok) throw new Error(errorMessage(result, "Could not save narration progress."));
        return result;
      });
      return checkpointQueue;
    }

    function moveForward() {
      beatIndex += 1;
      if (beatIndex >= frames[frameIndex].beats.length) {
        frameIndex += 1;
        beatIndex = 0;
      }
    }

    async function completeCurrentStory() {
      if (completed) return { ok: true };
      if (nextBtn) nextBtn.textContent = storyPhase === "pre_story" ? "Starting..." : "Finishing...";
      await queueCheckpoint();
      const result = await onComplete?.();
      if (result?.ok === false) throw new Error(errorMessage(result, "Could not continue."));
      completed = true;
      return result || { ok: true };
    }

    async function advance() {
      if (advancing || completed) return;
      advancing = true;
      clearError();
      setControlsLocked(true);
      try {
        if (isFinalBeat()) {
          await completeCurrentStory();
          return;
        }
        await queueCheckpoint();
        moveForward();
        advancing = false;
        renderCurrent();
      } catch (error) {
        advancing = false;
        setControlsLocked(false);
        if (nextBtn) nextBtn.textContent = isFinalBeat()
          ? (storyPhase === "pre_story" ? "Start mission" : "Finish")
          : "Continue";
        showError(error?.message || "Could not continue. Try again.");
      }
    }

    async function choose(beat, choice) {
      if (advancing || completed) return;
      advancing = true;
      clearError();
      setControlsLocked(true);
      try {
        await queueCheckpoint();
        const result = await window.SinglePlayerCampaign.emit("singlePlayer:storyChoice", {
          roomId,
          choiceId: beat.id,
          optionId: choice.id
        });
        if (!result?.ok) throw new Error(errorMessage(result, "Could not save that choice."));
        if (isFinalBeat()) {
          await completeCurrentStory();
          return;
        }
        moveForward();
        advancing = false;
        renderCurrent();
      } catch (error) {
        advancing = false;
        setControlsLocked(false);
        showError(error?.message || "Could not save that choice. Try again.");
      }
    }

    function renderChoices(beat) {
      if (!choicesEl || !nextBtn) return;
      choicesEl.innerHTML = "";
      const choices = Array.isArray(beat.choices) ? beat.choices.filter(choice => choice && (choice.id || choice.text)) : [];
      if (!choices.length) {
        choicesEl.classList.add("hidden");
        nextBtn.classList.remove("hidden");
        return;
      }

      nextBtn.classList.add("hidden");
      choicesEl.classList.remove("hidden");
      choices.forEach(choice => {
        const choiceBtn = document.createElement("button");
        choiceBtn.type = "button";
        choiceBtn.className = "sp-btn sp-story-choice";
        choiceBtn.textContent = choice.text || choice.id;
        choiceBtn.addEventListener("click", () => choose(beat, choice));
        choicesEl.appendChild(choiceBtn);
      });
    }

    function renderCurrent() {
      const frame = currentFrame();
      const beat = currentBeat();
      if (!frame || !beat) {
        advance();
        return;
      }

      clearError();
      setImage(frame);
      textbox?.classList.toggle("sp-story-side-right", beat.side === "right");

      const speakerEl = document.getElementById("spStorySpeaker");
      if (speakerEl) speakerEl.textContent = beat.speaker || "";
      const textEl = document.getElementById("spStoryText");
      if (textEl) textEl.textContent = beat.text || "";
      if (progressEl) progressEl.textContent = `${currentOrdinal()} / ${totalBeats}`;

      if (nextBtn) {
        nextBtn.textContent = isFinalBeat()
          ? (storyPhase === "pre_story" ? "Start mission" : "Finish")
          : "Continue";
        nextBtn.disabled = false;
        nextBtn.setAttribute("aria-busy", "false");
        nextBtn.onclick = advance;
      }

      renderChoices(beat);
      setControlsLocked(false);
      queueCheckpoint().catch(error => showError(error?.message || "Narration progress could not be saved."));
    }

    renderCurrent();
    return { ok: true };
  }

  function playPreStory(stage, roomId) {
    return runStory(stage, stage.preStory?.frames || [], roomId, {
      storyPhase: "pre_story",
      onComplete: () => window.SinglePlayerCampaign.enterGameForActiveStage()
    });
  }

  function playPostStory(stage, roomId) {
    return runStory(stage, stage.postStory?.frames || [], roomId, {
      storyPhase: "post_story",
      onComplete: () => window.SinglePlayerCampaign.finalizeStageAttempt()
    });
  }

  window.SinglePlayerStoryPlayer = { playPreStory, playPostStory };
})();
