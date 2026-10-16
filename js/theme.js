(() => {
  "use strict";
  const KEY = "ipadmin_theme";

  function applyTheme(theme) {
    const value = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", value);
    try { localStorage.setItem(KEY, value); } catch (_) {}
    const button = document.getElementById("themeToggle");
    if (button) {
      button.setAttribute("aria-checked", value === "dark" ? "true" : "false");
      const label = button.querySelector(".theme-label");
      if (label) label.textContent = value === "dark" ? "Oscuro" : "Claro";
    }
  }

  function readTheme() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch (_) {}
    return "light";
  }

  window.ipadminApplyTheme = applyTheme;
  window.ipadminToggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  };

  applyTheme(readTheme());

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(readTheme());
    const button = document.getElementById("themeToggle");
    if (button && button.dataset.themeBound !== "1") {
      button.dataset.themeBound = "1";
      button.addEventListener("click", window.ipadminToggleTheme);
    }
  });
})();