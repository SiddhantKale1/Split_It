import { api } from "./api.js";
import { saveDraft, loadDraft, clearDraft } from "./storage.js";

const form = document.querySelector("#expense-form");
const alertBox = document.querySelector("#expense-alert");
const groupSelect = form.querySelector('select[name="group_id"]');
const paidBySelect = form.querySelector('select[name="paid_by"]');
const memberGrid = document.querySelector("#member-grid");
const splitEvenBtn = document.querySelector("#split-even-btn");
const selectAllBtn = document.querySelector("#select-all-btn");
const restoreDraftBtn = document.querySelector("#restore-draft-btn");
const logoutBtn = document.querySelector("#logout-btn");

let membersCache = {};
let pendingMemberState = null;

const params = new URLSearchParams(window.location.search);
const presetGroupId = Number.parseInt(params.get("group_id"), 10);

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.classList.add("active");
}

function clearAlert() {
  alertBox.classList.remove("active");
  alertBox.textContent = "";
}

function getMemberRows() {
  return Array.from(memberGrid.querySelectorAll(".member-row"));
}

function parseAmount(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function renderMembers(members) {
  membersCache = Object.fromEntries(members.map((member) => [member.id, member]));

  const previousPaidBy = paidBySelect.value;
  paidBySelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.textContent = "Select paid by";
  placeholder.selected = true;
  paidBySelect.appendChild(placeholder);

  // store keys as strings so comparisons with select.value (which is a string) work
  membersCache = Object.fromEntries(members.map((member) => [String(member.id), member]));

  // Debug: log members returned from API so we can inspect shape in the console
  console.debug("renderMembers: members=", members);

  members.forEach((member) => {
    const option = document.createElement("option");
    option.value = String(member.id);
    // fallback: some APIs may return first/last name separately
    const displayName = member.name || `${member.first_name || ""} ${member.last_name || ""}`.trim();
    option.textContent = displayName || String(member.id);
    // set label for older browsers / accessibility
    option.label = option.textContent;
    // Force visible color on the option element (helps on some Windows browsers)
    try {
      const textColor = getComputedStyle(document.documentElement).getPropertyValue("--text") || "#000";
      option.style.color = textColor.trim();
    } catch (e) {
      // ignore
    }
    paidBySelect.appendChild(option);
  });

  // Ensure the select itself uses the theme text color (some browsers/style resets override it)
  try {
    const textColor = getComputedStyle(document.documentElement).getPropertyValue("--text") || "#000";
    paidBySelect.style.color = textColor.trim();
  } catch (e) {}

  // Create a custom, searchable Paid-by control (keeps native select for form submission)
  let control = paidBySelect.parentNode.querySelector(".paid-by-control");
  if (!control) {
    control = document.createElement("div");
    control.className = "paid-by-control";
    // build structure: toggle + dropdown
    control.innerHTML = `
      <button type="button" class="paid-by-toggle" aria-haspopup="listbox" aria-expanded="false">Select payer</button>
      <div class="paid-by-dropdown" hidden>
        <input class="paid-by-search" placeholder="Search members..." aria-label="Search members" />
        <ul class="paid-by-list" role="listbox"></ul>
      </div>
    `;
    paidBySelect.parentNode.appendChild(control);

    // toggle behavior
    const toggle = control.querySelector(".paid-by-toggle");
    const dropdown = control.querySelector(".paid-by-dropdown");
    const search = control.querySelector(".paid-by-search");
    const list = control.querySelector(".paid-by-list");

    function closeDropdown() {
      dropdown.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }

    function openDropdown() {
      dropdown.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      search.focus();
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (dropdown.hidden) openDropdown();
      else closeDropdown();
    });

    // close on outside click
    document.addEventListener("click", (ev) => {
      if (!control.contains(ev.target)) closeDropdown();
    });

    // filter list
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll("li").forEach((li) => {
        const text = li.dataset.name.toLowerCase();
        li.style.display = text.includes(q) ? "flex" : "none";
      });
    });

    // reflect native select changes
    paidBySelect.addEventListener("change", () => {
      const val = paidBySelect.value;
      const opt = paidBySelect.querySelector(`option[value="${val}"]`);
      toggle.textContent = opt ? opt.textContent : "Select payer";
    });
  }

  const list = control.querySelector(".paid-by-list");
  const search = control.querySelector(".paid-by-search");
  const toggle = control.querySelector(".paid-by-toggle");

  // populate list
  list.innerHTML = "";
  members.forEach((member) => {
    const li = document.createElement("li");
    li.className = "paid-by-item";
    li.dataset.value = String(member.id);
    li.dataset.name = (member.name || "").trim();
    li.innerHTML = `
      <span class="paid-by-name">${member.name || String(member.id)}</span>
      <span class="paid-by-meta">${member.email ? member.email : ""}</span>
    `;
    li.addEventListener("click", (e) => {
      paidBySelect.value = li.dataset.value;
      // update toggle
      toggle.textContent = li.dataset.name || li.dataset.value;
      // clear search
      search.value = "";
      // close dropdown
      const dropdown = control.querySelector(".paid-by-dropdown");
      dropdown.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      paidBySelect.dispatchEvent(new Event("change"));
    });
    list.appendChild(li);
  });

  // If there was a previous selection, reflect it
  if (previousPaidBy && membersCache[String(previousPaidBy)]) {
    const selOpt = membersCache[String(previousPaidBy)];
    const toggle = control.querySelector(".paid-by-toggle");
    toggle.textContent = selOpt.name || String(selOpt.id);
  }

  if (previousPaidBy && membersCache[String(previousPaidBy)]) {
    paidBySelect.value = String(previousPaidBy);
    placeholder.selected = false;
  } else if (members.length === 1) {
    paidBySelect.value = String(members[0].id);
    placeholder.selected = false;
  } else {
    paidBySelect.value = "";
  }

  memberGrid.innerHTML = "";
  members.forEach((member) => {
    const row = document.createElement("div");
    row.className = "member-row";
    row.dataset.userId = member.id;
    row.innerHTML = `
      <label>
        <input type="checkbox" class="member-include" data-user-id="${member.id}" />
        ${member.name}
      </label>
      <div class="member-number-field">
        <span class="field-label">Share (₹)</span>
        <input type="number" class="share-input" step="0.01" min="0" disabled />
      </div>
      <div class="member-number-field">
        <span class="field-label">Paid (₹)</span>
        <input type="number" class="contribution-input" step="0.01" min="0" />
      </div>
    `;
    memberGrid.appendChild(row);
  });

  applyPendingMemberState();
}

function applyPendingMemberState() {
  if (!pendingMemberState) return;
  const rows = getMemberRows();
  if (!rows.length) return;

  const shareMap = new Map();
  if (pendingMemberState.shares?.length) {
    pendingMemberState.shares.forEach((share) => {
      shareMap.set(Number(share.user_id), Number(share.share_amount));
    });
  } else if (pendingMemberState.split_among?.length) {
    pendingMemberState.split_among.forEach((userId) => {
      shareMap.set(Number(userId), null);
    });
  }

  const contributionMap = new Map();
  if (pendingMemberState.contributors?.length) {
    pendingMemberState.contributors.forEach((entry) => {
      contributionMap.set(Number(entry.user_id), Number(entry.amount_paid ?? entry.amount));
    });
  }

  rows.forEach((row) => {
    const userId = Number(row.dataset.userId);
    const checkbox = row.querySelector(".member-include");
    const shareInput = row.querySelector(".share-input");
    const contributionInput = row.querySelector(".contribution-input");

    const hasShare = shareMap.has(userId);
    checkbox.checked = hasShare;
    shareInput.disabled = !hasShare;
    shareInput.value =
      hasShare && shareMap.get(userId) !== null && !Number.isNaN(shareMap.get(userId))
        ? Number(shareMap.get(userId)).toFixed(2)
        : "";

    const contributionValue = contributionMap.get(userId);
    contributionInput.value =
      contributionValue && !Number.isNaN(contributionValue) ? Number(contributionValue).toFixed(2) : "";
  });

  pendingMemberState = null;
}

async function loadGroups() {
  const groups = await api.groups.list();
  groupSelect.innerHTML = '<option value="" disabled selected>Select a group</option>';
  groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.group_name;
    groupSelect.appendChild(option);
  });

  if (presetGroupId && groups.some((g) => g.id === presetGroupId)) {
    groupSelect.value = presetGroupId;
    await loadMembers(presetGroupId);
  }
}

async function loadMembers(groupId) {
  if (!groupId) {
    memberGrid.innerHTML = "";
    paidBySelect.innerHTML = "";
    return;
  }
  const members = await api.groups.members(groupId);
  renderMembers(members);
}

function serializeForm() {
  const formData = new FormData(form);
  const groupId = Number(formData.get("group_id"));
  const amountInput = formData.get("amount");
  const amount = amountInput === "" ? NaN : Number.parseFloat(amountInput);
  const paidByValue = formData.get("paid_by");
  const paidBy = paidByValue ? Number(paidByValue) : null;

  const shares = [];
  const contributors = [];
  const splitAmong = [];

  getMemberRows().forEach((row) => {
    const userId = Number(row.dataset.userId);
    const include = row.querySelector(".member-include").checked;
    const shareInput = row.querySelector(".share-input");
    const contributionInput = row.querySelector(".contribution-input");

    const shareValue = parseAmount(shareInput.value);
    const contributionValue = parseAmount(contributionInput.value);

    if (include) {
      splitAmong.push(userId);
      shares.push({ user_id: userId, share_amount: shareValue });
    }

    if (contributionValue > 0) {
      contributors.push({ user_id: userId, amount_paid: contributionValue });
    }
  });

  return {
    group_id: groupId,
    title: formData.get("title"),
    amount,
    paid_by: paidBy,
    shares,
    contributors,
    split_among: splitAmong,
  };
}

function hydrateForm(data) {
  if (!data) return;
  if (data.group_id) {
    groupSelect.value = data.group_id;
  }
  form.title.value = data.title || "";
  form.amount.value = data.amount || "";
  paidBySelect.value = data.paid_by ?? "";
  pendingMemberState = data;
  applyPendingMemberState();
}

function totalsMatch(target, values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.abs(total - target) <= 0.01;
}

async function handleSubmit(event) {
  event.preventDefault();
  clearAlert();

  const payload = serializeForm();
  const { group_id: groupId, title, amount, shares, contributors, paid_by: paidBy } = payload;

  if (!groupId || !title || Number.isNaN(amount) || amount <= 0) {
    showAlert("Please complete all required fields with valid values.");
    return;
  }

  if (!shares.length) {
    showAlert("Add at least one member to split the expense.");
    return;
  }

  if (!totalsMatch(amount, shares.map((share) => share.share_amount))) {
    showAlert("The member share amounts must add up to the total expense.");
    return;
  }

  const positiveShares = shares.every((share) => share.share_amount > 0);
  if (!positiveShares) {
    showAlert("Share amounts must be greater than zero.");
    return;
  }

  if (contributors.length) {
    const hasValidContributors = contributors.every((entry) => entry.amount_paid > 0);
    if (!hasValidContributors) {
      showAlert("Contribution amounts must be greater than zero.");
      return;
    }
    if (!totalsMatch(amount, contributors.map((entry) => entry.amount_paid))) {
      showAlert("The paid amounts must add up to the total expense.");
      return;
    }
  } else if (!paidBy) {
    showAlert("Select who paid the expense or enter contributions.");
    return;
  }

  try {
    await api.groups.expenses.create(groupId, {
      title,
      amount,
      paid_by: paidBy,
      shares,
      contributors,
    });
    clearDraft();
    window.location.href = `group.html?group_id=${groupId}`;
  } catch (error) {
    showAlert(error.payload?.error || "Unable to save expense right now.");
  }
}

function handleDraftSave() {
  const data = serializeForm();
  saveDraft(data);
}

function handleRestoreDraft() {
  const draft = loadDraft();
  if (!draft) {
    showAlert("No draft found.");
    return;
  }
  hydrateForm(draft);
  showAlert("Draft restored.");
}

function handleSplitEvenly() {
  clearAlert();
  const amount = Number.parseFloat(form.amount.value);
  if (!amount || amount <= 0) {
    showAlert("Enter the total amount before splitting evenly.");
    return;
  }

  const rows = getMemberRows().filter((row) => row.querySelector(".member-include").checked);
  if (!rows.length) {
    showAlert("Select at least one member to split the expense.");
    return;
  }

  const count = rows.length;
  const evenShare = Number((amount / count).toFixed(2));
  let assigned = 0;

  rows.forEach((row, index) => {
    const shareInput = row.querySelector(".share-input");
    if (index === rows.length - 1) {
      const remaining = Number((amount - assigned).toFixed(2));
      shareInput.value = remaining.toFixed(2);
    } else {
      shareInput.value = evenShare.toFixed(2);
      assigned += evenShare;
    }
  });

  handleDraftSave();
}

function handleSelectAll() {
  getMemberRows().forEach((row) => {
    const checkbox = row.querySelector(".member-include");
    const shareInput = row.querySelector(".share-input");
    if (!checkbox.checked) {
      checkbox.checked = true;
      shareInput.disabled = false;
    }
  });
  handleDraftSave();
}

function setupEventListeners() {
  memberGrid.addEventListener("change", (event) => {
    if (event.target.matches(".member-include")) {
      const row = event.target.closest(".member-row");
      const shareInput = row.querySelector(".share-input");
      const contributionInput = row.querySelector(".contribution-input");
      if (event.target.checked) {
        shareInput.disabled = false;
        shareInput.focus();
      } else {
        shareInput.disabled = true;
        shareInput.value = "";
        contributionInput.value = "";
      }
      handleDraftSave();
    }
  });

  memberGrid.addEventListener("input", (event) => {
    if (event.target.matches(".share-input") || event.target.matches(".contribution-input")) {
      handleDraftSave();
    }
  });

  splitEvenBtn.addEventListener("click", handleSplitEvenly);
  selectAllBtn.addEventListener("click", handleSelectAll);
  restoreDraftBtn.addEventListener("click", handleRestoreDraft);
}

async function bootstrap() {
  try {
    const session = await api.session();
    if (!session.authenticated) {
      window.location.href = "index.html";
      return;
    }
  } catch (error) {
    window.location.href = "index.html";
    return;
  }

  setupEventListeners();

  await loadGroups();

  if (presetGroupId && !Number.isNaN(presetGroupId)) {
    await loadMembers(presetGroupId);
  }

  const draft = loadDraft();
  if (draft) {
    hydrateForm(draft);
  }

  groupSelect.addEventListener("change", async (event) => {
    const groupId = Number(event.target.value);
    pendingMemberState = null;
    await loadMembers(groupId);
    handleDraftSave();
  });

  form.addEventListener("input", handleDraftSave);
  form.addEventListener("submit", handleSubmit);

  logoutBtn.addEventListener("click", async () => {
    try {
      await api.logout();
    } finally {
      window.location.href = "index.html";
    }
  });
}

bootstrap();

