class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")

    DB_HOST = os.environ.get("DB_HOST")
    DB_PORT = int(os.environ.get("DB_PORT", 3306))
    DB_USER = os.environ.get("DB_USER")
    DB_PASSWORD = os.environ.get("DB_PASSWORD")
    DB_NAME = os.environ.get("DB_NAME")

    # CORS
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

    # Session / Cookies (🔥 REQUIRED for login)
    SESSION_COOKIE_NAME = os.environ.get("SESSION_COOKIE_NAME", "session")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "None"
config = Config()
