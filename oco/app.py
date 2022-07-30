from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(
    title="Use Oco to peek at your files",
)

import oco.index
app.include_router(oco.index.router)

import oco.wavesurfer
app.include_router(oco.wavesurfer.router)

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")