from contextlib import contextmanager
from typing import Any, Dict, Iterable, Optional

import mysql.connector
from mysql.connector import pooling

from .config import config


class Database:
    def __init__(self) -> None:
        self.pool = pooling.MySQLConnectionPool(
            pool_name="hostelsplit_pool",
            pool_size=10,
            host=config.DB_HOST,
            port=config.DB_PORT,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            database=config.DB_NAME,
            auth_plugin="mysql_native_password",
        )

    @contextmanager
    def connection(self):
        conn = self.pool.get_connection()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def cursor(self, dictionary: bool = True):
        with self.connection() as conn:
            cursor = conn.cursor(dictionary=dictionary)
            try:
                yield cursor
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                cursor.close()

    def fetch_one(self, query: str, params: Optional[Iterable[Any]] = None) -> Optional[Dict[str, Any]]:
        with self.cursor() as cursor:
            cursor.execute(query, params or ())
            return cursor.fetchone()

    def fetch_all(self, query: str, params: Optional[Iterable[Any]] = None) -> Iterable[Dict[str, Any]]:
        with self.cursor() as cursor:
            cursor.execute(query, params or ())
            return cursor.fetchall()

    def execute(self, query: str, params: Optional[Iterable[Any]] = None) -> int:
        with self.cursor() as cursor:
            cursor.execute(query, params or ())
            return cursor.lastrowid


db = Database()

