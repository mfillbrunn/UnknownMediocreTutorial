// client/big-announce.js — a centered, ceremonial popup used for
// round-start (role + goal) and secret-found moments. Auto-dismisses, or
// dismisses early on click.

(() => {
  "use strict";

// This popup is position:fixed inset:0, so its backdrop also lies on top of
// the sidebar drawer toggles parked at the screen edges -- and in a game with
// no time limit it's persistent, sitting there until someone taps it. A tap
// aimed at a drawer toggle was being eaten as the popup's own dismiss-tap and
// the drawer never moved, which reads as the toggle being stuck: tap it again
// quickly and the second tap lands before the first click has resolved, so
// that one is swallowed too.
//
// So after dismissing, hand the tap on to the drawer toggle underneath. Only
// the drawer toggles: they're safe to fire from a dismiss-tap (idempotent,
// purely cosmetic, nothing committed). A blanket pass-through would let a tap
// meant to clear the popup submit a guess or spend a power instead.
const DRAWER_TOGGLE_SELECTOR = "#setterSidebarToggle, #guesserSidebarToggle";

function forwardTapToDrawerToggle(overlay, event) {
  // detail === 0 is a click with no pointer behind it (keyboard activation,
  // .click()), so there's no position to forward to. The timer-driven
  // dismiss passes no event at all.
  if (!event || event.detail === 0) return;

  const { clientX: x, clientY: y } = event;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  // .show is already gone by now (so the overlay is pointer-events:none),
  // but don't depend on that having taken effect for the hit test.
  const previousPointerEvents = overlay.style.pointerEvents;
  overlay.style.pointerEvents = "none";
  const under = document.elementFromPoint(x, y);
  overlay.style.pointerEvents = previousPointerEvents;

  under?.closest?.(DRAWER_TOGGLE_SELECTOR)?.click();
}

window.showBigAnnounce = function ({
  icon = "",
  title = "",
  sub = "",
  powerGroups = null,
  roleClass = "",
  duration = 2400,
  // Compact: a small top-of-screen banner instead of the full ceremonial
  // centered/backdrop-dimmed card -- for frequent, low-stakes messages
  // (e.g. a rejected secret) where blocking the whole board would be
  // overkill.
  compact = false,
  // Persistent: no auto-dismiss timer at all -- only a click closes it.
  // Used for no-time-limit games' round-start announcement, where there's
  // no reason to rush a player through reading their powers before it
  // vanishes on its own.
  persistent = false
} = {}) {
  const el = document.getElementById("bigAnnouncePopup");
  if (!el) return;

  clearTimeout(el.__dismissTimer);

  el.className = `big-announce ${compact ? "compact" : ""} ${roleClass}`.trim();
  const iconEl = el.querySelector(".big-announce-icon");
  // icon is almost always a plain emoji character, but a caller (e.g. the
  // secret-found popup's animated skull/celebration SVG) can pass real
  // markup instead -- every call site is authored by us, never user input,
  // so sniffing for "<" is a safe way to support both without a second
  // parameter every other caller would have to ignore. The default param
  // above only covers an omitted/undefined icon, not an explicit falsy one
  // (null/0), so this still normalizes to a string before checking it.
  const iconStr = icon || "";
  if (iconStr.includes("<")) {
    iconEl.innerHTML = iconStr;
  } else {
    iconEl.textContent = iconStr;
  }
  el.querySelector(".big-announce-title").textContent = title;

  const tapHintEl = el.querySelector(".big-announce-tap-hint");
  if (tapHintEl) tapHintEl.hidden = !persistent;

  // sub can be a single string or an array of strings, each rendered on
  // its own line (e.g. Field Report: the revealed-letter line separate
  // from the conditions-met line).
  const subEl = el.querySelector(".big-announce-sub");
  subEl.innerHTML = "";
  (Array.isArray(sub) ? sub : [sub]).filter(Boolean).forEach(line => {
    const lineEl = document.createElement("div");
    lineEl.className = "big-announce-sub-line";
    lineEl.textContent = line;
    subEl.appendChild(lineEl);
  });

  const powersEl = el.querySelector(".big-announce-powers");
  if (powersEl) {
    powersEl.innerHTML = Array.isArray(powerGroups)
      ? powerGroups
          .filter(group => Array.isArray(group.powers) && group.powers.length)
          .map(group => `
            <div class="big-announce-power-group ${group.roleClass || ""}">
              <div class="big-announce-power-group-label ${group.roleClass || ""}">${group.icon || ""} ${group.label}</div>
              ${group.powers.map(p => `
                <div class="big-announce-power-row">
                  <span class="big-announce-power-emoji">${p.emoji || ""}</span>
                  <span class="big-announce-power-text"><strong>${p.label}</strong> — ${p.desc || ""}</span>
                </div>
              `).join("")}
            </div>
          `).join("")
      : "";
  }

  // Restart the entrance animation even if it's already showing (e.g. a
  // second round-start fires before the first finished dismissing).
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");

  const dismiss = event => {
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    el.removeEventListener("click", dismiss);
    if (el.__dismissHandler === dismiss) el.__dismissHandler = null;
    forwardTapToDrawerToggle(el, event);
  };

  // Exactly one dismiss listener at a time. showBigAnnounce can fire several
  // times before anyone taps (round start, then a power result, ...), and
  // every call used to leave its own listener behind until it happened to
  // run. That was harmless while dismiss only hid the popup, but it would
  // now forward the same tap once per stacked listener -- toggling the
  // drawer open and shut again to no visible effect.
  if (el.__dismissHandler) el.removeEventListener("click", el.__dismissHandler);
  el.__dismissHandler = dismiss;
  el.addEventListener("click", dismiss);
  el.__dismissTimer = persistent ? null : setTimeout(dismiss, duration);
};

})();
