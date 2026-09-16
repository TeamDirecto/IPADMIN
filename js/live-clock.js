(() => {
  "use strict";

  const clock = document.getElementById("lastUpdateText");
  const systemDot = document.getElementById("systemDot");
  const systemStateText = document.getElementById("systemStateText");

  if (!clock) return;

  const formatter = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  function tick() {
    const online =
      (!systemDot || systemDot.classList.contains("online")) &&
      (!systemStateText || systemStateText.textContent.trim() === "Sistema en línea");

    // Si el backend está reportado como offline, conservamos el mensaje de error
    // que admin.js coloca en este mismo elemento.
    if (!online) return;

    clock.textContent = formatter.format(new Date());
    clock.setAttribute("aria-label", "Hora local en tiempo real");
    clock.title = "Hora local en tiempo real";
  }

  tick();
  setInterval(tick, 1000);
})();
