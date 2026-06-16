import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

CANVASES_DIR = Path(__file__).parent / "canvases"
CANVASES_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "PUT"],
    allow_headers=["Content-Type"],
)


def safe_path(name: str) -> Path:
    filename = Path(name).name
    if not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json files allowed")
    return CANVASES_DIR / filename


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/file")
def get_file(name: str):
    path = safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return json.loads(path.read_text())


@app.put("/api/file")
async def put_file(name: str, request: Request):
    path = safe_path(name)
    path.write_bytes(await request.body())
    return {"ok": True}
