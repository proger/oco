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


if __name__ == '__main__':
    import uvicorn
    uvicorn.run("oco.app:app", host="0.0.0.0", log_level="info", reload=True, reload_dirs=[Path(__file__).parent])
