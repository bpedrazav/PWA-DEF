# iptv-bot

Bot que busca diariamente listas `.m3u` / `.m3u8` públicas en GitHub, verifica
qué streams siguen funcionando y guarda todo en una base SQLite.

## Cómo funciona

1. **`github_search.py`** — usa la API de búsqueda de código de GitHub
   (`/search/code`) con varias queries (`#EXTM3U extension:m3u`, etc.) para
   encontrar archivos de playlists en repos públicos.
2. **`m3u_parser.py`** — parsea el formato M3U (`#EXTINF` + atributos
   `tvg-logo`, `group-title`, nombre del canal, URL).
3. **`checker.py`** — hace requests concurrentes (20 workers por defecto) a
   cada URL para confirmar que responde y que el contenido parece un stream
   real (HLS válido o `video/audio/octet-stream`).
4. **`db.py`** — SQLite con dos tablas:
   - `channels`: url (única), nombre, logo, grupo, repo/archivo de origen,
     estado (`working` / `dead`), latencia, fecha de último chequeo.
   - `scanned_files`: repo + path + sha, para no reprocesar un archivo si no
     cambió desde el último scan.
5. **`main.py`** — orquesta todo: discovery → parseo → guardado → chequeo →
   limpieza de canales muertos persistentes.

## Instalación local

```bash
cd iptv_bot
pip install -r requirements.txt
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx   # necesario para no chocar con rate limits
python main.py
```

Genera `iptv.db` en el directorio actual. Podés abrirlo con cualquier cliente
SQLite o con Python:

```python
import sqlite3
conn = sqlite3.connect("iptv.db")
for row in conn.execute("SELECT name, url FROM channels WHERE status='working' LIMIT 20"):
    print(row)
```

## Token de GitHub

Necesitás un [Personal Access Token](https://github.com/settings/tokens)
(no requiere permisos especiales, solo `public_repo` de lectura es
suficiente, o incluso uno sin scopes para repos públicos). Sin token, la API
de búsqueda de código limita a ~10 requests/min; con token autenticado sube a
~30/min.

## Automatización diaria (gratis, sin servidor)

Ya incluí `.github/workflows/daily.yml`: corre todos los días a las 06:00 UTC
en GitHub Actions (gratis para repos públicos), y al terminar hace commit de
`iptv.db` actualizado de vuelta al repo. Solo tenés que:

1. Subir esta carpeta a un repo de GitHub.
2. GitHub ya te da automáticamente `secrets.GITHUB_TOKEN` en Actions (no hay
   que configurar nada extra, salvo que quieras usar un token propio con
   más rate limit — en ese caso agregalo como secret y cambiá el `env:` del
   workflow).
3. Activar Actions en el repo (a veces hay que habilitarlo manualmente la
   primera vez, y darle permiso de "Read and write" en
   Settings → Actions → General → Workflow permissions, para que el commit
   final funcione).

Si preferís no versionar la DB en git (puede crecer y generar diffs
constantes), cambiá el último paso del workflow por subir `iptv.db` como
[artifact](https://github.com/actions/upload-artifact) o por escribir a una
DB externa (Postgres/Supabase/Turso) modificando `db.py`.

## Integración automática con FlojerApp (pestaña TV)

Después de verificar los streams, `publish.py` toma los que quedaron
`status='working'` y los sube como `channels_bot.json` directamente al repo
de FlojerApp (`bpedrazav/PWA-DEF`), usando la Contents API de GitHub.

`index.html` ya trae el lado que lee ese archivo (`syncBotChannels()`):
al abrir la app, hace fetch de `channels_bot.json` y:
- agrega los canales nuevos que el bot reporta como funcionando,
- **elimina automáticamente** los que agregó el bot en una sincronización
  anterior pero que ya no aparecen en el JSON (o sea, dejaron de funcionar),
- **nunca toca** los canales que agregaste vos a mano, aunque compartan URL
  con uno del bot (se distinguen con el campo interno `source:'bot'`).

También hay un botón "↻ Sincronizar ahora" en Ajustes → TV para forzarlo
manualmente.

### Setup necesario para que `publish.py` pueda escribir en PWA-DEF

Como este bot corre en un repo (posiblemente distinto al de PWA-DEF), el
`GITHUB_TOKEN` automático de Actions **no** tiene permiso de escribir en
otro repo. Necesitás:

1. Crear un [Personal Access Token](https://github.com/settings/tokens)
   (fine-grained, con permiso "Contents: Read and write" solo sobre el repo
   `PWA-DEF`; o uno clásico con scope `repo` si preferís algo más simple).
2. En el repo de este bot: Settings → Secrets and variables → Actions →
   New repository secret → nombre `PWA_PUBLISH_TOKEN`, valor el token de arriba.
3. Listo — el workflow ya usa `secrets.PWA_PUBLISH_TOKEN` en el paso
   "Publicar canales verificados en FlojerApp".

Si el bot vive en el **mismo repo** que PWA-DEF, podés simplemente usar
`secrets.GITHUB_TOKEN` en ese paso y borrar el secret extra.

## Comandos útiles

```bash
python main.py --discover-only     # solo busca y guarda canales nuevos, no verifica
python main.py --check-only        # solo re-verifica lo que ya está en la DB
python main.py --check-only --limit 200   # verificar una muestra (debug rápido)
python publish.py                  # publica el channels_bot.json manualmente
```

## Notas importantes

- **Rate limits**: la búsqueda de código de GitHub es el cuello de botella
  (no la verificación de streams). El script ya maneja backoff automático
  ante 403/429.
- **Falsos positivos/negativos**: el checker valida que la URL responda y
  que el contenido "parezca" un stream, pero no decodifica video de verdad
  (no usa ffprobe). Si querés validación más estricta, se puede agregar un
  paso opcional con `ffprobe` cuando esté instalado.
- **Uso responsable**: muchas de estas listas redistribuyen señales con
  copyright. Esta herramienta solo indexa y verifica disponibilidad técnica;
  el uso que le des a los streams es tu responsabilidad.
