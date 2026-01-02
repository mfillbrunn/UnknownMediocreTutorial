// ui/colorPicker.js

(function () {
  function resetPlayerColor() {
    const target =
      window.myRole === "A"
        ? $("setterScreen")
        : $("guesserScreen");

    if (!target) return;

    target.style.removeProperty("--role-accent");
    target.style.removeProperty("--role-accent-strong");
    target.style.removeProperty("--btn-primary");
    target.style.removeProperty("--btn-primary-hover");
    target.style.removeProperty("--btn-primary-glow");
  }

  function applyPlayerColor(color) {
    const target =
      window.myRole === "A"
        ? $("setterScreen")
        : $("guesserScreen");

    if (!target) return;

    target.style.setProperty("--role-accent", color);
    target.style.setProperty("--role-accent-strong", color);
    target.style.setProperty("--btn-primary", color);
    target.style.setProperty("--btn-primary-hover", color);
    target.style.setProperty("--btn-primary-glow", color + "aa");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const colorPicker = $("playerColorPicker");
    const useCustomColor = $("useCustomColor");

    if (!colorPicker || !useCustomColor) return;

    const savedColor = localStorage.getItem("vswordle_player_color");
    const savedUseCustom =
      localStorage.getItem("vswordle_use_custom_color") === "true";

    useCustomColor.checked = savedUseCustom;
    colorPicker.disabled = !savedUseCustom;

    if (savedColor) {
      colorPicker.value = savedColor;
    }

    if (savedUseCustom && savedColor) {
      applyPlayerColor(savedColor);
    }

    useCustomColor.onchange = () => {
      const enabled = useCustomColor.checked;
      localStorage.setItem("vswordle_use_custom_color", enabled);
      colorPicker.disabled = !enabled;

      if (!enabled) {
        resetPlayerColor();
      } else {
        applyPlayerColor(colorPicker.value);
      }
    };

    colorPicker.oninput = e => {
      const color = e.target.value;
      localStorage.setItem("vswordle_player_color", color);
      if (useCustomColor.checked) {
        applyPlayerColor(color);
      }
    };
  });
})();
