const API_BASE_URL = window.location.origin.includes("http")
  ? `${window.location.origin}/api`
  : "http://localhost:5000/api";

const defaultOptions = {
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export const api = {
  session: () => apiRequest("/session"),
  login: (payload) =>
    apiRequest("/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  register: (payload) =>
    apiRequest("/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    apiRequest("/logout", {
      method: "POST",
    }),
  groups: {
    list: () => apiRequest("/groups"),
    create: (payload) =>
      apiRequest("/groups", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    join: (groupId) =>
      apiRequest(`/groups/${groupId}/join`, {
        method: "POST",
      }),
    members: (groupId) => apiRequest(`/groups/${groupId}/members`),
    balances: (groupId) => apiRequest(`/groups/${groupId}/balances`),
    expenses: {
      list: (groupId) => apiRequest(`/groups/${groupId}/expenses`),
      create: (groupId, payload) =>
        apiRequest(`/groups/${groupId}/expenses`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      delete: (groupId, expenseId) =>
        apiRequest(`/groups/${groupId}/expenses/${expenseId}`, {
          method: "DELETE",
        }),
      payments: {
        create: (groupId, expenseId, payload) =>
          apiRequest(`/groups/${groupId}/expenses/${expenseId}/payments`, {
            method: "POST",
            body: JSON.stringify(payload),
          }),
      },
    },
    markPaid: (groupId, userId, amount) =>
      apiRequest(`/groups/${groupId}/balances/${userId}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      }),
  },
};

