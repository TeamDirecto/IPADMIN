(() => {
  "use strict";

  const API = "https://vicidial97.directo.com/ip-manager-webadmin-api";

  const token = sessionStorage.getItem("ipadmin_token") || "";
  const username = sessionStorage.getItem("ipadmin_user") || "";
  const role = sessionStorage.getItem("ipadmin_role") || "";

  if (!token || role !== "SUPERADMIN") {
    sessionStorage.removeItem("ipadmin_token");
    sessionStorage.removeItem("ipadmin_user");
    sessionStorage.removeItem("ipadmin_role");
    window.location.replace("./");
    return;
  }

  const $ = (id) => document.getElementById(id);
  const appView = $("appView");
  const createUserForm = $("createUserForm");
  const createUserButton = $("createUserButton");
  const userSearch = $("userSearch");
  const usersBody = $("usersBody");
  const passwordDialog = $("passwordDialog");

  let users = [];

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function text(value, fallback) {
    const v = String(value == null ? "" : value).trim();
    return v || (fallback == null ? "-" : fallback);
  }

  function formatDate(value) {
    if (!value) return "-";
    return String(value).replace("T", " ").replace(/Z$/, "");
  }

  function clearSession() {
    sessionStorage.removeItem("ipadmin_token");
    sessionStorage.removeItem("ipadmin_user");
    sessionStorage.removeItem("ipadmin_role");
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = new Headers(opts.headers || {});
    headers.set("Authorization", "Bearer " + token);

    if (opts.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(API + path, Object.assign({}, opts, { headers: headers }));

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    if (response.status === 401) {
      clearSession();
      window.location.replace("./");
      throw new Error("Sesión expirada");
    }

    if (response.status === 403) {
      clearSession();
      window.location.replace("./");
      throw new Error("Permisos insuficientes");
    }

    if (!response.ok) {
      throw new Error((data && data.detail) || ("HTTP " + response.status));
    }

    return data;
  }

  function toast(message, type) {
    const el = document.createElement("div");
    el.className = "toast " + (type || "success");
    el.textContent = message;
    $("toastHost").appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  function roleOptions(selected) {
    const values = ["REQUESTER", "APPROVER", "SUPERADMIN"];

    return values.map(function (value) {
      return '<option value="' + value + '"' +
        (value === selected ? " selected" : "") +
        ">" + value + "</option>";
    }).join("");
  }

  function normalized(user) {
    return [
      user.username,
      user.role,
      user.created_by,
      user.updated_by,
      user.active ? "activo" : "inactivo"
    ].join(" ").toLowerCase();
  }

  function renderUsers() {
    const q = userSearch.value.trim().toLowerCase();
    const rows = users.filter(function (user) {
      return !q || normalized(user).includes(q);
    });

    if (!rows.length) {
      usersBody.innerHTML = '<tr class="empty-row"><td colspan="7">No hay usuarios que coincidan con la búsqueda.</td></tr>';
      $("usersCountText").textContent = "0 usuarios";
      return;
    }

    usersBody.innerHTML = rows.map(function (user) {
      const stateClass = user.active ? "active" : "inactive";
      const stateLabel = user.active ? "Activo" : "Inactivo";
      const toggleLabel = user.active ? "Desactivar" : "Activar";
      const toggleClass = user.active ? "btn-warning" : "btn-success";
      const updated = user.updated_at
        ? escapeHtml(formatDate(user.updated_at)) + "<small>" + escapeHtml(text(user.updated_by)) + "</small>"
        : "-";

      return '<tr data-user-id="' + escapeHtml(user.id) + '">' +
        '<td><strong>' + escapeHtml(user.username) + '</strong></td>' +
        '<td><div class="user-actions">' +
          '<select class="user-role-select" data-id="' + escapeHtml(user.id) + '">' +
            roleOptions(user.role) +
          '</select>' +
          '<button class="btn btn-ghost btn-sm save-role" data-id="' + escapeHtml(user.id) + '">Guardar</button>' +
        '</div></td>' +
        '<td><span class="user-state ' + stateClass + '">' + stateLabel + '</span></td>' +
        '<td>' + escapeHtml(formatDate(user.last_login)) + '</td>' +
        '<td><div class="user-meta"><strong>' + escapeHtml(text(user.created_by)) + '</strong><small>' +
          escapeHtml(formatDate(user.created_at)) + '</small></div></td>' +
        '<td><div class="user-meta">' + updated + '</div></td>' +
        '<td><div class="user-actions">' +
          '<button class="btn ' + toggleClass + ' btn-sm toggle-user" data-id="' + escapeHtml(user.id) + '">' +
            toggleLabel +
          '</button>' +
          '<button class="btn btn-secondary btn-sm reset-password" data-id="' + escapeHtml(user.id) + '">Contraseña</button>' +
        '</div></td>' +
      '</tr>';
    }).join("");

    $("usersCountText").textContent = rows.length + (rows.length === 1 ? " usuario" : " usuarios");

    document.querySelectorAll(".save-role").forEach(function (button) {
      button.addEventListener("click", function () {
        changeRole(Number(button.dataset.id));
      });
    });

    document.querySelectorAll(".toggle-user").forEach(function (button) {
      button.addEventListener("click", function () {
        toggleUser(Number(button.dataset.id));
      });
    });

    document.querySelectorAll(".reset-password").forEach(function (button) {
      button.addEventListener("click", function () {
        openPasswordDialog(Number(button.dataset.id));
      });
    });
  }

  function findUser(id) {
    return users.find(function (user) {
      return Number(user.id) === Number(id);
    }) || null;
  }

  async function loadUsers() {
    try {
      const data = await api("/users");
      users = Array.isArray(data.users) ? data.users : [];
      users.sort(function (a, b) {
        return String(a.username).localeCompare(String(b.username), "es", { sensitivity: "base" });
      });
      renderUsers();
    } catch (error) {
      if (token) toast(error.message, "error");
    }
  }

  async function changeRole(id) {
    const user = findUser(id);
    const select = document.querySelector('.user-role-select[data-id="' + id + '"]');
    if (!user || !select) return;

    const newRole = select.value;
    if (newRole === user.role) {
      toast("El usuario ya tiene ese rol.", "error");
      return;
    }

    let message = "¿Cambiar a " + user.username + " de " + user.role + " a " + newRole + "?";
    if (user.username.toLowerCase() === username.toLowerCase()) {
      message += "\n\nTu sesión actual se invalidará.";
    }

    if (!confirm(message)) {
      select.value = user.role;
      return;
    }

    try {
      await api("/users/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({ role: newRole })
      });
      toast("Rol actualizado.");
      await loadUsers();
    } catch (error) {
      select.value = user.role;
      toast(error.message, "error");
    }
  }

  async function toggleUser(id) {
    const user = findUser(id);
    if (!user) return;

    const newActive = !user.active;
    let message = (newActive ? "¿Activar a " : "¿Desactivar a ") + user.username + "?";

    if (user.username.toLowerCase() === username.toLowerCase()) {
      message += "\n\nTu sesión actual se invalidará.";
    }

    if (!confirm(message)) return;

    try {
      await api("/users/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({ active: newActive })
      });
      toast(newActive ? "Usuario activado." : "Usuario desactivado.");
      await loadUsers();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function openPasswordDialog(id) {
    const user = findUser(id);
    if (!user) return;

    $("passwordUserId").value = String(user.id);
    $("passwordDialogTitle").textContent = user.username;
    $("resetPassword").value = "";
    $("resetPasswordConfirm").value = "";

    if (typeof passwordDialog.showModal === "function") {
      passwordDialog.showModal();
      setTimeout(function () {
        $("resetPassword").focus();
      }, 50);
    }
  }

  function closePasswordDialog() {
    if (passwordDialog.open) passwordDialog.close();
  }

  createUserForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const newUsername = $("newUsername").value.trim();
    const newRole = $("newRole").value;
    const password = $("newPassword").value;
    const confirmPassword = $("newPasswordConfirm").value;

    if (password !== confirmPassword) {
      toast("Las contraseñas no coinciden.", "error");
      return;
    }

    if (password.length < 12) {
      toast("La contraseña debe tener al menos 12 caracteres.", "error");
      return;
    }

    createUserButton.disabled = true;
    createUserButton.textContent = "Creando...";

    try {
      const data = await api("/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          password: password,
          role: newRole
        })
      });

      toast("Usuario " + data.user.username + " creado.");
      createUserForm.reset();
      $("newRole").value = "REQUESTER";
      await loadUsers();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      createUserButton.disabled = false;
      createUserButton.textContent = "Crear usuario";
    }
  });

  $("passwordForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const id = Number($("passwordUserId").value);
    const user = findUser(id);
    const password = $("resetPassword").value;
    const confirmPassword = $("resetPasswordConfirm").value;

    if (!user) return;

    if (password !== confirmPassword) {
      toast("Las contraseñas no coinciden.", "error");
      return;
    }

    if (password.length < 12) {
      toast("La contraseña debe tener al menos 12 caracteres.", "error");
      return;
    }

    if (user.username.toLowerCase() === username.toLowerCase()) {
      if (!confirm("Cambiar tu propia contraseña invalidará la sesión actual. ¿Continuar?")) {
        return;
      }
    }

    $("savePasswordButton").disabled = true;

    try {
      await api("/users/" + encodeURIComponent(id) + "/password", {
        method: "POST",
        body: JSON.stringify({ password: password })
      });

      closePasswordDialog();
      toast("Contraseña actualizada para " + user.username + ".");
      await loadUsers();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      $("savePasswordButton").disabled = false;
    }
  });

  $("passwordDialogClose").addEventListener("click", closePasswordDialog);
  $("cancelPasswordButton").addEventListener("click", closePasswordDialog);

  userSearch.addEventListener("input", renderUsers);
  $("refreshButton").addEventListener("click", loadUsers);

  $("requestsButton").addEventListener("click", function () {
    window.location.href = "./";
  });

  $("diagnosticButton").addEventListener("click", function () {
    window.location.href = "diagnostico.html";
  });

  $("logoutButton").addEventListener("click", function () {
    clearSession();
    window.location.replace("./");
  });

  $("sessionUser").textContent = username;
  $("sessionRole").textContent = "Superadministrador";
  appView.hidden = false;

  loadUsers();
})();
