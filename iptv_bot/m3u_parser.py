"""Parser simple de listas M3U / M3U8 (formato #EXTM3U + #EXTINF)."""
import re

EXTINF_RE = re.compile(r'#EXTINF:(-?\d+)\s*(.*)', re.IGNORECASE)
ATTR_RE = re.compile(r'([\w-]+)="([^"]*)"')
URL_RE = re.compile(r'^https?://\S+', re.IGNORECASE)


def parse_m3u(content: str):
    """Devuelve una lista de dicts: {name, logo, group_title, url}"""
    if not content or "#EXTM3U" not in content.upper():
        return []

    channels = []
    lines = content.splitlines()
    pending = None  # metadata de la línea #EXTINF esperando su URL

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#EXTM3U"):
            continue

        if line.upper().startswith("#EXTINF"):
            m = EXTINF_RE.match(line)
            if not m:
                pending = {"name": None, "logo": None, "group_title": None}
                continue
            rest = m.group(2)
            attrs = dict(ATTR_RE.findall(rest))
            # el nombre del canal es lo que queda después de la última coma
            name = rest.split(",")[-1].strip() if "," in rest else rest.strip()
            pending = {
                "name": name or None,
                "logo": attrs.get("tvg-logo"),
                "group_title": attrs.get("group-title"),
            }
            continue

        if line.startswith("#"):
            # otras directivas (#EXTVLCOPT, #EXTGRP, etc.) se ignoran
            continue

        if URL_RE.match(line):
            meta = pending or {"name": None, "logo": None, "group_title": None}
            channels.append({
                "url": line,
                "name": meta.get("name"),
                "logo": meta.get("logo"),
                "group_title": meta.get("group_title"),
            })
            pending = None

    return channels
