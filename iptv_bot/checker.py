"""Verifica si una URL de stream (m3u8 HLS o directa) está funcionando."""
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

TIMEOUT = 8
MAX_WORKERS = 20
USER_AGENT = "Mozilla/5.0 (compatible; IPTVChecker/1.0)"

HEADERS = {"User-Agent": USER_AGENT}


def check_one(url: str) -> tuple[str, str, int | None]:
    """Devuelve (url, status, latency_ms). status: 'working' | 'dead'"""
    start = time.monotonic()
    try:
        with requests.get(
            url, headers=HEADERS, stream=True, timeout=TIMEOUT, allow_redirects=True
        ) as r:
            if r.status_code >= 400:
                return url, "dead", None

            content_type = (r.headers.get("Content-Type") or "").lower()
            chunk = next(r.iter_content(chunk_size=2048), b"")
            latency_ms = int((time.monotonic() - start) * 1000)

            is_m3u8 = url.lower().endswith(".m3u8") or "mpegurl" in content_type
            if is_m3u8:
                text = chunk.decode("utf-8", errors="ignore")
                if "#EXTM3U" in text.upper() or "#EXT-X" in text.upper():
                    return url, "working", latency_ms
                # algunos servidores no devuelven el header pero sí el cuerpo bien formado
                return url, "dead", None

            # stream directo (.ts, video/*, audio/*, application/octet-stream, etc.)
            plausible_types = ("video", "audio", "octet-stream", "mp2t")
            if any(t in content_type for t in plausible_types) or len(chunk) > 0:
                return url, "working", latency_ms

            return url, "dead", None
    except requests.RequestException:
        return url, "dead", None


def check_many(urls: list[str], max_workers: int = MAX_WORKERS):
    """Chequea muchas URLs en paralelo. Yields (url, status, latency_ms) conforme terminan."""
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(check_one, u): u for u in urls}
        for fut in as_completed(futures):
            yield fut.result()
