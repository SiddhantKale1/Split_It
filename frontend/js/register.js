import { api } from "./api.js";

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

async function handleRegister(event) {
  event.preventDefault();
  clearAlert();
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

function bootstrap() {
  registerForm.addEventListener("submit", handleRegister);
}

bootstrap();
