// client/big-announce.js — a centered, ceremonial popup used for
// round-start (role + goal) and secret-found moments. Auto-dismisses, or
// dismisses early on click.

window.showBigAnnounce = function ({
  icon = "",
  title = "",
  sub = "",
  powers = null,
  roleClass = "",
  duration = 2400
} = {}) {
  const el = document.getElementById("bigAnnouncePopup");
  if (!el) return;

  clearTimeout(el.__dismissTimer);

  el.className = `big-announce ${roleClass}`.trim();
  el.querySelector(".big-announce-icon").textContent = icon;
  el.querySelector(".big-announce-title").textContent = title;
  el.querySelector(".big-announce-sub").textContent = sub;

  const powersEl = el.querySelector(".big-announce-powers");
  if (powersEl) {
    powersEl.innerHTML = Array.isArray(powers) && powers.length
      ? powers.map(p => `
          <div class="big-announce-power-row">
            <span class="big-announce-power-emoji">${p.emoji || ""}</span>
            <span class="big-announce-power-text"><strong>${p.label}</strong> — ${p.desc || ""}</span>
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

  const dismiss = () => {
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    el.removeEventListener("click", dismiss);
  };

  el.addEventListener("click", dismiss);
  el.__dismissTimer = setTimeout(dismiss, duration);
};
