import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.init_db import main as init_db
from app.routers import focus, goals, tasks, wall

try:  # contract-pass routers — optional so the app deploys either way
    from app.routers import opportunities, projects
    from app.routers import settings as settings_router
except ImportError:
    opportunities = projects = settings_router = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="FOCUS//WALL API", version="0.1.0", lifespan=lifespan,
    docs_url=None if os.getenv("VERCEL") else "/docs",
    redoc_url=None, openapi_url=None if os.getenv("VERCEL") else "/openapi.json",
)

_origins = getattr(settings, "allowed_origins", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def auth(x_app_token: str | None = Header(default=None)):
    if x_app_token != settings.app_token:
        raise HTTPException(401, "Invalid app token")


app.include_router(goals.router, dependencies=[Depends(auth)])
app.include_router(tasks.router, dependencies=[Depends(auth)])
app.include_router(wall.router, dependencies=[Depends(auth)])
app.include_router(focus.router, dependencies=[Depends(auth)])
for _r in (opportunities, projects, settings_router):
    if _r is not None:
        app.include_router(_r.router, dependencies=[Depends(auth)])
