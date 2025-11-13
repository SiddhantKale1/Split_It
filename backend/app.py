from __future__ import annotations

import math
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from functools import wraps
from typing import Any, Dict, List, Optional, Tuple

from flask import (
    Flask,
    jsonify,
    request,
    session,
    send_from_directory,
)
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from .config import config
    from .db import db
except ImportError:  # pragma: no cover - fallback for direct execution
    from config import config  # type: ignore
    from db import db  # type: ignore


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder="../frontend",
        static_url_path="",
    )
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["SESSION_COOKIE_NAME"] = config.SESSION_COOKIE_NAME
    app.config["SESSION_COOKIE_HTTPONLY"] = config.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = config.SESSION_COOKIE_SAMESITE

    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": config.CORS_ORIGINS}},
    )

    register_routes(app)
    return app


def require_login(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "authentication_required"}), 401
        return func(*args, **kwargs)

    return wrapper


def register_routes(app: Flask) -> None:
    @app.route("/", defaults={"path": "index.html"})
    @app.route("/<path:path>")
    def serve_frontend(path: str):
        return send_from_directory(app.static_folder, path)

    @app.post("/api/register")
    def register():
        payload = request.get_json(force=True)
        name = (payload.get("name") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        if not name or not email or not password:
            return jsonify({"error": "missing_fields"}), 400

        existing = db.fetch_one("SELECT id FROM users WHERE email=%s", (email,))
        if existing:
            return jsonify({"error": "email_in_use"}), 409

        password_hash = generate_password_hash(password)
        user_id = db.execute(
            "INSERT INTO users (name, email, password) VALUES (%s, %s, %s)",
            (name, email, password_hash),
        )

        session["user_id"] = user_id
        session["user_name"] = name

        return jsonify({"id": user_id, "name": name, "email": email})

    @app.post("/api/login")
    def login():
        payload = request.get_json(force=True)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        if not email or not password:
            return jsonify({"error": "missing_fields"}), 400

        user = db.fetch_one("SELECT id, name, password FROM users WHERE email=%s", (email,))
        if not user or not check_password_hash(user["password"], password):
            return jsonify({"error": "invalid_credentials"}), 401

        session["user_id"] = user["id"]
        session["user_name"] = user["name"]

        return jsonify({"id": user["id"], "name": user["name"], "email": email})

    @app.post("/api/logout")
    @require_login
    def logout():
        session.clear()
        return jsonify({"status": "ok"})

    @app.get("/api/session")
    def get_session():
        if "user_id" in session:
            return jsonify(
                {
                    "authenticated": True,
                    "user": {"id": session["user_id"], "name": session["user_name"]},
                }
            )
        return jsonify({"authenticated": False})

    @app.get("/api/groups")
    @require_login
    def list_groups():
        user_id = session["user_id"]
        groups = db.fetch_all(
            """
            SELECT g.id, g.group_name, u.name AS created_by_name
            FROM `groups` g
            JOIN users u ON g.created_by = u.id
            JOIN group_members gm ON gm.group_id = g.id
            WHERE gm.user_id = %s
            ORDER BY g.group_name
            """,
            (user_id,),
        )
        return jsonify(groups)

    @app.post("/api/groups")
    @require_login
    def create_group():
        payload = request.get_json(force=True)
        name = (payload.get("group_name") or "").strip()

        if not name:
            return jsonify({"error": "missing_group_name"}), 400

        user_id = session["user_id"]
        group_id = db.execute(
            "INSERT INTO `groups` (group_name, created_by) VALUES (%s, %s)",
            (name, user_id),
        )

        db.execute(
            "INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)",
            (group_id, user_id),
        )

        return jsonify({"id": group_id, "group_name": name, "created_by": user_id}), 201

    @app.post("/api/groups/<int:group_id>/join")
    @require_login
    def join_group(group_id: int):
        user_id = session["user_id"]

        existing = db.fetch_one(
            "SELECT id FROM group_members WHERE group_id=%s AND user_id=%s",
            (group_id, user_id),
        )
        if existing:
            return jsonify({"status": "already_joined"})

        group = db.fetch_one("SELECT id FROM `groups` WHERE id=%s", (group_id,))
        if not group:
            return jsonify({"error": "group_not_found"}), 404

        db.execute(
            "INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)",
            (group_id, user_id),
        )
        return jsonify({"status": "joined"})

    @app.get("/api/groups/<int:group_id>/members")
    @require_login
    def get_group_members(group_id: int):
        if not _user_in_group(session["user_id"], group_id):
            return jsonify({"error": "not_authorized"}), 403

        members = db.fetch_all(
            """
            SELECT u.id, u.name, u.email
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id=%s
            ORDER BY u.name
            """,
            (group_id,),
        )
        return jsonify(members)

    @app.get("/api/groups/<int:group_id>/expenses")
    @require_login
    def get_group_expenses(group_id: int):
        if not _user_in_group(session["user_id"], group_id):
            return jsonify({"error": "not_authorized"}), 403

        expenses = db.fetch_all(
            """
            SELECT e.id, e.title, e.amount, e.paid_by, e.date_added, u.name AS paid_by_name
            FROM expenses e
            JOIN users u ON e.paid_by = u.id
            WHERE e.group_id=%s
            ORDER BY e.date_added DESC
            """,
            (group_id,),
        )

        expense_ids = [exp["id"] for exp in expenses]
        shares_map: Dict[int, List[Dict[str, Any]]] = {}
        contributions_map: Dict[int, List[Dict[str, Any]]] = {}
        contributions_total_map: Dict[Tuple[int, int], Decimal] = {}
        payments_map: Dict[Tuple[int, int], Decimal] = {}

        if expense_ids:
            placeholders = ", ".join(["%s"] * len(expense_ids))
            shares = db.fetch_all(
                f"""
                SELECT es.expense_id, es.user_id, es.share_amount, u.name
                FROM expense_shares es
                JOIN users u ON es.user_id = u.id
                WHERE es.expense_id IN ({placeholders})
                """,
                expense_ids,
            )
            for share in shares:
                shares_map.setdefault(share["expense_id"], []).append(
                    {
                        "user_id": share["user_id"],
                        "name": share["name"],
                        "share_amount": float(share["share_amount"]),
                    }
                )

            contributions = db.fetch_all(
                f"""
                SELECT ec.expense_id, ec.user_id, ec.amount, u.name
                FROM expense_contributions ec
                JOIN users u ON ec.user_id = u.id
                WHERE ec.expense_id IN ({placeholders})
                """,
                expense_ids,
            )
            for contribution in contributions:
                amount_decimal = _to_decimal(contribution["amount"])
                contributions_total_map[(contribution["expense_id"], contribution["user_id"])] = (
                    contributions_total_map.get((contribution["expense_id"], contribution["user_id"]), Decimal("0.00"))
                    + amount_decimal
                )
                contributions_map.setdefault(contribution["expense_id"], []).append(
                    {
                        "user_id": contribution["user_id"],
                        "name": contribution["name"],
                        "amount": float(amount_decimal),
                    }
                )

            payments = db.fetch_all(
                f"""
                SELECT expense_id, user_id, SUM(amount) AS total_paid
                FROM expense_payments
                WHERE expense_id IN ({placeholders})
                GROUP BY expense_id, user_id
                """,
                expense_ids,
            )
            for payment in payments:
                payments_map[(payment["expense_id"], payment["user_id"])] = _to_decimal(
                    payment["total_paid"] or 0
                )

        for expense in expenses:
            expense_shares = shares_map.get(expense["id"], [])
            for share in expense_shares:
                share_amount_decimal = _to_decimal(share["share_amount"])
                paid_amount = payments_map.get((expense["id"], share["user_id"]), Decimal("0.00"))
                contribution_amount = contributions_total_map.get((expense["id"], share["user_id"]), Decimal("0.00"))
                total_credit = paid_amount + contribution_amount
                applied_credit = min(total_credit, share_amount_decimal)
                pending_amount = (share_amount_decimal - applied_credit).quantize(Decimal("0.01"))
                if pending_amount < Decimal("0.00"):
                    pending_amount = Decimal("0.00")
                share["paid_amount"] = float(applied_credit.quantize(Decimal("0.01")))
                share["pending_amount"] = float(pending_amount)
            expense["shares"] = expense_shares
            if expense["id"] in contributions_map:
                expense["contributions"] = contributions_map[expense["id"]]
            else:
                expense["contributions"] = [
                    {
                        "user_id": expense["paid_by"],
                        "name": expense["paid_by_name"],
                        "amount": float(expense["amount"]),
                    }
                ]
            expense["amount"] = float(expense["amount"])

        return jsonify(expenses)

    @app.post("/api/groups/<int:group_id>/expenses")
    @require_login
    def add_expense(group_id: int):
        payload = request.get_json(force=True) or {}
        title = (payload.get("title") or "").strip()
        amount = payload.get("amount")
        paid_by = payload.get("paid_by")
        split_among = payload.get("split_among") or []
        shares_payload = payload.get("shares")
        contributors_payload = payload.get("contributors") or []

        if not title or amount is None:
            return jsonify({"error": "missing_fields"}), 400

        if not isinstance(amount, (int, float, str, Decimal)):
            return jsonify({"error": "invalid_amount"}), 400

        amount_decimal = _to_decimal(amount)
        if amount_decimal <= 0:
            return jsonify({"error": "invalid_amount"}), 400

        if not _user_in_group(session["user_id"], group_id):
            return jsonify({"error": "not_authorized"}), 403

        shares: List[Tuple[int, Decimal]] = []
        if shares_payload:
            try:
                shares = _normalize_custom_shares(shares_payload, group_id)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
        else:
            if not split_among:
                return jsonify({"error": "missing_fields"}), 400
            if not all(_user_in_group(user_id, group_id) for user_id in split_among):
                return jsonify({"error": "invalid_split_members"}), 400
            shares = _calculate_equal_shares(amount_decimal, split_among)

        share_total = sum(share_amount for _, share_amount in shares)
        if not _amounts_close(share_total, amount_decimal):
            return jsonify({"error": "share_total_mismatch"}), 400

        contributions: List[Tuple[int, Decimal]] = []
        if contributors_payload:
            try:
                contributions = _normalize_contributions(contributors_payload, group_id)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
        else:
            if paid_by is None:
                paid_by = session["user_id"]
            if not _user_in_group(paid_by, group_id):
                return jsonify({"error": "payer_not_in_group"}), 400
            contributions = [(paid_by, amount_decimal)]

        contribution_total = sum(amount for _, amount in contributions)
        if not _amounts_close(contribution_total, amount_decimal):
            return jsonify({"error": "contribution_total_mismatch"}), 400

        primary_payer = contributions[0][0]

        expense_id = db.execute(
            """
            INSERT INTO expenses (group_id, title, amount, paid_by)
            VALUES (%s, %s, %s, %s)
            """,
            (group_id, title, str(amount_decimal), primary_payer),
        )

        for user_id, share_amount in shares:
            db.execute(
                """
                INSERT INTO expense_shares (expense_id, user_id, share_amount)
                VALUES (%s, %s, %s)
                """,
                (expense_id, user_id, str(share_amount)),
            )

        for user_id, amount_paid in contributions:
            db.execute(
                """
                INSERT INTO expense_contributions (expense_id, user_id, amount)
                VALUES (%s, %s, %s)
                """,
                (expense_id, user_id, str(amount_paid)),
            )

        return jsonify({"id": expense_id}), 201

    @app.delete("/api/groups/<int:group_id>/expenses/<int:expense_id>")
    @require_login
    def delete_expense(group_id: int, expense_id: int):
        # Only allow deletion if user is in group
        if not _user_in_group(session["user_id"], group_id):
            return jsonify({"error": "not_authorized"}), 403

        expense = db.fetch_one(
            "SELECT id, paid_by FROM expenses WHERE id=%s AND group_id=%s",
            (expense_id, group_id),
        )
        if not expense:
            return jsonify({"error": "expense_not_found"}), 404

        # Only the user who paid the expense may delete it
        if expense["paid_by"] != session.get("user_id"):
            return jsonify({"error": "forbidden_only_payer_can_delete"}), 403

        # Delete related rows: payments, contributions, shares, then expense
        db.execute("DELETE FROM expense_payments WHERE expense_id=%s", (expense_id,))
        db.execute("DELETE FROM expense_contributions WHERE expense_id=%s", (expense_id,))
        db.execute("DELETE FROM expense_shares WHERE expense_id=%s", (expense_id,))
        db.execute("DELETE FROM expenses WHERE id=%s", (expense_id,))

        return jsonify({"status": "deleted"}), 200

    @app.get("/api/groups/<int:group_id>/balances")
    @require_login
    def get_group_balances(group_id: int):
        if not _user_in_group(session["user_id"], group_id):
            return jsonify({"error": "not_authorized"}), 403

        members = db.fetch_all(
            """
            SELECT u.id, u.name
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id=%s
            """,
            (group_id,),
        )

        contributions = db.fetch_all(
            """
            SELECT ec.user_id, SUM(ec.amount) AS total_paid
            FROM expense_contributions ec
            JOIN expenses e ON ec.expense_id = e.id
            WHERE e.group_id=%s
            GROUP BY ec.user_id
            """,
            (group_id,),
        )
        if not contributions:
            contributions = db.fetch_all(
                """
                SELECT paid_by AS user_id, SUM(amount) AS total_paid
                FROM expenses
                WHERE group_id=%s
                GROUP BY paid_by
                """,
                (group_id,),
            )

        owed = db.fetch_all(
            """
            SELECT user_id, SUM(share_amount) AS total_owed
            FROM expense_shares es
            JOIN expenses e ON es.expense_id = e.id
            WHERE e.group_id=%s
            GROUP BY user_id
            """,
            (group_id,),
        )

        contrib_map = {row["user_id"]: _to_decimal(row["total_paid"] or 0) for row in contributions}
        owed_map = {row["user_id"]: _to_decimal(row["total_owed"] or 0) for row in owed}

        share_credit_rows = db.fetch_all(
            """
            SELECT es.user_id,
                   es.share_amount,
                   COALESCE(pay.amount, 0) AS payments_amount,
                   COALESCE(contrib.amount, 0) AS contributions_amount
            FROM expense_shares es
            JOIN expenses e ON es.expense_id = e.id
            LEFT JOIN (
                SELECT expense_id, user_id, SUM(amount) AS amount
                FROM expense_payments
                GROUP BY expense_id, user_id
            ) pay ON pay.expense_id = es.expense_id AND pay.user_id = es.user_id
            LEFT JOIN (
                SELECT expense_id, user_id, SUM(amount) AS amount
                FROM expense_contributions
                GROUP BY expense_id, user_id
            ) contrib ON contrib.expense_id = es.expense_id AND contrib.user_id = es.user_id
            WHERE e.group_id=%s
            """,
            (group_id,),
        )

        share_credit_map: Dict[int, Decimal] = {}
        for row in share_credit_rows:
            user_id = row["user_id"]
            share_amount = _to_decimal(row["share_amount"])
            payments_amount = _to_decimal(row["payments_amount"] or 0)
            contributions_amount = _to_decimal(row["contributions_amount"] or 0)
            total_credit = min(share_amount, payments_amount + contributions_amount)
            share_credit_map[user_id] = share_credit_map.get(user_id, Decimal("0.00")) + total_credit

        balances = []
        for member in members:
            user_id = member["id"]
            net_amount = contrib_map.get(user_id, Decimal("0.00")) - owed_map.get(user_id, Decimal("0.00"))
            balances.append(
                {
                    "user_id": user_id,
                    "name": member["name"],
                    "net_balance": float(net_amount.quantize(Decimal("0.01"))),
                }
            )

        for balance in balances:
            user_id = balance["user_id"]
            paid_towards_shares = share_credit_map.get(user_id, Decimal("0.00"))
            balance["paid_towards_shares"] = float(paid_towards_shares.quantize(Decimal("0.01")))
            balance["pending_amount"] = float(
                max(Decimal("0.00"), owed_map.get(user_id, Decimal("0.00")) - paid_towards_shares).quantize(Decimal("0.01"))
            )

        settlements = _simplify_debts(balances)
        return jsonify({"balances": balances, "settlements": settlements})

    @app.post("/api/groups/<int:group_id>/expenses/<int:expense_id>/payments")
    @require_login
    def record_payment(group_id: int, expense_id: int):
        if not _user_in_group(session["user_id"], group_id):
            return jsonify({"error": "not_authorized"}), 403

        expense = db.fetch_one(
            "SELECT id, group_id FROM expenses WHERE id=%s AND group_id=%s",
            (expense_id, group_id),
        )
        if not expense:
            return jsonify({"error": "expense_not_found"}), 404

        payload = request.get_json(force=True) or {}
        user_id = payload.get("user_id")
        amount = payload.get("amount")

        if user_id is None or amount is None:
            return jsonify({"error": "missing_fields"}), 400

        if not _user_in_group(user_id, group_id):
            return jsonify({"error": "user_not_in_group"}), 400

        # Only allow the authenticated user to record a payment for themselves
        if session.get("user_id") != user_id:
            return jsonify({"error": "forbidden_only_self_can_pay"}), 403

        amount_decimal = _to_decimal(amount)
        if amount_decimal <= 0:
            return jsonify({"error": "invalid_amount"}), 400

        share = db.fetch_one(
            "SELECT share_amount FROM expense_shares WHERE expense_id=%s AND user_id=%s",
            (expense_id, user_id),
        )
        if not share:
            return jsonify({"error": "user_not_in_expense"}), 400

        existing_payments = db.fetch_one(
            "SELECT SUM(amount) AS total_paid FROM expense_payments WHERE expense_id=%s AND user_id=%s",
            (expense_id, user_id),
        )
        existing_contributions = db.fetch_one(
            "SELECT SUM(amount) AS total_contributed FROM expense_contributions WHERE expense_id=%s AND user_id=%s",
            (expense_id, user_id),
        )
        total_paid = _to_decimal(existing_payments["total_paid"] or 0) if existing_payments else Decimal("0.00")
        total_contributed = (
            _to_decimal(existing_contributions["total_contributed"] or 0) if existing_contributions else Decimal("0.00")
        )
        share_amount = _to_decimal(share["share_amount"])
        total_credit = min(share_amount, total_paid + total_contributed)
        remaining = share_amount - total_credit

        if remaining <= Decimal("0.00"):
            return jsonify({"error": "share_already_settled"}), 400

        if amount_decimal > remaining:
            return jsonify({"error": "amount_exceeds_remaining", "remaining": float(remaining)}), 400

        payment_id = db.execute(
            "INSERT INTO expense_payments (expense_id, user_id, amount) VALUES (%s, %s, %s)",
            (expense_id, user_id, str(amount_decimal)),
        )

        return jsonify({"id": payment_id, "amount": float(amount_decimal)}), 201

    @app.post("/api/groups/<int:group_id>/balances/<int:user_id>/mark-paid")
    @require_login
    def mark_balance_paid(group_id: int, user_id: int):
        if not _user_in_group(session["user_id"], group_id):
            return jsonify({"error": "not_authorized"}), 403

        if not _user_in_group(user_id, group_id):
            return jsonify({"error": "user_not_in_group"}), 400

        # Only the user themselves may mark their pending balances as paid
        if session.get("user_id") != user_id:
            return jsonify({"error": "forbidden_only_self_can_mark_paid"}), 403

        payload = request.get_json(force=True) or {}
        amount = payload.get("amount")

        share_rows = db.fetch_all(
            """
            SELECT es.expense_id,
                   es.share_amount,
                   COALESCE(pay.amount, 0) AS payments_amount,
                   COALESCE(contrib.amount, 0) AS contributions_amount
            FROM expense_shares es
            JOIN expenses e ON es.expense_id = e.id
            LEFT JOIN (
                SELECT expense_id, user_id, SUM(amount) AS amount
                FROM expense_payments
                GROUP BY expense_id, user_id
            ) pay ON pay.expense_id = es.expense_id AND pay.user_id = es.user_id
            LEFT JOIN (
                SELECT expense_id, user_id, SUM(amount) AS amount
                FROM expense_contributions
                GROUP BY expense_id, user_id
            ) contrib ON contrib.expense_id = es.expense_id AND contrib.user_id = es.user_id
            WHERE e.group_id=%s AND es.user_id=%s
            ORDER BY es.expense_id
            """,
            (group_id, user_id),
        )

        pending_rows: List[Dict[str, Any]] = []
        total_pending = Decimal("0.00")
        for row in share_rows:
            share_amount = _to_decimal(row["share_amount"])
            payments_amount = _to_decimal(row["payments_amount"] or 0)
            contributions_amount = _to_decimal(row["contributions_amount"] or 0)
            total_credit = min(share_amount, payments_amount + contributions_amount)
            pending = share_amount - total_credit
            if pending > Decimal("0.00"):
                pending_rows.append(
                    {
                        "expense_id": row["expense_id"],
                        "pending": pending,
                    }
                )
                total_pending += pending

        if amount is None:
            amount_decimal = total_pending.quantize(Decimal("0.01"))
        else:
            amount_decimal = _to_decimal(amount)

        if amount_decimal <= Decimal("0.00"):
            return jsonify({"error": "nothing_pending"}), 400

        remaining = amount_decimal
        payments_created = []

        for row in pending_rows:
            if remaining <= Decimal("0.00"):
                break

            expense_id = row["expense_id"]
            pending = row["pending"]
            payment_amount = min(remaining, pending)

            if payment_amount > Decimal("0.00"):
                payment_id = db.execute(
                    "INSERT INTO expense_payments (expense_id, user_id, amount) VALUES (%s, %s, %s)",
                    (expense_id, user_id, str(payment_amount)),
                )
                payments_created.append({"id": payment_id, "expense_id": expense_id, "amount": float(payment_amount)})
                remaining -= payment_amount

        return jsonify({"payments": payments_created, "total": float(amount_decimal - remaining)}), 201


def _user_in_group(user_id: int, group_id: int) -> bool:
    record = db.fetch_one(
        "SELECT id FROM group_members WHERE group_id=%s AND user_id=%s",
        (group_id, user_id),
    )
    return record is not None


def _to_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value.quantize(Decimal("0.01"))
    if isinstance(value, (int, float)):
        return Decimal(str(value)).quantize(Decimal("0.01"))
    if isinstance(value, str):
        return Decimal(value).quantize(Decimal("0.01"))
    raise ValueError("Cannot convert value to Decimal")


def _calculate_equal_shares(amount: Decimal, user_ids: List[int]) -> List[Tuple[int, Decimal]]:
    count = len(user_ids)
    if count == 0:
        raise ValueError("user_ids must not be empty")

    per_person = (amount / count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    shares: List[Tuple[int, Decimal]] = []
    total_assigned = Decimal("0.00")

    for user_id in user_ids[:-1]:
        shares.append((user_id, per_person))
        total_assigned += per_person

    last_share = (amount - total_assigned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    shares.append((user_ids[-1], last_share))

    return shares


def _normalize_custom_shares(payload: List[Dict[str, Any]], group_id: int) -> List[Tuple[int, Decimal]]:
    shares: List[Tuple[int, Decimal]] = []
    seen = set()
    for item in payload:
        try:
            user_id = int(item["user_id"])
            share_amount = _to_decimal(item["share_amount"])
        except (KeyError, TypeError, ValueError, InvalidOperation):
            raise ValueError("invalid_share_payload") from None

        if share_amount <= 0:
            raise ValueError("invalid_share_amount")
        if user_id in seen:
            raise ValueError("duplicate_share_entry")
        if not _user_in_group(user_id, group_id):
            raise ValueError("invalid_split_members")

        seen.add(user_id)
        shares.append((user_id, share_amount))
    return shares


def _normalize_contributions(payload: List[Dict[str, Any]], group_id: int) -> List[Tuple[int, Decimal]]:
    contributions: List[Tuple[int, Decimal]] = []
    seen = set()
    for item in payload:
        amount_value = item.get("amount_paid", item.get("amount"))
        try:
            user_id = int(item["user_id"])
            amount_decimal = _to_decimal(amount_value)
        except (KeyError, TypeError, ValueError, InvalidOperation):
            raise ValueError("invalid_contribution_payload") from None

        if amount_decimal <= 0:
            raise ValueError("invalid_contribution_amount")
        if user_id in seen:
            raise ValueError("duplicate_contribution_entry")
        if not _user_in_group(user_id, group_id):
            raise ValueError("invalid_contribution_member")

        seen.add(user_id)
        contributions.append((user_id, amount_decimal))
    return contributions


def _simplify_debts(balances: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    debtors = []
    creditors = []

    for balance in balances:
        amount = Decimal(str(balance["net_balance"])).quantize(Decimal("0.01"))
        if amount > 0:
            creditors.append({"user_id": balance["user_id"], "name": balance["name"], "amount": amount})
        elif amount < 0:
            debtors.append({"user_id": balance["user_id"], "name": balance["name"], "amount": -amount})

    settlements: List[Dict[str, Any]] = []

    debtor_idx = 0
    creditor_idx = 0

    while debtor_idx < len(debtors) and creditor_idx < len(creditors):
        debtor = debtors[debtor_idx]
        creditor = creditors[creditor_idx]

        settled_amount = min(debtor["amount"], creditor["amount"])
        if settled_amount > Decimal("0.00"):
            settlements.append(
                {
                    "from_user_id": debtor["user_id"],
                    "from_name": debtor["name"],
                    "to_user_id": creditor["user_id"],
                    "to_name": creditor["name"],
                    "amount": float(settled_amount.quantize(Decimal("0.01"))),
                }
            )

        debtor["amount"] -= settled_amount
        creditor["amount"] -= settled_amount

        if debtor["amount"] <= Decimal("0.00"):
            debtor_idx += 1
        if creditor["amount"] <= Decimal("0.00"):
            creditor_idx += 1

    return settlements


def _amounts_close(a: Decimal, b: Decimal, tolerance: Decimal = Decimal("0.01")) -> bool:
    return abs(a - b) <= tolerance


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)

