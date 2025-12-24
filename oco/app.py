from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import oco.index
import oco.ix

app = FastAPI(
    title="Use Oco to peek at your files",
)

app.include_router(oco.index.router)
app.include_router(oco.ix.router)
app.mount("/static",
          StaticFiles(directory=Path(__file__).parent / "static"),
          name="static")
