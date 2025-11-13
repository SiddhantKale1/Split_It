import { api } from "./api.js";

const groupList = document.querySelector("#group-list");
const recentExpenses = document.querySelector("#recent-expenses");
const createGroupBtn = document.querySelector("#create-group-btn");
const joinGroupBtn = document.querySelector("#join-group-btn");
const logoutBtn = document.querySelector("#logout-btn");
const userPill = document.querySelector("#user-pill");
const modalOverlay = document.querySelector("#modal-overlay");
const modalTitle = document.querySelector("#modal-title");
const modalFields = document.querySelector("#modal-fields");
const modalForm = document.querySelector("#modal-form");
const modalCancel = document.querySelector("#modal-cancel");
const modalSubmitButton = document.querySelector("#modal-submit");

let modalSubmitHandler = null;

function alertError(message) {
  window.alert(message || "Something went wrong. Please try again.");
}

function closeModal() {
  modalOverlay.hidden = true;
  modalFields.innerHTML = "";
  modalForm.reset();
  modalSubmitHandler = null;
  modalSubmitButton.disabled = false;
  modalSubmitButton.textContent = modalSubmitButton.dataset.defaultLabel || "Save";
}

function openModal({ title, fields, onSubmit, submitLabel }) {
  modalTitle.textContent = title;
  modalFields.innerHTML = "";
  modalSubmitHandler = onSubmit;

  const inputs = [];

  fields.forEach((field) => {
    const labelEl = document.createElement("label");
    labelEl.textContent = field.label;
    const inputEl = document.createElement("input");
    inputEl.type = field.type || "text";
    inputEl.name = field.name;
    inputEl.required = field.required ?? true;
    if (field.placeholder) {
      inputEl.placeholder = field.placeholder;
    }
    if (field.min !== undefined) {
      inputEl.min = field.min;
    }
    if (field.step !== undefined) {
      inputEl.step = field.step;
    }
    labelEl.appendChild(inputEl);
    modalFields.appendChild(labelEl);
    inputs.push(inputEl);
  });

  modalSubmitButton.textContent = submitLabel || "Save";
  modalSubmitButton.dataset.defaultLabel = modalSubmitButton.textContent;

  modalOverlay.hidden = false;

  if (inputs.length) {
    setTimeout(() => inputs[0].focus(), 50);
  }
}

modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (event) => {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

modalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!modalSubmitHandler) {
    closeModal();
    return;
  }

  const formData = new FormData(modalForm);
  const values = Object.fromEntries(formData.entries());

  const defaultLabel = modalSubmitButton.dataset.defaultLabel || "Save";
  modalSubmitButton.disabled = true;
  modalSubmitButton.textContent = "Saving...";

  try {
    const result = await modalSubmitHandler(values);
    if (result === false) {
      modalSubmitButton.disabled = false;
      modalSubmitButton.textContent = defaultLabel;
      return;
    }
    closeModal();
  } catch (error) {
    console.error(error);
    alertError(error?.payload?.error || "Unable to complete the action.");
    modalSubmitButton.disabled = false;
    modalSubmitButton.textContent = defaultLabel;
  }
});

async function ensureAuthenticated() {
  try {
    const session = await api.session();
    if (!session.authenticated) {
      window.location.href = "index.html";
      return null;
    }
    userPill.textContent = session.user.name;
    return session.user;
  } catch (error) {
    window.location.href = "index.html";
    return null;
  }
}

function renderGroups(groups) {
  groupList.innerHTML = "";
  if (!groups.length) {
    groupList.innerHTML = '<div class="empty-state">No groups yet. Create one or join an existing group!</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  groups.forEach((group) => {
    const card = document.createElement("article");
    card.className = "list-item";
    card.innerHTML = `
      <h3>${group.group_name}</h3>
      <div class="meta">Group ID: <strong>${group.id}</strong></div>
      <div class="meta">Created by ${group.created_by_name}</div>
      <div class="inline">
        <a class="secondary" href="group.html?group_id=${group.id}">Open</a>
      </div>
    `;
    fragment.appendChild(card);
  });
  groupList.appendChild(fragment);
}

function renderRecent(expenses) {
  recentExpenses.innerHTML = "";
  if (!expenses.length) {
    recentExpenses.innerHTML = '<div class="empty-state">Add an expense to see it here.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  expenses.slice(0, 5).forEach((expense) => {
    const card = document.createElement("article");
    card.className = "list-item";
    card.innerHTML = `
      <h3>${expense.title}</h3>
      <div class="meta">${expense.group_name} &middot; ₹${expense.amount.toFixed(2)}</div>
      <div class="meta">Paid by ${expense.paid_by_name}</div>
      <a class="secondary" href="group.html?group_id=${expense.group_id}">View group</a>
    `;
    fragment.appendChild(card);
  });
  recentExpenses.appendChild(fragment);
}

async function loadData() {
  try {
    const groups = await api.groups.list();
    renderGroups(groups);

    const expenseResponses = await Promise.all(
      groups.map(async (group) => {
        const groupExpenses = await api.groups.expenses.list(group.id);
        return groupExpenses.map((expense) => ({
          ...expense,
          group_name: group.group_name,
          group_id: group.id,
        }));
      })
    );

    const expenses = expenseResponses.flat();
    expenses.sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
    renderRecent(expenses);
  } catch (error) {
    alertError("Unable to load your groups right now.");
    console.error(error);
  }
}

async function handleCreateGroup() {
  openModal({
    title: "Create new group",
    submitLabel: "Create",
    fields: [
      {
        label: "Group name",
        name: "group_name",
        placeholder: "Room 12 - Block C",
      },
    ],
    onSubmit: async (values) => {
      const name = (values.group_name || "").trim();
      if (!name) {
        alertError("Please enter a group name.");
        return false;
      }
      try {
        await api.groups.create({ group_name: name });
        await loadData();
      } catch (error) {
        alertError("Unable to create the group. Please try again.");
        console.error(error);
        return false;
      }
    },
  });
}

async function handleJoinGroup() {
  openModal({
    title: "Join existing group",
    submitLabel: "Join",
    fields: [
      {
        label: "Group ID",
        name: "group_id",
        placeholder: "Enter numeric group ID",
        type: "number",
        min: 1,
      },
    ],
    onSubmit: async (values) => {
      const groupId = Number.parseInt(values.group_id, 10);
      if (Number.isNaN(groupId)) {
        alertError("Please enter a valid numeric group ID.");
        return false;
      }
      try {
        await api.groups.join(groupId);
        await loadData();
      } catch (error) {
        if (error.payload?.error === "group_not_found") {
          alertError("No group found with that ID.");
        } else {
          alertError("Unable to join the group right now.");
        }
        console.error(error);
        return false;
      }
    },
  });
}

async function handleLogout() {
  try {
    await api.logout();
  } catch (error) {
    console.error(error);
  } finally {
    window.location.href = "index.html";
  }
}

async function bootstrap() {
  const user = await ensureAuthenticated();
  if (!user) return;

  createGroupBtn.addEventListener("click", handleCreateGroup);
  joinGroupBtn.addEventListener("click", handleJoinGroup);
  logoutBtn.addEventListener("click", handleLogout);

  await loadData();
}

bootstrap();

