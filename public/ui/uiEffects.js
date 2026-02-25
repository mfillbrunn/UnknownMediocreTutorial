// uiEffects.js
import { DOM } from "../domUtils.js";

export function toast(message) {
  const el = DOM.get("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1500);
}

export function shake(element) {
  if (!element) return;
  element.classList.add("shake");
  setTimeout(() => element.classList.remove("shake"), 300);
}

export function triggerPowerFX(type) {
  const body = document.body;

  body.classList.remove("power-fx");
  [...body.classList]
    .filter(c => c.startsWith("power-"))
    .forEach(c => body.classList.remove(c));

  void body.offsetWidth;

  body.classList.add("power-fx", `power-${type}`);

  setTimeout(() => {
    body.classList.remove("power-fx", `power-${type}`);
  }, 900);
}
