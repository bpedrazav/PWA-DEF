"""Busca archivos .m3u / .m3u8 en GitHub usando la API de búsqueda de código."""
import os
import time
import requests

GITHUB_API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN")

HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
if TOKEN:
    HEADERS["Authorization"] = f"Bearer {TOKEN}"

# Varias queries para cubrir distintos nombres/formatos comunes de listas IPTV
SEARCH_QUERIES = [
    "#EXTM3U extension:m3u",
    "#EXTM3U extension:m3u8",
    "#EXTINF extension:m3u",
    "#EXTINF extension:m3u8",
]

PER_PAGE = 100
MAX_PAGES_PER_QUERY = 5  # más conservador para no chocar tan seguido con el rate limit secundario de GitHub


def _request_with_backoff(url, params=None, max_retries=5):
    for attempt in range(max_retries):
        r = requests.get(url, headers=HEADERS, params=params, timeout=20)
        if r.status_code == 200:
            return r
        if r.status_code in (403, 429):
            # Rate limit: esperar según el header o backoff exponencial
            reset = r.headers.get("X-RateLimit-Reset")
            if reset:
                wait = max(int(reset) - int(time.time()) + 1, 5)
            else:
                wait = 2 ** attempt * 5
            print(f"[github_search] Rate limited, esperando {wait}s...")
            time.sleep(wait)
            continue
        r.raise_for_status()
    raise RuntimeError(f"No se pudo completar la petición a {url} tras varios reintentos")


def search_m3u_files():
    """Genera dicts: {repo, path, sha, html_url, git_url}"""
    seen = set()
    for query in SEARCH_QUERIES:
        page = 1
        while page <= MAX_PAGES_PER_QUERY:
            params = {"q": query, "per_page": PER_PAGE, "page": page}
            try:
                resp = _request_with_backoff(f"{GITHUB_API}/search/code", params=params)
            except RuntimeError:
                # Se agotó el rate limit (incluido el "secundario" de abuso) para
                # esta query en particular. En vez de matar todo el run, dejamos
                # lo ya encontrado hasta ahora y pasamos a la siguiente query.
                print(f"[github_search] Rate limit agotado en query '{query}', se sigue con lo ya encontrado")
                break
            data = resp.json()
            items = data.get("items", [])
            if not items:
                break
            for item in items:
                repo = item["repository"]["full_name"]
                path = item["path"]
                key = (repo, path)
                if key in seen:
                    continue
                seen.add(key)
                yield {
                    "repo": repo,
                    "path": path,
                    "sha": item["sha"],
                    "html_url": item["html_url"],
                    "git_url": item["git_url"],
                }
            if len(items) < PER_PAGE:
                break
            page += 1
            # La búsqueda de código de GitHub permite ~10 req/min (autenticado) / 30 con GH App
            time.sleep(2)


def get_raw_content(repo: str, path: str, ref: str = None) -> str | None:
    """Descarga el contenido crudo del archivo vía la Contents API (maneja binarios/base64)."""
    url = f"{GITHUB_API}/repos/{repo}/contents/{path}"
    params = {"ref": ref} if ref else None
    try:
        resp = _request_with_backoff(url, params=params)
    except requests.HTTPError:
        return None
    except RuntimeError:
        # backoff agotado (rate limit persistente) - saltar este archivo, no tumbar todo el run
        return None

    data = resp.json()

    # La Contents API a veces responde con una LISTA en vez de un objeto
    # (paths ambiguos, gitlinks/submódulos, colisiones de mayúsculas/minúsculas
    # en sistemas de archivos case-insensitive, etc). En esos casos no hay
    # contenido de archivo real que extraer - se salta y sigue con el resto.
    if not isinstance(data, dict):
        return None
    if data.get("type") != "file":
        return None
    if data.get("encoding") == "base64":
        import base64
        try:
            return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
        except Exception:
            return None
    return data.get("content")
