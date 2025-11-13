import { api } from "./api.js";

const params = new URLSearchParams(window.location.search);
const groupId = Number.parseInt(params.get("group_id"), 10);

const groupNameEl = document.querySelector("#group-name");
const groupIdEl = document.querySelector("#group-id");
const memberList = document.querySelector("#member-list");
const balanceList = document.querySelector("#balance-list");
const settlementsEl = document.querySelector("#settlements");
const expenseList = document.querySelector("#expense-list");
const logoutBtn = document.querySelector("#logout-btn");
const addExpenseLink = document.querySelector("#add-expense-link");

// current signed-in user (filled during bootstrap)
let currentUser = null;
let _lastBalancesSnapshot = null;
let _balancesPollHandle = null;
// Simple toast helper
function showToast(msg, opts = {}) {
  const t = document.createElement("div");
  t.className = "splitit-toast";
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed",
    right: "20px",
    bottom: "24px",
    background: "#117a3b",
    color: "white",
    padding: "10px 14px",
    borderRadius: "8px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    zIndex: 99999,
    fontWeight: 600,
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), opts.duration || 4500);
}

if (!groupId) {
  window.location.href = "dashboard.html";
}

function formatCurrency(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

function renderMembers(members) {
  memberList.innerHTML = "";
  members.forEach((member) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = member.name;
    memberList.appendChild(tag);
  });
}

function renderBalances(balances) {
  balanceList.innerHTML = "";
  if (!balances.length) {
    balanceList.innerHTML = '<div class="empty-state">Balances will appear after expenses are added.</div>';
    return;
  }

  balances.forEach((balance) => {
    const row = document.createElement("div");
    row.className = `list-item ${balance.net_balance > 0 ? "positive" : balance.net_balance < 0 ? "negative" : ""}`;
    
    const pendingInfo = balance.pending_amount > 0 
      ? `<span class="pending-badge">Pending: ${formatCurrency(balance.pending_amount)}</span>`
      : "";
    
    // Show mark-paid only for the signed-in user and when they owe and have pending amount
    const showMarkPaid =
      currentUser &&
      currentUser.id === balance.user_id &&
      balance.pending_amount > 0 &&
      Number(balance.net_balance) < 0;

    const markPaidBtn = showMarkPaid
      ? `<button class="mark-paid-btn" data-user-id="${balance.user_id}" type="button">Mark as Paid</button>`
      : "";

    row.innerHTML = `
      <div>
        <strong>${balance.name}</strong>
        <span>${balance.net_balance > 0 ? "Gets back" : balance.net_balance < 0 ? "Owes" : "Settled"} ${formatCurrency(
      Math.abs(balance.net_balance)
    )}</span>
        ${pendingInfo}
      </div>
      ${markPaidBtn}
    `;
    balanceList.appendChild(row);
  });

  balanceList.querySelectorAll(".mark-paid-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = Number(btn.dataset.userId);
      await handleMarkPaid(userId);
    });
  });
}

function renderSettlements(settlements) {
  settlementsEl.innerHTML = "";
  if (!settlements.length) {
    settlementsEl.innerHTML = '<div class="empty-state">No settlements required yet.</div>';
    return;
  }

  settlements.forEach((item) => {
    const row = document.createElement("div");
    row.className = "settlement";
    row.textContent = `${item.from_name} pays ${item.to_name} ${formatCurrency(item.amount)}`;
    settlementsEl.appendChild(row);
  });
}

function renderExpenses(expenses) {
  expenseList.innerHTML = "";
  if (!expenses.length) {
    expenseList.innerHTML = '<div class="empty-state">No expenses yet. Add one to get started.</div>';
    return;
  }

  expenses.forEach((expense) => {
    const card = document.createElement("article");
    card.className = "list-item";
    const date = new Date(expense.date_added).toLocaleString();

    // Determine payer display name with fallback if API doesn't include it
    const payerName = expense.paid_by_name || (expense.contributions && expense.contributions[0] && expense.contributions[0].name) || "Unknown";
    if (!expense.paid_by_name) {
      console.warn(`Expense ${expense.id} missing paid_by_name; using fallback: ${payerName}`);
    }

    const shares = expense.shares
      .map((share) => {
        const parts = [];
        if (share.paid_amount > 0) {
          parts.push(`<span class="paid-amount">Paid: ${formatCurrency(share.paid_amount)}</span>`);
        }
        if (share.pending_amount > 0) {
          parts.push(`<span class="pending-amount">Pending: ${formatCurrency(share.pending_amount)}</span>`);
        }
        const status = parts.length ? ` <span class="share-status">${parts.join(" · ")}</span>` : "";

        // If the current user owes on this share, show a per-expense mark-paid button
        const showExpenseMarkPaid =
          currentUser &&
          currentUser.id === share.user_id &&
          share.pending_amount > 0 &&
          Number(share.pending_amount) > 0;

        const buttonHtml = showExpenseMarkPaid
          ? ` <button class="mark-paid-btn expense-mark-paid-btn" data-expense-id="${expense.id}" data-user-id="${share.user_id}" data-amount="${share.pending_amount}" type="button">Mark Paid</button>`
          : "";

        return `<span class="tag">${share.name}: ${formatCurrency(share.share_amount)}${status}${buttonHtml}</span>`;
      })
      .join(" ");
    
    const contributions = expense.contributions
      .map((contribution) => `<span class="tag">Paid ${contribution.name}: ${formatCurrency(contribution.amount)}</span>`)
      .join(" ");
    
    // Show delete button to the payer (allow deletion after settlement as well)
    const showDelete = currentUser && currentUser.id === expense.paid_by;
    const deleteBtnHtml = showDelete
      ? ` <button class="secondary" data-expense-id="${expense.id}" data-action="delete-expense" type="button">Delete Expense</button>`
      : "";

    card.innerHTML = `
      <h3>${expense.title}</h3>
      <div class="meta">Paid by ${payerName} &middot; ${date}</div>
      <p><strong>${formatCurrency(expense.amount)}</strong></p>
      <div class="inline">${shares}</div>
      <div class="inline">${contributions}</div>
      <div class="inline">${deleteBtnHtml}</div>
    `;
    expenseList.appendChild(card);
  });

    // Attach handlers for per-expense mark-paid buttons
    expenseList.querySelectorAll(".expense-mark-paid-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const expenseId = Number(btn.dataset.expenseId);
        const userId = Number(btn.dataset.userId);
        const amount = Number(btn.dataset.amount);
        try {
          const res = await api.groups.expenses.payments.create(groupId, expenseId, { user_id: userId, amount });
          console.debug("expense payment created", { expenseId, userId, amount, res });
          await loadGroup();
        } catch (error) {
          console.error("expense payment error", error);
          alert(error.payload?.error || "Unable to mark expense as paid. Please try again.");
        }
      });
    });
}

async function loadGroup() {
  const members = await api.groups.members(groupId);
  renderMembers(members);

  const balances = await api.groups.balances(groupId);
  console.debug("loadGroup: balances fetched", balances);
  renderBalances(balances.balances);
  renderSettlements(balances.settlements);

  const expenses = await api.groups.expenses.list(groupId);
  renderExpenses(expenses);
}

// Lightweight polling to refresh balances when others pay (frontend-only)
function startBalancesPolling(intervalMs = 5000) {
  // avoid multiple intervals
  if (_balancesPollHandle) return;

  _balancesPollHandle = setInterval(async () => {
    try {
      const [balances, expenses] = await Promise.all([
        api.groups.balances(groupId),
        api.groups.expenses.list(groupId),
      ]);

      // Build lightweight expense snapshot: map expenseId -> { shares: {user_id: paid_amount} }
      const expensesSnapshot = {};
      expenses.forEach((e) => {
        expensesSnapshot[e.id] = {
          id: e.id,
          title: e.title,
          paid_by_name: e.paid_by_name,
          shares: {},
        };
        (e.shares || []).forEach((s) => {
          expensesSnapshot[e.id].shares[s.user_id] = Number(s.paid_amount || 0);
        });
      });

      const snapshotObj = { b: balances.balances, s: balances.settlements, e: expensesSnapshot };
      const snapshot = JSON.stringify(snapshotObj);

      if (snapshot !== _lastBalancesSnapshot) {
        console.debug("balances+expenses poll: change detected, updating UI");

        // If we have a previous snapshot, compute per-expense share payment deltas to show specific messages
        if (_lastBalancesSnapshot) {
          try {
            const prev = JSON.parse(_lastBalancesSnapshot);
            const prevExpenses = prev.e || {};
            // iterate current expenses and compare paid_amounts
            Object.keys(expensesSnapshot).forEach((expId) => {
              const currExp = expensesSnapshot[expId];
              const prevExp = prevExpenses[expId] || { shares: {} };
              Object.keys(currExp.shares).forEach((userId) => {
                const prevPaid = Number(prevExp.shares[userId] || 0);
                const currPaid = Number(currExp.shares[userId] || 0);
                if (currPaid > prevPaid) {
                  const delta = (currPaid - prevPaid).toFixed(2);
                  const payer = currExp.paid_by_name || "Payer";
                  // find the debtor name from balances list
                  const debtor = balances.balances.find((b) => Number(b.user_id) === Number(userId))?.name || "User";
                  showToast(`${debtor} paid ${payer} ₹${delta} for '${currExp.title}'`);
                }
              });
            });
          } catch (e) {
            console.debug("error diffing snapshots", e);
          }
        }

        _lastBalancesSnapshot = snapshot;
        renderBalances(balances.balances);
        renderSettlements(balances.settlements);
        renderExpenses(expenses);
      }
    } catch (err) {
      // ignore transient errors but log for debugging
      console.debug("balances+expenses poll error", err);
    }
  }, intervalMs);
}

function stopBalancesPolling() {
  if (_balancesPollHandle) {
    clearInterval(_balancesPollHandle);
    _balancesPollHandle = null;
  }
}

async function handleMarkPaid(userId) {
  try {
    const res = await api.groups.markPaid(groupId, userId);
    console.debug("markPaid result", { userId, res });
    await loadGroup();
  } catch (error) {
    alert(error.payload?.error || "Unable to mark as paid. Please try again.");
  }
}

async function bootstrap() {
  try {
    const session = await api.session();
    if (!session.authenticated) {
      window.location.href = "index.html";
      return;
    }
    currentUser = session.user;
  } catch (error) {
    window.location.href = "index.html";
    return;
  }

  addExpenseLink.href = `add_expense.html?group_id=${groupId}`;

  await loadGroup();
  // capture initial snapshot and start polling so balances update when others pay
  try {
    const initial = await api.groups.balances(groupId);
    _lastBalancesSnapshot = JSON.stringify({ b: initial.balances, s: initial.settlements });
  } catch (e) {
    _lastBalancesSnapshot = null;
  }
  startBalancesPolling(5000);
  const groups = await api.groups.list();
  const currentGroup = groups.find((g) => g.id === groupId);
  groupNameEl.textContent = currentGroup?.group_name ?? "Group";
  groupIdEl.textContent = currentGroup ? `Group ID: ${currentGroup.id}` : "";

  logoutBtn.addEventListener("click", async () => {
    try {
      await api.logout();
    } finally {
      window.location.href = "index.html";
    }
  });

  // Attach delete handlers for expenses (payer only)
  expenseList.querySelectorAll('[data-action="delete-expense"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const expenseId = Number(btn.dataset.expenseId);
      if (!confirm("Delete this expense? This action cannot be undone.")) return;
      try {
        await api.groups.expenses.delete(groupId, expenseId);
        await loadGroup();
      } catch (error) {
        alert(error.payload?.error || "Unable to delete expense. Please try again.");
      }
    });
  });
}

bootstrap();

