"""
Servidor do Baixador (Libano).

Recebe um link de vídeo (YouTube ou qualquer site que o yt-dlp suporte), mostra as opções
disponíveis (MP4 em várias resoluções, MP3 em vários bitrates) e prepara o arquivo para baixar.

Rodar:  uvicorn app:app --host 0.0.0.0 --port 8000
Precisa do ffmpeg instalado (juntar vídeo+áudio e converter para MP3).
Veja o README.md desta pasta.
"""
import hmac
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

import yt_dlp
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

API_KEY = os.environ.get("API_KEY", "")                       # chave que o app envia (X-Api-Key). Vazia = sem chave.
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
MAX_MINUTES = int(os.environ.get("MAX_DURATION_MIN", "180"))  # limite de duração por vídeo
MAX_PARALLEL = int(os.environ.get("MAX_PARALLEL", "2"))       # downloads ao mesmo tempo
COOKIES_FILE = os.environ.get("COOKIES_FILE", "")             # cookies.txt (opcional, ajuda quando o YouTube pede login)
WORK_DIR = Path(os.environ.get("WORK_DIR", tempfile.gettempdir())) / "libano-baixador"
JOB_TTL = float(os.environ.get("JOB_TTL_MIN", "30")) * 60       # arquivos prontos ficam disponíveis por este tempo

WORK_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Libano Baixador")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])
slots = threading.Semaphore(MAX_PARALLEL)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, __: RequestValidationError):
    # A tela espera "detail" sempre como texto simples.
    return JSONResponse({"detail": "Pedido inválido: confira o link e as opções escolhidas."}, status_code=422)


def check_key(key: Optional[str]):
    if API_KEY and not hmac.compare_digest(key or "", API_KEY):
        raise HTTPException(401, "Chave do servidor incorreta.")


def check_url(url: str) -> str:
    url = (url or "").strip()
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(422, "Cole um link que comece com http:// ou https://")
    return url


def base_opts() -> dict:
    o = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 20}
    if COOKIES_FILE and Path(COOKIES_FILE).exists():
        o["cookiefile"] = COOKIES_FILE
    return o


def friendly_error(e: Exception) -> str:
    msg = re.sub(r"\x1b\[[0-9;]*m", "", str(e)).replace("ERROR: ", "").strip()
    low = msg.lower()
    if "sign in" in low or "confirm you" in low or "cookies" in low:
        return "O site pediu login/verificação para liberar esse vídeo. Veja a seção de cookies no README do servidor."
    if "private" in low:
        return "Esse vídeo é privado."
    if "http error 404" in low or "404" in low and "not found" in low:
        return "Não encontrei nada nesse link (erro 404). Confira se o endereço está certo."
    if "http error 403" in low or "http error 401" in low:
        return "O site não deixou acessar esse link (erro 403). Pode ser um vídeo restrito."
    if "unable to download webpage" in low or "urlopen error" in low or "timed out" in low or "name or service" in low:
        return "Não consegui abrir esse link. Confira o endereço e a conexão do servidor."
    if "unsupported url" in low:
        return "Esse link não é de um vídeo que eu consiga baixar."
    if "unavailable" in low or "not available" in low:
        return "Esse vídeo não está disponível."
    return msg[:300] or "Não consegui ler esse link."


# ---------- informações do vídeo ----------
@app.get("/health")
def health():
    return {"ok": True, "yt_dlp": yt_dlp.version.__version__}


@app.get("/api/info")
def info(url: str = Query(...), x_api_key: Optional[str] = Header(None)):
    check_key(x_api_key)
    url = check_url(url)
    try:
        with yt_dlp.YoutubeDL({**base_opts(), "skip_download": True}) as ydl:
            d = ydl.extract_info(url, download=False)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, friendly_error(e))
    if d.get("_type") == "playlist" and d.get("entries"):
        d = next((x for x in d["entries"] if x), d)
    if d.get("is_live"):
        raise HTTPException(422, "Transmissões ao vivo não podem ser baixadas.")

    formats = d.get("formats") or []
    has_video = [f for f in formats if f.get("vcodec") not in (None, "none")]
    audio = [f for f in formats if f.get("acodec") not in (None, "none") and f.get("vcodec") in (None, "none")]
    best_audio_size = max([f.get("filesize") or f.get("filesize_approx") or 0 for f in audio] or [0])

    sizes = {}
    for f in has_video:
        h = f.get("height")
        if not h:
            continue
        size = (f.get("filesize") or f.get("filesize_approx") or 0)
        if f.get("acodec") in (None, "none"):
            size += best_audio_size
        sizes[h] = max(sizes.get(h, 0), size)
    heights = [{"height": h, "size": sizes[h] or None} for h in sorted(sizes, reverse=True)]

    return {
        "title": d.get("title") or "Vídeo",
        "uploader": d.get("uploader") or d.get("channel") or "",
        "duration": d.get("duration"),
        "thumbnail": d.get("thumbnail"),
        "site": d.get("extractor_key") or "",
        "url": d.get("webpage_url") or url,
        "hasVideo": bool(has_video) or bool(d.get("ext") in ("mp4", "webm", "mov", "mkv")),
        "heights": heights,
        "tooLong": bool(d.get("duration") and d["duration"] > MAX_MINUTES * 60),
        "maxMinutes": MAX_MINUTES,
    }


# ---------- downloads ----------
class JobIn(BaseModel):
    url: str
    kind: str = "mp4"                 # "mp4" ou "mp3"
    height: Optional[int] = None      # só para mp4; None = melhor qualidade
    bitrate: int = 192                # só para mp3 (kbps)


JOBS: dict = {}
LOCK = threading.Lock()


def run_job(job: dict, body: JobIn):
    with slots:
        job["status"] = "downloading"
        out_dir = WORK_DIR / job["id"]
        out_dir.mkdir(parents=True, exist_ok=True)

        def hook(d):
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                done = d.get("downloaded_bytes") or 0
                pct = (done / total) if total else 0
                streams = len((d.get("info_dict") or {}).get("requested_formats") or []) or 1
                fname = d.get("filename")
                if fname != job.get("_last_file"):
                    if job.get("_last_file"):
                        job["_stage"] += 1
                    job["_last_file"] = fname
                stage = min(job["_stage"], streams - 1)
                job["progress"] = max(job["progress"], round(((stage + pct) / streams) * 92, 1))
                job["speed"] = d.get("speed")
                job["eta"] = d.get("eta")
            elif d.get("status") == "finished":
                job["speed"] = None

        def pp_hook(d):
            if d.get("status") == "started":
                job["status"] = "processing"
                job["progress"] = max(job["progress"], 95)

        opts = {
            **base_opts(),
            "outtmpl": str(out_dir / "%(title).150B.%(ext)s"),
            "windowsfilenames": True,
            "progress_hooks": [hook],
            "postprocessor_hooks": [pp_hook],
            "concurrent_fragment_downloads": 4,
            "match_filter": yt_dlp.utils.match_filter_func(f"duration <=? {MAX_MINUTES * 60}"),
        }
        if body.kind == "mp3":
            opts["format"] = "bestaudio/best"
            opts["postprocessors"] = [
                {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": str(body.bitrate)},
                {"key": "FFmpegMetadata"},
            ]
        else:
            h = body.height
            if h:
                opts["format"] = f"bv*[height<={h}][ext=mp4]+ba[ext=m4a]/bv*[height<={h}]+ba/b[height<={h}]/b"
            else:
                opts["format"] = "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b"
            opts["merge_output_format"] = "mp4"

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([body.url])
            files = [p for p in out_dir.iterdir() if p.is_file() and p.suffix not in (".part", ".ytdl", ".temp")]
            if not files:
                raise RuntimeError(f"Vídeo maior que o limite de {MAX_MINUTES} minutos ou indisponível.")
            f = max(files, key=lambda p: p.stat().st_size)
            job.update(status="done", progress=100, path=str(f), filename=f.name, size=f.stat().st_size)
        except Exception as e:  # noqa: BLE001
            job.update(status="error", error=friendly_error(e))
            shutil.rmtree(out_dir, ignore_errors=True)


@app.post("/api/jobs")
def create_job(body: JobIn, x_api_key: Optional[str] = Header(None)):
    check_key(x_api_key)
    body.url = check_url(body.url)
    if body.kind not in ("mp4", "mp3"):
        raise HTTPException(422, "Formato inválido.")
    job = {"id": uuid.uuid4().hex, "status": "queued", "progress": 0, "speed": None, "eta": None,
           "created": time.time(), "_stage": 0, "_last_file": None}
    with LOCK:
        JOBS[job["id"]] = job
    threading.Thread(target=run_job, args=(job, body), daemon=True).start()
    return {"id": job["id"]}


def public(job: dict) -> dict:
    return {k: job.get(k) for k in ("id", "status", "progress", "speed", "eta", "filename", "size", "error")}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str, x_api_key: Optional[str] = Header(None)):
    check_key(x_api_key)
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Download não encontrado (pode ter expirado).")
    return public(job)


@app.get("/api/file/{job_id}")
def get_file(job_id: str):
    # O id do download é aleatório (128 bits) e só quem pediu o download o conhece.
    job = JOBS.get(job_id)
    if not job or job.get("status") != "done" or not job.get("path") or not Path(job["path"]).exists():
        raise HTTPException(404, "Arquivo não encontrado (pode ter expirado). Peça o download de novo.")
    return FileResponse(job["path"], filename=job["filename"], media_type="application/octet-stream")


def cleaner():
    while True:
        time.sleep(60)
        now = time.time()
        with LOCK:
            old = [j for j in JOBS.values() if now - j["created"] > JOB_TTL and j["status"] in ("done", "error")]
            for j in old:
                shutil.rmtree(WORK_DIR / j["id"], ignore_errors=True)
                JOBS.pop(j["id"], None)


threading.Thread(target=cleaner, daemon=True).start()
