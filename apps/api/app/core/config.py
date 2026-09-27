from datetime import date, datetime, timedelta, timezone

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://focus:focus@localhost:5432/focuswall"
    app_token: str = "change-this-local-token"
    allowed_origins: str = "http://localhost:5173"  # comma-separated
    tz_offset_hours: float = 1.0  # WAT

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()


def local_today() -> date:
    """Today's date in the user's timezone — streak days must not lie."""
    tz = timezone(timedelta(hours=settings.tz_offset_hours))
    return datetime.now(tz).date()
