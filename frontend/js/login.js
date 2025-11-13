import { api } from "./api.js";

const loginForm = document.querySelector("#login-form");
const alertBox = document.querySelector("#auth-alert");

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.classList.add("active");
}

function clearAlert() {
  alertBox.textContent = "";
  alertBox.classList.remove("active");
}

async function handleLogin(event) {
  event.preventDefault();
  clearAlert();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    await api.login(payload);
    window.location.href = "dashboard.html";
  } catch (error) {
    showAlert(error.payload?.error === "invalid_credentials" ? "Invalid email or password." : "Unable to login.");
  }
}

async function bootstrap() {
  try {
    const session = await api.session();
    if (session.authenticated) {
      window.location.href = "dashboard.html";
      return;
    }
  } catch (e) {}

  loginForm.addEventListener("submit", handleLogin);
}

bootstrap();
