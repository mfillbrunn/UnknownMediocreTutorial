/* Cuddle: music.
 *
 * One looping track (audio/cuddle-theme.mp3) plays while Cuddle is open.
 * Browsers only allow sound after a tap, so it starts on the first tap
 * inside Cuddle; a speaker button in the top bar (next to "?") turns it off
 * and on, and the choice is remembered. It fades in and out, pauses when
 * the tab is hidden or the player leaves Cuddle, and isn't downloaded until
 * the first tap.
 */
(function () {
  "use strict";

  if (window.CuddleMusic) return;

  var SRC = "cuddle/audio/cuddle-theme.mp3";
  var KEY = "umt-cuddle-music";
  var VOLUME = 0.35;
  var FADE_MS = 700;

  var audio = null;
  var fade = 0;
  var unlocked = false;

  function read() {
    try { return localStorage.getItem(KEY) !== "off"; } catch (_error) { return true; }
  }
  function write(on) {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_error) { /* not remembered */ }
  }

  var enabled = read();

  function screen() { return document.getElementById("cuddleScreen"); }
  function inCuddle() {
    var el = screen();
    return Boolean(el && el.classList.contains("active")) && !document.hidden;
  }

  function ramp(to, done) {
    if (!audio) return;
    window.clearInterval(fade);
    var from = audio.volume;
    var started = Date.now();
    fade = window.setInterval(function step() {
      var t = Math.min(1, (Date.now() - started) / FADE_MS);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        window.clearInterval(fade);
        if (done) done();
      }
    }, 50);
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = "none";
    audio.volume = 0;
    return audio;
  }

  // Plays or pauses to match: enabled, unlocked by a tap, and in Cuddle.
  function sync() {
    var want = enabled && unlocked && inCuddle();
    if (want) {
      var track = ensureAudio();
      if (track.paused) {
        var promise = track.play();
        if (promise && typeof promise.catch === "function") promise.catch(function blocked() { unlocked = false; });
      }
      ramp(VOLUME);
    } else if (audio && !audio.paused) {
      ramp(0, function stop() { if (audio && !(enabled && unlocked && inCuddle())) audio.pause(); });
    }
    paint();
  }

  var ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function paint() {
    document.querySelectorAll(".umt-music-btn").forEach(function (button) {
      button.innerHTML = enabled ? ON : OFF;
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
      button.setAttribute("aria-label", enabled ? "Music on. Tap to turn off" : "Music off. Tap to turn on");
      button.title = enabled ? "Music: on" : "Music: off";
    });
  }

  // A speaker button beside the "?" in Cuddle's top bars (or alone on the
  // road and the shop).
  function decorate() {
    document.querySelectorAll("#cuddleScreen .cuddle-icon-btn[data-action=\"rules\"]").forEach(function (rules) {
      var before = rules.previousElementSibling;
      if (before && before.classList.contains("umt-music-btn")) return;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cuddle-icon-btn umt-music-btn";
      rules.parentNode.insertBefore(button, rules);
    });
    // Top bars with a right side but no "?" of their own (the road, the
    // shop): the speaker goes first on that side.
    document.querySelectorAll("#cuddleScreen .cuddle-header").forEach(function (header) {
      if (header.querySelector(".umt-music-btn")) return;
      var side = header.querySelector(".cuddle-header-side-right");
      if (!side) return;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cuddle-icon-btn umt-music-btn";
      side.insertBefore(button, side.firstChild);
    });
    paint();
  }

  function toggle() {
    enabled = !enabled;
    write(enabled);
    unlocked = true;
    sync();
  }

  document.addEventListener("click", function (event) {
    var button = event.target instanceof Element ? event.target.closest(".umt-music-btn") : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  }, true);

  // The first tap inside Cuddle unlocks sound.
  function firstTap(event) {
    if (unlocked) return;
    var el = screen();
    if (!el || !(event.target instanceof Element) || !el.contains(event.target)) return;
    // The speaker button decides for itself (toggle).
    if (event.target.closest(".umt-music-btn")) return;
    unlocked = true;
    sync();
  }
  document.addEventListener("pointerdown", firstTap, true);
  document.addEventListener("keydown", firstTap, true);
  document.addEventListener("visibilitychange", sync);

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      decorate();
    });
  }

  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    var el = screen();
    if (el) new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["class"] });
    schedule();
    sync();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.CuddleMusic = Object.freeze({
    isOn: function isOn() { return enabled; },
    set: function set(on) { enabled = Boolean(on); write(enabled); sync(); }
  });
}());
