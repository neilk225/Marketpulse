"""Application configuration loaded from environment / backend/.env."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    OPENROUTER_API_KEY: str
    COINGECKO_API_KEY: str = ""
    FINNHUB_API_KEY: str = ""
    FMP_API_KEY: str = ""
    APP_ENV: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

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
