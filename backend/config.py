import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Secret key
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")

    # SESSION / COOKIE CONFIG  (these were missing → caused your crash)
    SESSION_COOKIE_NAME = "hostelsplit_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Database config (defaults allow local run without crashing)
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = int(os.environ.get("DB_PORT", 3306))
    DB_USER = os.environ.get("DB_USER", "root")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
    DB_NAME = os.environ.get("DB_NAME", "hostelsplit")

config = Config()
