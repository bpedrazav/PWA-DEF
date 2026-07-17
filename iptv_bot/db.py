"""Capa de acceso a la base de datos SQLite."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = "iptv.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    name TEXT,
    logo TEXT,
    group_title TEXT,
    source_repo TEXT,
    source_file TEXT,
    status TEXT NOT NULL DEFAULT 'unknown',   -- working | dead | unknown
    latency_ms INTEGER,
    last_checked_at TEXT,
    first_seen_at TEXT NOT NULL,
    fail_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scanned_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    path TEXT NOT NULL,
    sha TEXT NOT NULL,
    scanned_at TEXT NOT NULL,
    UNIQUE(repo, path)
);

CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_conn(db_path: str = DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: str = DB_PATH):
    with get_conn(db_path) as conn:
        conn.executescript(SCHEMA)


def file_already_scanned(conn, repo: str, path: str, sha: str) -> bool:
    row = conn.execute(
        "SELECT sha FROM scanned_files WHERE repo=? AND path=?", (repo, path)
    ).fetchone()
    return row is not None and row["sha"] == sha


def mark_file_scanned(conn, repo: str, path: str, sha: str):
    conn.execute(
        """INSERT INTO scanned_files (repo, path, sha, scanned_at)
           VALUES (?,?,?,?)
           ON CONFLICT(repo, path) DO UPDATE SET sha=excluded.sha, scanned_at=excluded.scanned_at""",
        (repo, path, sha, now_iso()),
    )


def upsert_channel(conn, *, url, name, logo, group_title, source_repo, source_file):
    conn.execute(
        """INSERT INTO channels (url, name, logo, group_title, source_repo, source_file, first_seen_at)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(url) DO UPDATE SET
             name=COALESCE(excluded.name, channels.name),
             logo=COALESCE(excluded.logo, channels.logo),
             group_title=COALESCE(excluded.group_title, channels.group_title)
        """,
        (url, name, logo, group_title, source_repo, source_file, now_iso()),
    )


def update_check_result(conn, url: str, status: str, latency_ms: int | None):
    if status == "working":
        conn.execute(
            """UPDATE channels SET status=?, latency_ms=?, last_checked_at=?, fail_count=0
               WHERE url=?""",
            (status, latency_ms, now_iso(), url),
        )
    else:
        conn.execute(
            """UPDATE channels SET status=?, latency_ms=?, last_checked_at=?, fail_count=fail_count+1
               WHERE url=?""",
            (status, latency_ms, now_iso(), url),
        )


def get_channels_to_check(conn, include_dead=True, limit=None):
    q = "SELECT url FROM channels"
    if not include_dead:
        q += " WHERE status != 'dead'"
    q += " ORDER BY last_checked_at IS NULL DESC, last_checked_at ASC"
    if limit:
        q += f" LIMIT {int(limit)}"
    return [r["url"] for r in conn.execute(q).fetchall()]


def prune_dead(conn, max_fail_count=5):
    """Elimina canales que llevan muchos chequeos fallidos seguidos."""
    conn.execute("DELETE FROM channels WHERE fail_count >= ?", (max_fail_count,))
