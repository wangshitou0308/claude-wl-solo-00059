"""SQLite storage. The map document and trip sessions are kept as JSON locally."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("APP_DB_PATH", BASE_DIR / "data" / "app.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_lock = threading.RLock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        with _lock:
            yield conn
            conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS trips (
                id         TEXT PRIMARY KEY,
                status     TEXT NOT NULL DEFAULT 'active',
                data       TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- map document

MAP_KEY = "map:v1"


def get_map_doc() -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM kv WHERE key = ?", (MAP_KEY,)).fetchone()
    return json.loads(row["value"]) if row else None


def put_map_doc(doc: dict[str, Any]) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO kv(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (MAP_KEY, json.dumps(doc, ensure_ascii=False)),
        )


# ------------------------------------------------------------------ trip rows

def create_trip(trip_id: str, data: dict[str, Any]) -> None:
    ts = now_iso()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO trips(id, status, data, created_at, updated_at) "
            "VALUES(?, 'active', ?, ?, ?)",
            (trip_id, json.dumps(data, ensure_ascii=False), ts, ts),
        )


def get_trip(trip_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        return None
    d = json.loads(row["data"])
    d["_status"] = row["status"]
    d["_updated_at"] = row["updated_at"]
    return d


def save_trip(trip_id: str, data: dict[str, Any], status: str | None = None) -> None:
    data = {k: v for k, v in data.items() if not k.startswith("_")}
    with get_conn() as conn:
        if status is None:
            conn.execute(
                "UPDATE trips SET data = ?, updated_at = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=False), now_iso(), trip_id),
            )
        else:
            conn.execute(
                "UPDATE trips SET data = ?, status = ?, updated_at = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=False), status, now_iso(), trip_id),
            )


def list_trips(limit: int = 50) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, status, data, updated_at FROM trips "
            "ORDER BY updated_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        d = json.loads(row["data"])
        d["_id"] = row["id"]
        d["_status"] = row["status"]
        d["_updated_at"] = row["updated_at"]
        out.append(d)
    return out
