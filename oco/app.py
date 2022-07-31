from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import oco.index
import oco.wavesurfer

app = FastAPI(
    title="Use Oco to peek at your files",
)

app.include_router(oco.index.router)
app.include_router(oco.wavesurfer.router)
app.mount("/static",
          StaticFiles(directory=Path(__file__).parent / "static"),
          name="static")
