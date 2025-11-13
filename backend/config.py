import os


class Config:
    SECRET_KEY = os.environ.get("HOSTELSPLIT_SECRET_KEY", "dev-secret-key")
    SESSION_COOKIE_NAME = "hostelsplit_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    DB_HOST = os.environ.get("HOSTELSPLIT_DB_HOST", "localhost")
    DB_PORT = int(os.environ.get("HOSTELSPLIT_DB_PORT", "3306"))
    DB_USER = os.environ.get("HOSTELSPLIT_DB_USER", "root")
    DB_PASSWORD = os.environ.get("HOSTELSPLIT_DB_PASSWORD", "root")
    DB_NAME = os.environ.get("HOSTELSPLIT_DB_NAME", "hostelsplit")

    CORS_ORIGINS = os.environ.get("HOSTELSPLIT_CORS_ORIGINS", "*").split(",")


config = Config()

