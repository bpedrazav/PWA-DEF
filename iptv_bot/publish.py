"""
Publica los canales verificados como funcionando en un channels_bot.json
dentro del repo de FlojerApp (PWA-DEF), usando la Contents API de GitHub.

La app (index.html) lee ese archivo directamente desde raw.githubusercontent
y sincroniza su pestaña de TV: agrega los nuevos, y elimina los que el bot
ya no reporta como funcionando (los agregados manualmente por el usuario
nunca se tocan, porque se identifican por separado con source:'bot').

Variables de entorno:
  PUBLISH_TOKEN   Token con permiso de escritura sobre CHANNELS_REPO.
                  (el GITHUB_TOKEN por defecto de Actions NO alcanza si
                  CHANNELS_REPO es un repo distinto al de este bot)
  CHANNELS_REPO   Repo destino, formato "usuario/repo". Default: bpedrazav/PWA-DEF
  CHANNELS_PATH   Ruta del archivo en ese repo. Default: channels_bot.json
  CHANNELS_BRANCH Rama destino. Default: main
  MAX_CHANNELS    Máximo de canales a publicar (los más rápidos primero). Default: 500
"""
import base64
import json
import os
import requests

import db

GITHUB_API = "https://api.github.com"
TOKEN = os.environ.get("PUBLISH_TOKEN") or os.environ.get("GITHUB_TOKEN")
TARGET_REPO = os.environ.get("CHANNELS_REPO", "bpedrazav/PWA-DEF")
TARGET_PATH = os.environ.get("CHANNELS_PATH", "channels_bot.json")
TARGET_BRANCH = os.environ.get("CHANNELS_BRANCH", "main")
MAX_CHANNELS = int(os.environ.get("MAX_CHANNELS", "500"))

HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Authorization": f"Bearer {TOKEN}" if TOKEN else "",
}


def build_payload(max_channels: int = MAX_CHANNELS):
    with db.get_conn() as conn:
        rows = conn.execute(
            """SELECT url, name, logo, group_title FROM channels
               WHERE status = 'working'
               ORDER BY latency_ms ASC
               LIMIT ?""",
            (max_channels,),
        ).fetchall()
    return [
        {
            "name": r["name"] or "Canal",
            "url": r["url"],
            "logo": r["logo"],
            "group_title": r["group_title"],
        }
        for r in rows
    ]


def publish():
    if not TOKEN:
        raise SystemExit("Falta PUBLISH_TOKEN (o GITHUB_TOKEN) en el entorno")

    channels = build_payload()
    content = json.dumps(
        {"channels": channels, "generated_at": db.now_iso()},
        ensure_ascii=False,
        indent=2,
    )
    b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")

    url = f"{GITHUB_API}/repos/{TARGET_REPO}/contents/{TARGET_PATH}"
    get_resp = requests.get(url, headers=HEADERS, params={"ref": TARGET_BRANCH}, timeout=20)
    sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None

    payload = {
        "message": f"iptv-bot: {len(channels)} canales funcionando",
        "content": b64,
        "branch": TARGET_BRANCH,
    }
    if sha:
        payload["sha"] = sha

    put_resp = requests.put(url, headers=HEADERS, json=payload, timeout=20)
    if put_resp.status_code not in (200, 201):
        print(put_resp.status_code, put_resp.text)
    put_resp.raise_for_status()
    print(f"[publish] {len(channels)} canales publicados en {TARGET_REPO}/{TARGET_PATH}")


if __name__ == "__main__":
    publish()
