import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.init_db import main as init_db
from app.routers import (
    focus, goals, logs, opportunities, quick_capture, radar, tasks, wall,
)
from app.routers import auth as auth_router
from app.routers import maintenance
from app.routers import settings as settings_router
from app.routers.auth import verify_session


def _optional_router(module_name: str):
    try:
        mod = __import__(f"app.routers.{module_name}", fromlist=["router"])
        return getattr(mod, "router", None)
    except ModuleNotFoundError as e:
        if module_name in str(e):
            return None
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


_vercel = os.getenv("VERCEL") is not None
app = FastAPI(
    title="FOCUS//WALL API",
    version="0.3.0",
    lifespan=lifespan,
    docs_url=None if _vercel else "/docs",
    redoc_url=None,
    openapi_url=None if _vercel else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def auth(x_app_token: str | None = Header(default=None)):
    # Password mode: only server-issued session tokens are accepted.
    if os.getenv("AUTH_PASSWORD"):
        if verify_session(x_app_token):
            return
        raise HTTPException(401, "Sign in again")
    # Legacy mode (no AUTH_PASSWORD set): static app token still works so nothing locks out.
    if settings.app_token and x_app_token == settings.app_token:
        return
    raise HTTPException(401, "Invalid app token")


app.include_router(auth_router.router)  # the login gate itself stays open
app.include_router(goals.router, dependencies=[Depends(auth)])
app.include_router(tasks.router, dependencies=[Depends(auth)])
app.include_router(wall.router, dependencies=[Depends(auth)])
app.include_router(focus.router, dependencies=[Depends(auth)])
app.include_router(opportunities.router, dependencies=[Depends(auth)])
app.include_router(radar.router, dependencies=[Depends(auth)])
app.include_router(logs.router, dependencies=[Depends(auth)])
app.include_router(settings_router.router, dependencies=[Depends(auth)])
app.include_router(quick_capture.router, dependencies=[Depends(auth)])
app.include_router(maintenance.router, dependencies=[Depends(auth)])
for _name in ("projects", "health"):
    _r = _optional_router(_name)
    if _r is not None:
        app.include_router(_r, dependencies=[Depends(auth)])
