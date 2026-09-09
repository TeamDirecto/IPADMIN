(() => {
  "use strict";

  const token = sessionStorage.getItem("ipadmin_token") || "";
  const username = sessionStorage.getItem("ipadmin_user") || "IPADMIN";

  if (!token) {
    window.location.replace("./");
    return;
  }

  const appView = document.getElementById("appView");
  const sessionUser = document.getElementById("sessionUser");
  const logoutButton = document.getElementById("logoutButton");
  const backButton = document.getElementById("backButton");

  if (sessionUser) sessionUser.textContent = username;
  if (appView) appView.hidden = false;

  function setupCollapsibles() {
    const panelIds = [
      "nodeHealthPanel",
      "incidentPanel",
      "eventsPanel",
      "stateHistoryPanel"
    ];

    panelIds.forEach((id) => {
      const panel = document.getElementById(id);
      const header = panel?.querySelector(":scope > .panel-header");

      if (!panel || !header || panel.dataset.collapsibleReady === "1") return;

      panel.dataset.collapsibleReady = "1";
      panel.classList.add("diagnostic-collapsible", "is-collapsed");

      header.classList.add("diagnostic-collapsible-header");
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", "false");

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "diagnostic-collapse-toggle";
      toggle.setAttribute("aria-label", "Mostrar sección");
      toggle.innerHTML = '<span class="diagnostic-collapse-label">Mostrar</span><span class="diagnostic-collapse-chevron">⌄</span>';
      header.appendChild(toggle);

      const setExpanded = (expanded) => {
        panel.classList.toggle("is-collapsed", !expanded);
        header.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.setAttribute("aria-label", expanded ? "Ocultar sección" : "Mostrar sección");

        const label = toggle.querySelector(".diagnostic-collapse-label");
        if (label) label.textContent = expanded ? "Ocultar" : "Mostrar";
      };

      const togglePanel = () => {
        setExpanded(panel.classList.contains("is-collapsed"));
      };

      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePanel();
      });

      header.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea, label")) return;
        togglePanel();
      });

      header.addEventListener("keydown", (event) => {
        if (event.target !== header) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          togglePanel();
        }
      });
    });
  }

  setupCollapsibles();

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      sessionStorage.removeItem("ipadmin_token");
      sessionStorage.removeItem("ipadmin_user");
      window.location.replace("./");
    });
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "./";
    });
  }
})();
