import hashlib
import hmac
import os
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days


class LoginIn(BaseModel):
    password: str


def _password() -> str | None:
    return os.getenv("AUTH_PASSWORD") or None


def _session_key() -> str:
    return os.getenv("AUTH_SECRET") or os.getenv("AUTH_PASSWORD") or ""


def verify_session(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    exp_part, sig = token.split(".", 1)
    if not exp_part.isdigit() or int(exp_part) < time.time():
        return False
    key = _session_key()
    if not key:
        return False
    expected = hmac.new(key.encode(), exp_part.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


@router.post("/login")
async def login(body: LoginIn):
    pw = _password()
    if not pw:
        raise HTTPException(status_code=503, detail="AUTH_PASSWORD not configured on the server")
    if not hmac.compare_digest(body.password.encode(), pw.encode()):
        time.sleep(0.3)  # blunt brute force
        raise HTTPException(status_code=401, detail="Wrong password")
    exp = int(time.time()) + TOKEN_TTL_SECONDS
    sig = hmac.new(_session_key().encode(), str(exp).encode(), hashlib.sha256).hexdigest()
    return {"token": f"{exp}.{sig}"}
