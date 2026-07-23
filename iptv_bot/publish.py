"""
Publica los canales verificados como funcionando en un channels_bot.json
dentro del repo de FlojerApp (PWA-DEF), usando la Contents API de GitHub.

La app (index.html) lee ese archivo directamente desde raw.githubusercontent
y sincroniza su pestaña de TV: agrega los nuevos, y elimina los que el bot
ya no reporta como funcionando (los agregados manualmente por el usuario
nunca se tocan, porque se identifican por separado con source:'bot').

Variables de entorno:
  PUBLISH_TOKEN     Token con permiso de escritura sobre CHANNELS_REPO.
                    (el GITHUB_TOKEN por defecto de Actions NO alcanza si
                    CHANNELS_REPO es un repo distinto al de este bot)
  CHANNELS_REPO     Repo destino, formato "usuario/repo". Default: bpedrazav/PWA-DEF
  CHANNELS_PATH     Ruta del archivo en ese repo. Default: channels_bot.json
  CHANNELS_BRANCH   Rama destino. Default: main
  MAX_CHANNELS      Máximo de canales a publicar (los más rápidos primero). Default: 500
  EXCLUDE_KEYWORDS  Palabras separadas por coma: si el nombre o la categoría
                    (group_title) de un canal contiene alguna, se excluye.
                    Editá la lista de abajo (EXCLUDE_KEYWORDS_DEFAULT) o
                    seteá la env var para override completo.
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

# Palabras clave (en minúscula) que, si aparecen en el nombre o la categoría
# (group_title) del canal, hacen que NO se publique. Edita esta lista a mano
# según lo que no te interese ver (países, idiomas, tipos de contenido, etc).
EXCLUDE_KEYWORDS_DEFAULT = [
    "china", "chino", "cn", "cctv", "cgtn",  # canales chinos
    "adult", "xxx", "porn", "+18",           # contenido adulto
    "religious", "religioso",                 # opcional: sácalo si sí te interesan
]
EXCLUDE_KEYWORDS = [
    k.strip().lower()
    for k in os.environ.get("EXCLUDE_KEYWORDS", ",".join(EXCLUDE_KEYWORDS_DEFAULT)).split(",")
    if k.strip()
]

HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Authorization": f"Bearer {TOKEN}" if TOKEN else "",
}


def is_excluded(name: str, group_title: str) -> bool:
    haystack = f"{name or ''} {group_title or ''}".lower()
    return any(kw in haystack for kw in EXCLUDE_KEYWORDS)


def build_payload(max_channels: int = MAX_CHANNELS):
    with db.get_conn() as conn:
        rows = conn.execute(
            """SELECT url, name, logo, group_title FROM channels
               WHERE status = 'working'
               ORDER BY latency_ms ASC""",
        ).fetchall()

    kept = []
    excluded_count = 0
    for r in rows:
        if is_excluded(r["name"], r["group_title"]):
            excluded_count += 1
            continue
        kept.append(r)
        if len(kept) >= max_channels:
            break

    print(f"[publish] {excluded_count} canales excluidos por palabra clave ({', '.join(EXCLUDE_KEYWORDS)})")
    return [
        {
            "name": r["name"] or "Canal",
            "url": r["url"],
            "logo": r["logo"],
            "group_title": r["group_title"],
        }
        for r in kept
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
    
    sha = None
    old_channel_names = set()
    if get_resp.status_code == 200:
        data = get_resp.json()
        sha = data.get("sha")
        try:
            old_content_str = base64.b64decode(data.get("content", "")).decode("utf-8")
            old_json = json.loads(old_content_str)
            old_channel_names = {c["name"] for c in old_json.get("channels", [])}
        except Exception as e:
            print(f"[publish] Error decodificando contenido anterior: {e}")

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

    # --- TELEGRAM NOTIFICATION ---
    tg_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    tg_chat = os.environ.get("TELEGRAM_CHAT_ID")
    if tg_token and tg_chat:
        new_channels = [c["name"] for c in channels if c["name"] not in old_channel_names]
        
        msg = f"<b>📺 Reporte IPTV - FlojerApp</b>\n\n"
        msg += f"✅ Canales Totales Funcionando: {len(channels)}\n"
        
        if new_channels:
            msg += f"\n<b>✨ ¡{len(new_channels)} Nuevos canales añadidos!</b>\n"
            for c in new_channels[:15]:
                msg += f"   • {c}\n"
            if len(new_channels) > 15:
                msg += f"   ... y {len(new_channels) - 15} más\n"
        else:
            msg += f"\nℹ️ No se encontraron canales nuevos hoy."
            
        msg += f"\n\n<i>Generado: {db.now_iso()}</i>"

        try:
            tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
            requests.post(tg_url, json={
                "chat_id": tg_chat,
                "text": msg,
                "parse_mode": "HTML"
            }, timeout=10)
            print("[publish] Mensaje enviado a Telegram")
        except Exception as e:
            print(f"[publish] Error enviando a Telegram: {e}")


if __name__ == "__main__":
    publish()
