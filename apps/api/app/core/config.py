from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://focus:focus@localhost:5432/focuswall"
    app_token: str = "change-this-local-token"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
