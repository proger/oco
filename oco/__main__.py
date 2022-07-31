from pathlib import Path
import uvicorn  # type: ignore

uvicorn.run("oco.app:app", host="0.0.0.0", log_level="info",
            reload=True, reload_dirs=[Path(__file__).parent])
