import { api } from "./api.js";

const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const alertBox = document.querySelector("#auth-alert");

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.classList.add("active");
}

function clearAlert() {
  alertBox.textContent = "";
  alertBox.classList.remove("active");
}

function toggleForms(showLogin) {
  if (showLogin) {
    loginForm.hidden = false;
    registerForm.hidden = true;
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
  } else {
    loginForm.hidden = true;
    registerForm.hidden = false;
    loginTab.classList.remove("active");
    registerTab.classList.add("active");
  }
  clearAlert();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    await api.login(payload);
    window.location.href = "dashboard.html";
  } catch (error) {
    showAlert(error.payload?.error === "invalid_credentials" ? "Invalid email or password." : "Unable to login.");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    await api.register(payload);
    window.location.href = "dashboard.html";
  } catch (error) {
    const { error: code } = error.payload || {};
    if (code === "email_in_use") {
      showAlert("Email is already registered.");
    } else {
      showAlert("Unable to create account right now.");
    }
  }
}

async function bootstrap() {
  try {
    const session = await api.session();
    if (session.authenticated) {
      window.location.href = "dashboard.html";
      return;
    }
  } catch (error) {
    // ignore session errors for now
  }
  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);
  loginTab.addEventListener("click", () => toggleForms(true));
  registerTab.addEventListener("click", () => toggleForms(false));
}

bootstrap();

