from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.init_db import main as init_db
from app.routers import focus, goals, tasks, wall


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="FOCUS//WALL API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.get("/health")
async def health():
    return {"status": "ok"}
