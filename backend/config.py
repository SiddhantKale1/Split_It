import os

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")

    DB_HOST = os.environ.get("DB_HOST")
    DB_PORT = int(os.environ.get("DB_PORT", 3306))
    DB_USER = os.environ.get("DB_USER")
    DB_PASSWORD = os.environ.get("DB_PASSWORD")
    DB_NAME = os.environ.get("DB_NAME")

    # ✅ NEW — CORS origins fallback
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "None"

config = Config()
