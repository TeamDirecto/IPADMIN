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
