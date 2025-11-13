# Split It

Split It is a lightweight Splitwise-style web application targeted at roommates and small groups. It helps teams manage shared groups, record expenses, and understand who owes whom with clear balances.

## Tech stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Python (Flask)
- **Database:** MySQL

## Features

- Session-based authentication (register, login, logout)
- Group creation, join by ID, and member listing
- Expense tracking with flexible split calculation (equal or custom amounts)
- Capture multiple payers per expense with contribution tracking
- Real-time balances and simplified settlements
- Responsive UI with local storage expense draft backup

## Project structure

```
frontend/
  index.html
  dashboard.html
  group.html
  add_expense.html
  css/styles.css
  js/
    api.js
    auth.js
    dashboard.js
    group.js
    expense.js
    storage.js
backend/
  app.py
  config.py
  db.py
  requirements.txt
database/
  schema.sql
```

## Prerequisites

- Python 3.11+
- MySQL 8+

## Setup

1. **Create and seed the database**

   ```bash
   mysql -u root -p < database/schema.sql
   ```

   Update the connection values if you use a different user/password or database name. Re-run this script whenever the schema changes so newly added tables (such as `expense_contributions`) are created.

2. **Configure environment variables**

   Create a `.env` file in `backend/` or export the following variables:

      - `HOSTELSPLIT_SECRET_KEY` – Flask session secret (use a random string).
      - `HOSTELSPLIT_DB_HOST` – default `localhost`.
      - `HOSTELSPLIT_DB_PORT` – default `3306`.
      - `HOSTELSPLIT_DB_USER` – default `root`.
      - `HOSTELSPLIT_DB_PASSWORD` – default `password`.
      - `HOSTELSPLIT_DB_NAME` – default `hostelsplit`.
      - `HOSTELSPLIT_CORS_ORIGINS` – comma separated list of allowed origins for API requests. Use `http://localhost:5000` when serving frontend via Flask.

   To load variables from `.env`, run the server with `python -m flask` or use a shell that sources the file.

3. **Install backend dependencies**

   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. **Run the development server**

   ```bash
   python -m backend.app
   ```

   The Flask server hosts the API at `http://127.0.0.1:5000/api/*` and serves the static frontend from the `frontend/` directory.

5. **Open the app**

   Navigate to `http://127.0.0.1:5000/` in your browser. Register a new account, create or join a group, and start adding expenses.

## Local storage backup

When filling the expense form, your input is saved to local storage so you can leave the page and come back without losing progress. Use the “Restore draft” button on `add_expense.html` to reapply the last saved draft.

## Future enhancements

- Edit/delete expenses
- Search and filter expenses
- Visual charts using Chart.js
- Progressive Web App (PWA) support for a better mobile experience

## Testing tips

- Create at least two user accounts to observe balance calculations.
- Use distinct browsers (or incognito windows) to simulate different users.
- Start with small amounts to verify the splitting and settlements.

