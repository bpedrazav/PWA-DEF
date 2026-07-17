"""
Bot diario de descubrimiento y verificación de listas IPTV en GitHub.

Flujo:
  1. Busca archivos .m3u/.m3u8 públicos en GitHub (code search API).
  2. Descarga los que cambiaron desde el último scan (por sha).
  3. Parsea los canales y los guarda/actualiza en SQLite.
  4. Verifica en paralelo qué streams siguen funcionando.
  5. Limpia canales muertos hace mucho tiempo.

Uso:
  python main.py                # corre discovery + check completo
  python main.py --check-only   # solo re-chequea lo que ya está en la DB
  python main.py --discover-only
"""
import argparse
import sys

import db
import github_search
import m3u_parser
import checker


def discover_and_store():
    print("[main] Buscando archivos .m3u/.m3u8 en GitHub...")
    found = 0
    new_channels = 0

    with db.get_conn() as conn:
        for file_info in github_search.search_m3u_files():
            repo, path, sha = file_info["repo"], file_info["path"], file_info["sha"]
            found += 1

            if db.file_already_scanned(conn, repo, path, sha):
                continue

            content = github_search.get_raw_content(repo, path)
            if not content:
                continue

            channels = m3u_parser.parse_m3u(content)
            for ch in channels:
                db.upsert_channel(
                    conn,
                    url=ch["url"],
                    name=ch["name"],
                    logo=ch["logo"],
                    group_title=ch["group_title"],
                    source_repo=repo,
                    source_file=path,
                )
                new_channels += 1

            db.mark_file_scanned(conn, repo, path, sha)

            if found % 25 == 0:
                print(f"[main] ...{found} archivos vistos, {new_channels} entradas de canal procesadas")

    print(f"[main] Discovery terminado: {found} archivos revisados, {new_channels} entradas de canal upsert-eadas")


def check_all(limit=None):
    with db.get_conn() as conn:
        urls = db.get_channels_to_check(conn, limit=limit)

    print(f"[main] Verificando {len(urls)} streams...")
    working, dead = 0, 0
    with db.get_conn() as conn:
        for i, (url, status, latency_ms) in enumerate(checker.check_many(urls), 1):
            db.update_check_result(conn, url, status, latency_ms)
            if status == "working":
                working += 1
            else:
                dead += 1
            if i % 100 == 0:
                conn.commit()
                print(f"[main] ...{i}/{len(urls)} chequeados (ok={working} dead={dead})")

    print(f"[main] Chequeo terminado: {working} funcionando, {dead} caídos")


def prune():
    with db.get_conn() as conn:
        before = conn.execute("SELECT COUNT(*) c FROM channels").fetchone()["c"]
        db.prune_dead(conn)
        after = conn.execute("SELECT COUNT(*) c FROM channels").fetchone()["c"]
    print(f"[main] Pruning: eliminados {before - after} canales muertos persistentes")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--discover-only", action="store_true")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Límite de streams a chequear (debug)")
    args = parser.parse_args()

    db.init_db()

    if args.check_only:
        check_all(limit=args.limit)
        prune()
        return

    if args.discover_only:
        discover_and_store()
        return

    discover_and_store()
    check_all(limit=args.limit)
    prune()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
