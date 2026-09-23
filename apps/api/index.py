import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "api"))

from fastapi import FastAPI
from app.main import app as core_app

app = FastAPI(title="FOCUS//WALL gateway", docs_url=None, redoc_url=None)
app.mount("/api", core_app)  # strips the /api prefix; your routes (/wall/today, /goals...) stay untouched
