(() => {
  "use strict";

  const clock = document.getElementById("flipClock");
  const systemDot = document.getElementById("systemDot");
  const systemStateText = document.getElementById("systemStateText");
  if (!clock) return;

  const digits = [...clock.querySelectorAll(".flip-digit")];
  const ampm = clock.querySelector(".flip-ampm");

  function setDigit(el, value) {
    if (el && el.textContent !== value) {
      el.classList.remove("flip");
      void el.offsetWidth;
      el.textContent = value;
      el.dataset.digit = value;
      el.classList.add("flip");
    }
  }

  function tick() {
    const online =
      (!systemDot || systemDot.classList.contains("online")) &&
      (!systemStateText || systemStateText.textContent.trim() === "Sistema en línea");

    if (!online) return;

    const now = new Date();
    let hours = now.getHours();
    const meridiem = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    const value = String(hours).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");

    digits.forEach((el, i) => setDigit(el, value[i]));
    if (ampm) ampm.textContent = meridiem;

    clock.setAttribute("aria-label", "Hora local " + value.slice(0,2) + ":" + value.slice(2,4) + ":" + value.slice(4,6) + " " + meridiem);
    clock.title = "Hora local en tiempo real";
  }

  tick();
  setInterval(tick, 1000);
})();