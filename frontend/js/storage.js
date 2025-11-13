const STORAGE_KEY = "splitit-expense-draft";

export function saveDraft(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, updatedAt: Date.now() }));
  } catch (error) {
    console.warn("Unable to save draft", error);
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).data;
  } catch (error) {
    console.warn("Unable to load draft", error);
    return null;
  }
}

export function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

