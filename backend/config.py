"""Application configuration loaded from environment / backend/.env."""
from pydantic_settings import BaseSettings, SettingsConfigDict

# Shared upstream base URLs (used by both the news and market-data layers, so
# they live here rather than being duplicated per module).
FINNHUB_BASE = "https://finnhub.io/api/v1"


class Settings(BaseSettings):
    DATABASE_URL: str
    OPENROUTER_API_KEY: str
    COINGECKO_API_KEY: str = ""
    FINNHUB_API_KEY: str = ""
    FMP_API_KEY: str = ""
    APP_ENV: str = "development"

    # Hard ceiling on fresh LLM scorings per UTC day. On-visit scoring is an
    # unbounded cost vector on a public URL (~$0.008 each); past this, requests
    # serve the last stored score as stale instead of paying for a new call.
    # Cache hits and no-news placeholders don't count toward it.
    SCORING_DAILY_CAP: int = 300

    # Comma-separated list of browser origins allowed to call the API (CORS).
    # Local dev defaults; set this to the deployed frontend URL(s) in prod.
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        """ALLOWED_ORIGINS parsed into a clean list for the CORS middleware."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        """SQLAlchemy async driver URL.

        The spec stores a plain ``postgresql://`` URL (what Railway provides).
        SQLAlchemy's async engine needs the ``+asyncpg`` driver, so normalize it
        here rather than forcing the operator to rewrite the env var.
        """
        url = self.DATABASE_URL
        if url.startswith("postgresql+asyncpg://"):
            return url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
