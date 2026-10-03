#!/usr/bin/env python3
"""Servidor local de la demo València Resiliente.

Usa únicamente la biblioteca estándar: SQLite para persistencia, sesiones seguras
en cookie HttpOnly y una API común para la aplicación ciudadana y la central.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import hmac
import ipaddress
import json
import math
import os
import re
import secrets
import sqlite3
import string
import sys
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
ESCALATION_POLICY_PATH = ROOT / "config" / "escalation-policy.json"
DEFAULT_DATA_DIR = ROOT / ".data"
PASSWORD_ITERATIONS = 310_000
SESSION_SECONDS = 8 * 60 * 60
MAX_JSON_BYTES = 256 * 1024
MAX_MEDIA_BYTES = 20 * 1024 * 1024
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,64}$")
CASE_ID_RE = re.compile(r"^VT-[0-9]{6}$")
MEDIA_ID_RE = re.compile(r"^MD-[0-9]{6}$")

SEVERITY_ORDER = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
TRIAGE_FIELDS = {"danger", "knowsAction", "needsHelp"}
SAFE_ESCALATION_POLICY = {
    "version": 0,
    "emergencyNumber": "112",
    "callMode": "one_tap",
    "voice": {"autoSpeak": True, "autoListen": True},
    "questions": [],
    "rules": [],
    "defaultDecision": {
        "priority": "pending", "createIncident": False, "offerEmergencyCall": False,
        "citizenState": "safe", "need": "Respuesta a alerta pública",
    },
}

ZONE_DEFINITIONS = [
    {"id": "poblats-maritims", "code": "POBLATS MARITIMS", "es": "Poblats Marítims", "val": "Poblats Marítims", "en": "Maritime Districts", "lat": 39.4688, "lon": -0.3318},
    {"id": "quatre-carreres", "code": "QUATRE CARRERES", "es": "Quatre Carreres", "val": "Quatre Carreres", "en": "Quatre Carreres", "lat": 39.4516, "lon": -0.3592},
    {"id": "campanar", "code": "CAMPANAR", "es": "Campanar", "val": "Campanar", "en": "Campanar", "lat": 39.4898, "lon": -0.4021},
    {"id": "ciutat-vella", "code": "CIUTAT VELLA", "es": "Ciutat Vella", "val": "Ciutat Vella", "en": "Old Town", "lat": 39.4742, "lon": -0.3773},
    {"id": "benimaclet", "code": "BENIMACLET", "es": "Benimaclet", "val": "Benimaclet", "en": "Benimaclet", "lat": 39.4875, "lon": -0.3597},
    {"id": "poblats-del-sud", "code": "POBLATS DEL SUD", "es": "Poblats del Sud", "val": "Poblats del Sud", "en": "Southern Districts", "lat": 39.3822, "lon": -0.3321},
]

ALERT_DEFINITIONS = [
    {
        "id": "ALERT-DEMO-VALENCIA-01", "version": 2, "type": "flood", "status": "active", "source": "VT-01 · simulación de alerta pública",
        "issuedAt": "2026-09-25T07:30:00Z", "expiresAt": "2027-09-25T18:00:00Z",
        "title": {"es": "Riesgo de inundación", "val": "Risc d'inundació", "en": "Flood risk"},
        "summary": {"es": "Lluvia intensa con riesgo en zonas bajas.", "val": "Pluja intensa amb risc en zones baixes.", "en": "Heavy rain with risk in low-lying areas."},
        "action": {"es": "Evita desplazarte y sube a una planta superior si entra agua.", "val": "Evita desplaçar-te i puja a una planta superior si entra aigua.", "en": "Avoid travel and move to an upper floor if water enters."},
        "zones": {"poblats-maritims": "critical", "poblats-del-sud": "high", "quatre-carreres": "medium", "ciutat-vella": "low"},
    },
    {
        "id": "ALERT-DEMO-VALENCIA-02", "version": 1, "type": "fire", "status": "active", "source": "VT-01 · simulación de alerta pública",
        "issuedAt": "2026-09-25T08:10:00Z", "expiresAt": "2027-09-25T18:00:00Z",
        "title": {"es": "Humo en garaje comunitario", "val": "Fum en garatge comunitari", "en": "Smoke in a residential garage"},
        "summary": {"es": "Incidencia en verificación por la central.", "val": "Incidència en verificació per la central.", "en": "The control centre is verifying the incident."},
        "action": {"es": "Aléjate del humo, permanece en el exterior y no uses el ascensor.", "val": "Allunya't del fum, queda't a l'exterior i no uses l'ascensor.", "en": "Stay away from smoke, remain outside and do not use the lift."},
        "zones": {"campanar": "high", "benimaclet": "medium"},
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def iso_after(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(timespec="seconds").replace("+00:00", "Z")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def password_policy(password: str) -> tuple[bool, str]:
    if len(password) < 12:
        return False, "La contraseña debe tener al menos 12 caracteres."
    if len(password) > 256:
        return False, "La contraseña es demasiado larga."
    if not re.search(r"[a-z]", password) or not re.search(r"[A-Z]", password) or not re.search(r"[0-9]", password):
        return False, "Incluye mayúscula, minúscula y número."
    return True, ""


def make_password() -> str:
    alphabet = string.ascii_letters + string.digits + "-._~"
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(18))
        if password_policy(value)[0]:
            return value


def clean_text(value: Any, *, maximum: int, default: str = "") -> str:
    if not isinstance(value, str):
        return default
    value = "".join(ch for ch in value.strip() if ch >= " " and ch != "\x7f")
    return value[:maximum]


def as_bool(value: Any, default: bool = False) -> bool:
    return value if isinstance(value, bool) else default


def bounded_int(value: Any, low: int, high: int, default: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def bounded_float(value: Any, low: float, high: float) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < low or number > high:
        return None
    return round(number, 7)


def _valid_condition(condition: Any, depth: int = 0) -> bool:
    if not isinstance(condition, dict) or depth > 4:
        return False
    if "all" in condition:
        values = condition["all"]
        return isinstance(values, list) and bool(values) and len(values) <= 8 and all(_valid_condition(item, depth + 1) for item in values)
    if "any" in condition:
        values = condition["any"]
        return isinstance(values, list) and bool(values) and len(values) <= 8 and all(_valid_condition(item, depth + 1) for item in values)
    return condition.get("field") in TRIAGE_FIELDS and isinstance(condition.get("equals"), bool)


def load_escalation_policy() -> dict[str, Any]:
    """Load the shared triage policy; invalid data fails closed."""
    try:
        raw = json.loads(ESCALATION_POLICY_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
    if not isinstance(raw, dict) or not isinstance(raw.get("version"), int):
        return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
    rules = raw.get("rules")
    if not isinstance(rules, list) or len(rules) > 20:
        return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
    clean_rules = []
    rule_ids: set[str] = set()
    for rule in rules:
        if not isinstance(rule, dict) or not _valid_condition(rule.get("when")):
            return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
        priority = rule.get("priority")
        if priority not in {"pending", "low", "medium", "high", "critical"}:
            return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
        rule_id = clean_text(rule.get("id"), maximum=80)
        if not rule_id or rule_id in rule_ids:
            return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
        rule_ids.add(rule_id)
        clean_rules.append({
            "id": rule_id,
            "when": rule["when"],
            "priority": priority,
            "createIncident": as_bool(rule.get("createIncident")),
            "offerEmergencyCall": as_bool(rule.get("offerEmergencyCall")),
            "citizenState": rule.get("citizenState") if rule.get("citizenState") in {"safe", "help", "trapped"} else "help",
            "need": clean_text(rule.get("need"), maximum=120, default="Respuesta de triaje"),
        })
    default = raw.get("defaultDecision") if isinstance(raw.get("defaultDecision"), dict) else {}
    questions = raw.get("questions")
    if not isinstance(questions, list) or len(questions) != len(TRIAGE_FIELDS):
        return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
    clean_questions = []
    question_ids: set[str] = set()
    for question in questions:
        if not isinstance(question, dict) or question.get("id") not in TRIAGE_FIELDS or not isinstance(question.get("text"), dict):
            return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
        if question["id"] in question_ids:
            return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
        question_ids.add(question["id"])
        texts = {key: clean_text(question["text"].get(key), maximum=180) for key in ("es", "val", "en")}
        if not all(texts.values()):
            return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
        clean_questions.append({"id": question["id"], "text": texts})
    if question_ids != TRIAGE_FIELDS:
        return json.loads(json.dumps(SAFE_ESCALATION_POLICY))
    voice = raw.get("voice") if isinstance(raw.get("voice"), dict) else {}
    number = str(raw.get("emergencyNumber", "112"))
    return {
        "version": max(1, min(int(raw["version"]), 1_000_000)),
        "emergencyNumber": number if re.fullmatch(r"[0-9]{3,6}", number) else "112",
        "callMode": "one_tap",
        "voice": {"autoSpeak": as_bool(voice.get("autoSpeak"), True), "autoListen": as_bool(voice.get("autoListen"), True)},
        "questions": clean_questions,
        "rules": clean_rules,
        "defaultDecision": {
            "priority": default.get("priority") if default.get("priority") in {"pending", "low", "medium"} else "pending",
            "createIncident": False,
            "offerEmergencyCall": False,
            "citizenState": default.get("citizenState") if default.get("citizenState") in {"safe", "help"} else "safe",
            "need": clean_text(default.get("need"), maximum=120, default="Respuesta a alerta pública"),
        },
    }


def _condition_matches(condition: dict[str, Any], answers: dict[str, bool]) -> bool:
    if "all" in condition:
        return all(_condition_matches(item, answers) for item in condition["all"])
    if "any" in condition:
        return any(_condition_matches(item, answers) for item in condition["any"])
    return answers.get(condition["field"]) is condition["equals"]


def evaluate_escalation(answers: Any, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = policy or load_escalation_policy()
    clean_answers = {
        field: answers.get(field) for field in TRIAGE_FIELDS
        if isinstance(answers, dict) and isinstance(answers.get(field), bool)
    }
    decision = dict(policy["defaultDecision"])
    decision.update({"matched": False, "ruleId": "default"})
    if len(clean_answers) == len(TRIAGE_FIELDS):
        for rule in policy["rules"]:
            if _condition_matches(rule["when"], clean_answers):
                decision.update({key: value for key, value in rule.items() if key != "when"})
                decision.update({"matched": True, "ruleId": rule["id"]})
                break
    decision.update({
        "policyVersion": policy["version"], "callMode": policy["callMode"],
        "emergencyNumber": policy["emergencyNumber"], "answers": clean_answers,
    })
    return decision


def media_signature_matches(kind: str, payload: bytes) -> bool:
    head = payload[:32]
    if kind == "image":
        return (
            head.startswith(b"\xff\xd8\xff") or head.startswith(b"\x89PNG\r\n\x1a\n") or
            (head.startswith(b"RIFF") and head[8:12] == b"WEBP") or b"ftyphei" in head or b"ftypmif1" in head
        )
    if kind in {"audio", "video"}:
        return (
            head.startswith(b"\x1aE\xdf\xa3") or head.startswith(b"OggS") or head.startswith(b"ID3") or
            (head.startswith(b"RIFF") and head[8:12] in {b"WAVE", b"AVI "}) or b"ftyp" in head
        )
    return False


class Store:
    def __init__(self, database: Path, secret_file: Path | None = None):
        self.database = Path(database)
        self.database.parent.mkdir(parents=True, exist_ok=True)
        self.media_dir = self.database.parent / "media"
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.secret_file = Path(secret_file or self.database.parent / "token-secret.key")
        self._secret = self._load_secret()
        self._initialise()

    def _load_secret(self) -> bytes:
        if self.secret_file.exists():
            data = self.secret_file.read_bytes()
            if len(data) >= 32:
                return data
        data = secrets.token_bytes(32)
        self.secret_file.write_bytes(data)
        try:
            self.secret_file.chmod(0o600)
        except OSError:
            pass
        return data

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database, timeout=8)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 8000")
        return connection

    def _initialise(self) -> None:
        with self.connect() as db:
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS admins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    display_name TEXT NOT NULL,
                    password_salt BLOB NOT NULL,
                    password_hash BLOB NOT NULL,
                    password_iterations INTEGER NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('SuperAdmin','Operator')),
                    active INTEGER NOT NULL DEFAULT 1,
                    must_change_password INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    created_by INTEGER REFERENCES admins(id),
                    last_login_at TEXT
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                    csrf_token TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS incidents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    public_id TEXT UNIQUE,
                    client_request_id TEXT NOT NULL UNIQUE,
                    access_token_hash TEXT NOT NULL,
                    source TEXT NOT NULL,
                    incident_type TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    note TEXT NOT NULL,
                    zone TEXT NOT NULL,
                    latitude REAL,
                    longitude REAL,
                    accuracy_m REAL,
                    people INTEGER NOT NULL,
                    need TEXT NOT NULL,
                    citizen_state TEXT NOT NULL,
                    silent INTEGER NOT NULL,
                    contact INTEGER NOT NULL DEFAULT 0,
                    photo_count INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    priority TEXT NOT NULL,
                    triage_json TEXT NOT NULL DEFAULT '{}',
                    verification TEXT NOT NULL,
                    assignee TEXT NOT NULL,
                    unit TEXT NOT NULL,
                    instruction TEXT NOT NULL,
                    delivery TEXT NOT NULL,
                    media_photo TEXT NOT NULL,
                    media_video TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS incident_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
                    event_type TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS alert_responses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    public_id TEXT UNIQUE,
                    client_request_id TEXT NOT NULL UNIQUE,
                    alert_id TEXT NOT NULL,
                    client_policy_version INTEGER,
                    zone TEXT NOT NULL,
                    applicable INTEGER NOT NULL,
                    received INTEGER NOT NULL,
                    understood INTEGER,
                    can_act INTEGER,
                    needs_help INTEGER,
                    danger INTEGER,
                    knows_action INTEGER,
                    reasons_json TEXT NOT NULL,
                    people INTEGER NOT NULL,
                    precision TEXT NOT NULL,
                    latitude REAL,
                    longitude REAL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS zones (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL UNIQUE,
                    name_es TEXT NOT NULL,
                    name_val TEXT NOT NULL,
                    name_en TEXT NOT NULL,
                    centroid_lat REAL NOT NULL,
                    centroid_lon REAL NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS public_alerts (
                    id TEXT PRIMARY KEY,
                    version INTEGER NOT NULL,
                    alert_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    source TEXT NOT NULL,
                    title_json TEXT NOT NULL,
                    summary_json TEXT NOT NULL,
                    action_json TEXT NOT NULL,
                    issued_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS alert_zones (
                    alert_id TEXT NOT NULL REFERENCES public_alerts(id) ON DELETE CASCADE,
                    zone_id TEXT NOT NULL REFERENCES zones(id),
                    severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
                    PRIMARY KEY(alert_id,zone_id)
                );
                CREATE TABLE IF NOT EXISTS media_assets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    public_id TEXT UNIQUE,
                    incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
                    upload_token_hash TEXT NOT NULL,
                    kind TEXT NOT NULL CHECK(kind IN ('image','audio','video')),
                    content_type TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    declared_size INTEGER NOT NULL,
                    size_bytes INTEGER,
                    sha256 TEXT,
                    storage_name TEXT,
                    status TEXT NOT NULL,
                    consent_at TEXT NOT NULL,
                    retention_until TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    uploaded_at TEXT
                );
                CREATE TABLE IF NOT EXISTS media_analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    media_id INTEGER NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
                    status TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    model_version TEXT NOT NULL,
                    suggested_priority TEXT NOT NULL,
                    score REAL,
                    confidence REAL,
                    signals_json TEXT NOT NULL,
                    reasons_json TEXT NOT NULL,
                    human_status TEXT NOT NULL DEFAULT 'pending',
                    operator_priority TEXT,
                    override_reason TEXT NOT NULL DEFAULT '',
                    reviewed_by INTEGER REFERENCES admins(id),
                    created_at TEXT NOT NULL,
                    completed_at TEXT,
                    reviewed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_admin_id INTEGER REFERENCES admins(id),
                    action TEXT NOT NULL,
                    target TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_incidents_updated ON incidents(updated_at);
                CREATE INDEX IF NOT EXISTS idx_responses_alert_zone ON alert_responses(alert_id, zone);
                CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
                CREATE INDEX IF NOT EXISTS idx_media_incident ON media_assets(incident_id,created_at);
                CREATE INDEX IF NOT EXISTS idx_alert_zones_zone ON alert_zones(zone_id,severity);
                """
            )
            incident_columns = {row["name"] for row in db.execute("PRAGMA table_info(incidents)")}
            if "contact" not in incident_columns:
                db.execute("ALTER TABLE incidents ADD COLUMN contact INTEGER NOT NULL DEFAULT 0")
            if "triage_json" not in incident_columns:
                db.execute("ALTER TABLE incidents ADD COLUMN triage_json TEXT NOT NULL DEFAULT '{}'")
            response_columns = {row["name"] for row in db.execute("PRAGMA table_info(alert_responses)")}
            if "alert_version" not in response_columns:
                db.execute("ALTER TABLE alert_responses ADD COLUMN alert_version INTEGER NOT NULL DEFAULT 1")
            if "client_policy_version" not in response_columns:
                db.execute("ALTER TABLE alert_responses ADD COLUMN client_policy_version INTEGER")
            if "danger" not in response_columns:
                db.execute("ALTER TABLE alert_responses ADD COLUMN danger INTEGER")
            if "knows_action" not in response_columns:
                db.execute("ALTER TABLE alert_responses ADD COLUMN knows_action INTEGER")
            self._seed_reference_data(db)
            for zone in ZONE_DEFINITIONS:
                db.execute(
                    "UPDATE alert_responses SET zone=? WHERE lower(zone) IN (lower(?),lower(?),lower(?),lower(?))",
                    (zone["id"], zone["id"], zone["code"], zone["es"], zone["val"]),
                )

    def _seed_reference_data(self, db: sqlite3.Connection) -> None:
        for zone in ZONE_DEFINITIONS:
            db.execute(
                """INSERT INTO zones(id,code,name_es,name_val,name_en,centroid_lat,centroid_lon,active)
                   VALUES(?,?,?,?,?,?,?,1)
                   ON CONFLICT(id) DO UPDATE SET code=excluded.code,name_es=excluded.name_es,name_val=excluded.name_val,
                   name_en=excluded.name_en,centroid_lat=excluded.centroid_lat,centroid_lon=excluded.centroid_lon,active=1""",
                (zone["id"], zone["code"], zone["es"], zone["val"], zone["en"], zone["lat"], zone["lon"]),
            )
        for alert in ALERT_DEFINITIONS:
            db.execute(
                """INSERT INTO public_alerts(id,version,alert_type,status,source,title_json,summary_json,action_json,issued_at,updated_at,expires_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET version=excluded.version,alert_type=excluded.alert_type,status=excluded.status,
                   source=excluded.source,title_json=excluded.title_json,summary_json=excluded.summary_json,
                   action_json=excluded.action_json,issued_at=excluded.issued_at,updated_at=excluded.updated_at,expires_at=excluded.expires_at""",
                (alert["id"], alert["version"], alert["type"], alert["status"], alert["source"],
                 json.dumps(alert["title"], ensure_ascii=False), json.dumps(alert["summary"], ensure_ascii=False),
                 json.dumps(alert["action"], ensure_ascii=False), alert["issuedAt"], alert["issuedAt"], alert["expiresAt"]),
            )
            db.execute("DELETE FROM alert_zones WHERE alert_id=?", (alert["id"],))
            db.executemany(
                "INSERT INTO alert_zones(alert_id,zone_id,severity) VALUES(?,?,?)",
                [(alert["id"], zone_id, severity) for zone_id, severity in alert["zones"].items()],
            )

    @staticmethod
    def _password_digest(password: str, salt: bytes, iterations: int = PASSWORD_ITERATIONS) -> bytes:
        return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)

    def admin_count(self) -> int:
        with self.connect() as db:
            return int(db.execute("SELECT COUNT(*) FROM admins WHERE active=1").fetchone()[0])

    def create_bootstrap_admin(self, username: str, display_name: str, password: str) -> dict[str, Any]:
        username = clean_text(username, maximum=64)
        display_name = clean_text(display_name, maximum=80, default=username)
        if not USERNAME_RE.fullmatch(username):
            raise ValueError("Usuario inválido. Usa 3–64 letras, números, punto, guion o guion bajo.")
        valid, message = password_policy(password)
        if not valid:
            raise ValueError(message)
        salt = secrets.token_bytes(16)
        digest = self._password_digest(password, salt)
        now = utc_now()
        with self.connect() as db:
            try:
                cursor = db.execute(
                    "INSERT INTO admins(username,display_name,password_salt,password_hash,password_iterations,role,active,must_change_password,created_at) VALUES(?,?,?,?,?,'SuperAdmin',1,0,?)",
                    (username, display_name, salt, digest, PASSWORD_ITERATIONS, now),
                )
            except sqlite3.IntegrityError as error:
                raise ValueError("Ese usuario ya existe.") from error
            self._audit(db, cursor.lastrowid, "bootstrap_admin_created", username, "Primer superadministrador")
        return {"username": username, "displayName": display_name, "role": "SuperAdmin"}

    def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        username = clean_text(username, maximum=64)
        with self.connect() as db:
            row = db.execute("SELECT * FROM admins WHERE username=? AND active=1", (username,)).fetchone()
            if not row:
                # Trabajo constante aproximado para no revelar si el usuario existe.
                self._password_digest(password, b"\0" * 16)
                return None
            digest = self._password_digest(password, row["password_salt"], int(row["password_iterations"]))
            if not hmac.compare_digest(digest, row["password_hash"]):
                return None
            db.execute("UPDATE admins SET last_login_at=? WHERE id=?", (utc_now(), row["id"]))
            return self._admin_public(row)

    def create_session(self, admin_id: int) -> tuple[str, dict[str, Any]]:
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(24)
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE expires_at<=?", (utc_now(),))
            db.execute(
                "INSERT INTO sessions(token_hash,admin_id,csrf_token,created_at,expires_at) VALUES(?,?,?,?,?)",
                (token_hash(token), admin_id, csrf, utc_now(), iso_after(SESSION_SECONDS)),
            )
            row = db.execute("SELECT * FROM admins WHERE id=?", (admin_id,)).fetchone()
        data = self._admin_public(row)
        data["csrfToken"] = csrf
        return token, data

    def session(self, token: str | None) -> dict[str, Any] | None:
        if not token:
            return None
        with self.connect() as db:
            row = db.execute(
                "SELECT a.*,s.csrf_token,s.expires_at FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1",
                (token_hash(token), utc_now()),
            ).fetchone()
            if not row:
                return None
            data = self._admin_public(row)
            data["csrfToken"] = row["csrf_token"]
            data["expiresAt"] = row["expires_at"]
            return data

    def delete_session(self, token: str | None) -> None:
        if not token:
            return
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(token),))

    def change_password(self, admin_id: int, current_password: str, new_password: str) -> None:
        valid, message = password_policy(new_password)
        if not valid:
            raise ValueError(message)
        with self.connect() as db:
            row = db.execute("SELECT * FROM admins WHERE id=? AND active=1", (admin_id,)).fetchone()
            if not row:
                raise PermissionError("Usuario no disponible.")
            current = self._password_digest(current_password, row["password_salt"], int(row["password_iterations"]))
            if not hmac.compare_digest(current, row["password_hash"]):
                raise PermissionError("La contraseña actual no es correcta.")
            salt = secrets.token_bytes(16)
            digest = self._password_digest(new_password, salt)
            db.execute(
                "UPDATE admins SET password_salt=?,password_hash=?,password_iterations=?,must_change_password=0 WHERE id=?",
                (salt, digest, PASSWORD_ITERATIONS, admin_id),
            )
            self._audit(db, admin_id, "password_changed", str(admin_id), "Contraseña actualizada")

    def list_admins(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM admins ORDER BY active DESC, display_name COLLATE NOCASE").fetchall()
        return [self._admin_public(row) for row in rows]

    def create_invited_admin(self, actor_id: int, username: str, display_name: str, role: str) -> dict[str, Any]:
        username = clean_text(username, maximum=64)
        display_name = clean_text(display_name, maximum=80, default=username)
        role = role if role in {"Operator", "SuperAdmin"} else "Operator"
        if not USERNAME_RE.fullmatch(username):
            raise ValueError("Usuario inválido. Usa 3–64 letras, números, punto, guion o guion bajo.")
        password = make_password()
        salt = secrets.token_bytes(16)
        digest = self._password_digest(password, salt)
        with self.connect() as db:
            actor = db.execute("SELECT role,active FROM admins WHERE id=?", (actor_id,)).fetchone()
            if not actor or not actor["active"] or actor["role"] != "SuperAdmin":
                raise PermissionError("Solo un superadministrador puede crear usuarios.")
            try:
                cursor = db.execute(
                    "INSERT INTO admins(username,display_name,password_salt,password_hash,password_iterations,role,active,must_change_password,created_at,created_by) VALUES(?,?,?,?,?,?,1,1,?,?)",
                    (username, display_name, salt, digest, PASSWORD_ITERATIONS, role, utc_now(), actor_id),
                )
            except sqlite3.IntegrityError as error:
                raise ValueError("Ese usuario ya existe.") from error
            self._audit(db, actor_id, "admin_created", username, "Rol=" + role)
            row = db.execute("SELECT * FROM admins WHERE id=?", (cursor.lastrowid,)).fetchone()
        result = self._admin_public(row)
        result["temporaryPassword"] = password
        return result

    def _admin_public(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "username": row["username"],
            "displayName": row["display_name"],
            "role": row["role"],
            "active": bool(row["active"]),
            "mustChangePassword": bool(row["must_change_password"]),
            "createdAt": row["created_at"],
            "lastLoginAt": row["last_login_at"],
        }

    def list_zones(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM zones WHERE active=1 ORDER BY name_es COLLATE NOCASE").fetchall()
        return [
            {
                "id": row["id"],
                "code": row["code"],
                "names": {"es": row["name_es"], "val": row["name_val"], "en": row["name_en"]},
                "centroid": {"latitude": row["centroid_lat"], "longitude": row["centroid_lon"]},
            }
            for row in rows
        ]

    def _normalise_zone(self, db: sqlite3.Connection, value: Any) -> sqlite3.Row | None:
        text = clean_text(value, maximum=100).casefold()
        if not text:
            return None
        return db.execute(
            """SELECT * FROM zones WHERE active=1 AND (
               lower(id)=? OR lower(code)=? OR lower(name_es)=? OR lower(name_val)=? OR lower(name_en)=?)""",
            (text, text, text, text, text),
        ).fetchone()

    @staticmethod
    def _translated_json(value: str) -> dict[str, str]:
        try:
            parsed = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            parsed = {}
        if not isinstance(parsed, dict):
            parsed = {}
        fallback = clean_text(parsed.get("es"), maximum=500)
        return {language: clean_text(parsed.get(language), maximum=500, default=fallback) for language in ("es", "val", "en")}

    def list_alerts(self, zone_id: str = "", scope: str = "all") -> list[dict[str, Any]]:
        with self.connect() as db:
            selected = self._normalise_zone(db, zone_id) if zone_id else None
            alert_rows = db.execute(
                "SELECT * FROM public_alerts WHERE status='active' AND expires_at>? ORDER BY issued_at DESC",
                (utc_now(),),
            ).fetchall()
            result: list[dict[str, Any]] = []
            for row in alert_rows:
                zone_rows = db.execute(
                    """SELECT az.zone_id,az.severity,z.code,z.name_es,z.name_val,z.name_en
                       FROM alert_zones az JOIN zones z ON z.id=az.zone_id WHERE az.alert_id=?""",
                    (row["id"],),
                ).fetchall()
                if scope == "local" and selected and not any(item["zone_id"] == selected["id"] for item in zone_rows):
                    continue
                zones = [
                    {"zoneId": item["zone_id"], "zoneCode": item["code"], "severity": item["severity"],
                     "names": {"es": item["name_es"], "val": item["name_val"], "en": item["name_en"]}}
                    for item in zone_rows
                ]
                local_level = next((item["severity"] for item in zone_rows if selected and item["zone_id"] == selected["id"]), None)
                overall = max((item["severity"] for item in zone_rows), key=lambda level: SEVERITY_ORDER[level], default="unknown")
                result.append({
                    "id": row["id"], "version": int(row["version"]), "type": row["alert_type"], "status": row["status"],
                    "source": row["source"], "issuedAt": row["issued_at"], "updatedAt": row["updated_at"], "expiresAt": row["expires_at"],
                    "title": self._translated_json(row["title_json"]), "summary": self._translated_json(row["summary_json"]),
                    "recommendedAction": self._translated_json(row["action_json"]), "zones": zones,
                    "severity": local_level or overall, "localSeverity": local_level, "isLocal": bool(local_level),
                })
        return sorted(result, key=lambda item: (SEVERITY_ORDER.get(item["severity"], 0), item["issuedAt"]), reverse=True)

    def zone_criticalities(self) -> list[dict[str, Any]]:
        zones = self.list_zones()
        alerts = self.list_alerts()
        aggregates = self.checkin_aggregates()
        by_zone: dict[str, dict[str, Any]] = {
            zone["id"]: {
                "zoneId": zone["id"], "zoneCode": zone["code"], "names": zone["names"],
                "officialSeverity": "unknown", "operationalNeed": "unknown", "priorityLevel": "unknown",
                "responses": 0, "needsHelp": 0, "cannotAct": 0, "notUnderstood": 0,
                "peopleNeedingHelp": 0, "lastUpdatedAt": None, "source": "Sin datos suficientes",
            }
            for zone in zones
        }
        for alert in alerts:
            for target in alert["zones"]:
                item = by_zone.get(target["zoneId"])
                if item and SEVERITY_ORDER[target["severity"]] > SEVERITY_ORDER[item["officialSeverity"]]:
                    item["officialSeverity"] = target["severity"]
                    item["source"] = alert["source"]
        for response in aggregates:
            item = by_zone.get(response.get("zoneId", ""))
            if not item:
                continue
            for field in ("responses", "needsHelp", "cannotAct", "notUnderstood", "peopleNeedingHelp"):
                item[field] += int(response.get(field) or 0)
            updated = response.get("lastUpdatedAt")
            if updated and (not item["lastUpdatedAt"] or updated > item["lastUpdatedAt"]):
                item["lastUpdatedAt"] = updated
        for item in by_zone.values():
            if item["responses"]:
                if item["peopleNeedingHelp"] >= 5 or item["needsHelp"] >= 3 or item["cannotAct"] >= 3:
                    item["operationalNeed"] = "critical"
                elif item["needsHelp"] or item["cannotAct"]:
                    item["operationalNeed"] = "high"
                elif item["notUnderstood"]:
                    item["operationalNeed"] = "medium"
                else:
                    item["operationalNeed"] = "low"
            item["priorityLevel"] = max(
                (item["officialSeverity"], item["operationalNeed"]), key=lambda level: SEVERITY_ORDER[level]
            )
        return sorted(by_zone.values(), key=lambda item: (-SEVERITY_ORDER[item["priorityLevel"]], item["names"]["es"]))

    def heatmap_feed(self, generated_at: str | None = None) -> dict[str, Any]:
        """Build the allowlisted, location-aware feed used by the operator map.

        The feed deliberately contains no free-form citizen text. Exact incident
        coordinates are available to authenticated operators; incidents without
        them fall back to a known zone centroid. Items with no usable location
        are omitted because they cannot contribute to a spatial layer.
        """
        generated_at = generated_at or utc_now()
        zones = self.list_zones()
        alerts = self.list_alerts()
        incidents = self.list_incidents(limit=200)
        intensity_by_severity = {
            "unknown": 0.35,
            "low": 0.25,
            "medium": 0.5,
            "high": 0.75,
            "critical": 1.0,
        }

        zone_by_id = {zone["id"]: zone for zone in zones}
        zone_by_alias: dict[str, dict[str, Any]] = {}
        for zone in zones:
            aliases = [zone["id"], zone["code"], *zone["names"].values()]
            for alias in aliases:
                if isinstance(alias, str) and alias:
                    zone_by_alias[alias.casefold()] = zone

        def emergency_type(value: Any) -> str:
            normalised = value.casefold() if isinstance(value, str) else ""
            if normalised in {"dana", "rain", "flood", "inundacion", "inundación"}:
                return "flood"
            if normalised in {"fire", "incendio"}:
                return "fire"
            return "other"

        def location_for_incident(incident: dict[str, Any]) -> dict[str, Any] | None:
            triage = incident.get("triage") if isinstance(incident.get("triage"), dict) else {}
            zone = zone_by_id.get(triage.get("zoneId"))
            if not zone:
                zone_name = incident.get("zone")
                zone = zone_by_alias.get(zone_name.casefold()) if isinstance(zone_name, str) else None
            latitude = incident.get("latitude")
            longitude = incident.get("longitude")
            if latitude is not None and longitude is not None:
                return {
                    "latitude": latitude,
                    "longitude": longitude,
                    "precision": "exact",
                    "accuracyM": incident.get("accuracyM"),
                    "zoneId": zone["id"] if zone else None,
                    # `incident.zone` may contain citizen-entered free text. Do
                    # not copy it into this otherwise allowlisted operational
                    # feed when it cannot be resolved to a canonical zone.
                    "zoneCode": zone["code"] if zone else None,
                }
            if zone:
                return {
                    "latitude": zone["centroid"]["latitude"],
                    "longitude": zone["centroid"]["longitude"],
                    "precision": "zone",
                    "accuracyM": None,
                    "zoneId": zone["id"],
                    "zoneCode": zone["code"],
                }
            return None

        points: list[dict[str, Any]] = []
        for alert in alerts:
            normalised_type = emergency_type(alert.get("type"))
            for target in alert.get("zones", []):
                zone = zone_by_id.get(target.get("zoneId"))
                severity = target.get("severity") if target.get("severity") in SEVERITY_ORDER else "unknown"
                if not zone:
                    continue
                points.append({
                    "id": "alert:" + alert["id"] + ":" + zone["id"],
                    "sourceKind": "official_alert",
                    "sourceId": alert["id"],
                    "emergencyId": alert["id"],
                    "type": normalised_type,
                    "reportedType": alert.get("type"),
                    "severity": severity,
                    "priority": None,
                    "intensity": intensity_by_severity[severity],
                    "location": {
                        "latitude": zone["centroid"]["latitude"],
                        "longitude": zone["centroid"]["longitude"],
                        "precision": "zone",
                        "accuracyM": None,
                        "zoneId": zone["id"],
                        "zoneCode": zone["code"],
                    },
                    "observedAt": alert["issuedAt"],
                    "updatedAt": alert["updatedAt"],
                    "status": alert["status"],
                    "sampleSize": 1,
                })

        for incident in incidents:
            location = location_for_incident(incident)
            if not location:
                continue
            triage = incident.get("triage") if isinstance(incident.get("triage"), dict) else {}
            alert_id = clean_text(triage.get("alertId"), maximum=100)
            priority = incident.get("priority") if incident.get("priority") in {"pending", "low", "medium", "high", "critical"} else "pending"
            severity = priority if priority in SEVERITY_ORDER else "unknown"
            normalised_type = emergency_type(incident.get("type"))
            points.append({
                "id": "incident:" + incident["id"],
                "sourceKind": "incident",
                "sourceId": incident["id"],
                "emergencyId": alert_id or incident["id"],
                "type": normalised_type,
                "reportedType": incident.get("type"),
                "severity": severity,
                "priority": priority,
                "intensity": intensity_by_severity[severity],
                "location": location,
                "observedAt": incident["createdAt"],
                "updatedAt": incident["updatedAt"],
                "status": incident["status"],
                "sampleSize": 1,
            })

        points.sort(key=lambda item: (item["observedAt"], -item["intensity"], item["id"]))
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for point in points:
            grouped[point["emergencyId"]].append(point)

        def parsed_time(value: str) -> datetime | None:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except (AttributeError, TypeError, ValueError):
                return None

        def motion_between(origin: dict[str, Any], latest: dict[str, Any]) -> tuple[float | None, float | None]:
            started = parsed_time(origin["observedAt"])
            ended = parsed_time(latest["observedAt"])
            if not started or not ended or ended <= started:
                return None, None
            lat1 = math.radians(origin["location"]["latitude"])
            lat2 = math.radians(latest["location"]["latitude"])
            delta_lon = math.radians(latest["location"]["longitude"] - origin["location"]["longitude"])
            delta_lat = lat2 - lat1
            haversine = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
            distance_km = 6371.0088 * 2 * math.atan2(math.sqrt(haversine), math.sqrt(max(0.0, 1 - haversine)))
            if distance_km < 0.001:
                return None, None
            bearing_y = math.sin(delta_lon) * math.cos(lat2)
            bearing_x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lon)
            direction = (math.degrees(math.atan2(bearing_y, bearing_x)) + 360) % 360
            elapsed_hours = (ended - started).total_seconds() / 3600
            return round(direction, 1), round(distance_km / elapsed_hours, 2)

        series = []
        for emergency_id, items in grouped.items():
            reports = [item for item in items if item["sourceKind"] == "incident"]
            evolution = reports or items
            origin = evolution[0]
            latest = evolution[-1]
            origin_estimated = not bool(reports)
            direction, speed = (None, None)
            if origin["type"] in {"flood", "fire"} and len(reports) >= 2:
                direction, speed = motion_between(origin, latest)
            for sequence, point in enumerate(items):
                point["sequence"] = sequence
                point["isOrigin"] = point["id"] == origin["id"]
            series.append({
                "emergencyId": emergency_id,
                "type": origin["type"],
                "originPointId": origin["id"],
                "originEstimated": origin_estimated,
                "originBasis": "official_zone_estimate" if origin_estimated else "incident_report",
                "latestPointId": latest["id"],
                "firstObservedAt": origin["observedAt"],
                "lastObservedAt": latest["observedAt"],
                "pointCount": len(items),
                "reportCount": len(reports),
                "propagation": {
                    "directionDegrees": direction,
                    "speedKmh": speed,
                    "estimated": direction is not None and speed is not None,
                    "basis": "incident_reports" if direction is not None else "insufficient_reports",
                } if origin["type"] in {"flood", "fire"} else None,
            })
        series.sort(key=lambda item: (item["firstObservedAt"], item["emergencyId"]))

        by_type = {
            emergency: {
                "points": sum(1 for point in points if point["type"] == emergency),
                "incidents": sum(1 for point in points if point["type"] == emergency and point["sourceKind"] == "incident"),
            }
            for emergency in ("flood", "fire", "other")
        }
        return {
            "schemaVersion": 1,
            "generatedAt": generated_at,
            "refreshAfterSeconds": 5,
            "points": points,
            "series": series,
            "totals": {"points": len(points), "byType": by_type},
        }

    def _incident_access_token(self, client_request_id: str) -> str:
        digest = hmac.new(self._secret, ("incident:" + client_request_id).encode("utf-8"), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    def create_incident(self, payload: dict[str, Any], trusted_triage: bool = False) -> tuple[dict[str, Any], bool]:
        client_id = clean_text(payload.get("clientRequestId"), maximum=80)
        if not client_id or not re.fullmatch(r"[A-Za-z0-9._:-]{8,80}", client_id):
            raise ValueError("clientRequestId inválido.")
        incident_type = payload.get("type") if payload.get("type") in {"dana", "rain", "fire", "other"} else "other"
        labels = {"dana": "DANA / inundación", "rain": "Lluvia intensa", "fire": "Incendio", "other": "Otra emergencia"}
        note = clean_text(payload.get("note"), maximum=280)
        summary = note or labels[incident_type] + " comunicada desde la aplicación ciudadana."
        zone = clean_text(payload.get("zone"), maximum=100, default="Ubicación pendiente")
        lat = bounded_float(payload.get("latitude"), -90, 90)
        lon = bounded_float(payload.get("longitude"), -180, 180)
        accuracy = bounded_float(payload.get("accuracyM"), 0, 100_000)
        people = bounded_int(payload.get("people"), 1, 20, 1)
        decision = evaluate_escalation(payload.get("triageAnswers") if trusted_triage else None)
        has_triage = len(decision["answers"]) == len(TRIAGE_FIELDS)
        need = clean_text(payload.get("need"), maximum=120, default="Por confirmar")
        citizen_state = payload.get("citizenState") if payload.get("citizenState") in {"safe", "help", "trapped"} else "help"
        priority = "pending"
        if has_triage and decision["matched"]:
            priority = decision["priority"]
            need = decision["need"]
            citizen_state = decision["citizenState"]
        triage = {}
        if trusted_triage and has_triage:
            triage = {
                "answers": decision["answers"], "ruleId": decision["ruleId"],
                "policyVersion": decision["policyVersion"], "priority": priority,
                "callRecommended": bool(decision["offerEmergencyCall"]), "callMode": decision["callMode"],
                "automatic": bool(as_bool(payload.get("automaticTriage")) and decision["createIncident"]),
            }
            trace = payload.get("triageTrace") if isinstance(payload.get("triageTrace"), dict) else {}
            triage.update({
                "alertId": clean_text(trace.get("alertId"), maximum=100),
                "alertVersion": bounded_int(trace.get("alertVersion"), 1, 1_000_000, 1),
                "zoneId": clean_text(trace.get("zoneId"), maximum=100),
                "responseId": clean_text(trace.get("responseId"), maximum=100),
            })
            client_policy_version = trace.get("clientPolicyVersion")
            if isinstance(client_policy_version, int) and not isinstance(client_policy_version, bool):
                triage["clientPolicyVersion"] = client_policy_version
                triage["policyVersionMismatch"] = client_policy_version != decision["policyVersion"]
        silent = as_bool(payload.get("silent"))
        # A legacy boolean must never be presented as evidence. The counter is
        # updated only after a real file has reached the private media store.
        photo_count = 0
        now = utc_now()
        access_token = self._incident_access_token(client_id)
        access_hash = token_hash(access_token)
        with self.connect() as db:
            cursor = db.execute(
                """INSERT INTO incidents(
                    client_request_id,access_token_hash,source,incident_type,summary,note,zone,latitude,longitude,accuracy_m,
                    people,need,citizen_state,silent,contact,photo_count,status,priority,triage_json,verification,assignee,unit,instruction,delivery,
                    media_photo,media_video,version,created_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ringing',?,?,'review','Sin asignar','Pendiente','','','none','none',1,?,?)
                ON CONFLICT(client_request_id) DO NOTHING""",
                (client_id, access_hash, "app", incident_type, summary, note, zone, lat, lon, accuracy, people, need, citizen_state, int(silent), 0, photo_count, priority, json.dumps(triage, ensure_ascii=False), now, now),
            )
            created = cursor.rowcount == 1
            if created:
                incident_id = int(cursor.lastrowid)
                public_id = "VT-" + str(300000 + incident_id)
                db.execute("UPDATE incidents SET public_id=? WHERE id=?", (public_id, incident_id))
                db.execute(
                    "INSERT INTO incident_events(incident_id,event_type,detail,actor,created_at) VALUES(?,?,?,?,?)",
                    (incident_id, "received", "Aviso recibido desde la aplicación ciudadana", "citizen", now),
                )
                if triage.get("automatic"):
                    db.execute(
                        "INSERT INTO incident_events(incident_id,event_type,detail,actor,created_at) VALUES(?,?,?,?,?)",
                        (incident_id, "automatic_escalation", "Escalado automático por " + triage["ruleId"] + " · política v" + str(triage["policyVersion"]), "system", now),
                    )
            row = db.execute("SELECT * FROM incidents WHERE client_request_id=?", (client_id,)).fetchone()
        result = self._incident_public(row, include_private=True)
        result["accessToken"] = access_token
        return result, created

    def public_incident(self, public_id: str, access_token: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM incidents WHERE public_id=?", (public_id,)).fetchone()
            if not row or not hmac.compare_digest(row["access_token_hash"], token_hash(access_token or "")):
                return None
            events = db.execute("SELECT event_type,detail,actor,created_at FROM incident_events WHERE incident_id=? ORDER BY id", (row["id"],)).fetchall()
        result = self._incident_public(row, include_private=False)
        result["events"] = [dict(event) for event in events]
        return result

    def create_media_intent(self, public_id: str, access_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        kind = payload.get("kind") if payload.get("kind") in {"image", "audio", "video"} else ""
        allowed_types = {
            "image": {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"},
            "audio": {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4"},
            "video": {"video/webm", "video/mp4", "video/quicktime"},
        }
        content_type = clean_text(payload.get("contentType"), maximum=100).lower()
        file_name = clean_text(payload.get("fileName"), maximum=120, default=kind or "media")
        declared_size = bounded_int(payload.get("sizeBytes"), 1, MAX_MEDIA_BYTES, 0)
        kind_limits = {"image": 5 * 1024 * 1024, "audio": 8 * 1024 * 1024, "video": MAX_MEDIA_BYTES}
        if not kind or content_type not in allowed_types.get(kind, set()):
            raise ValueError("Formato multimedia no admitido.")
        if declared_size <= 0 or declared_size > kind_limits[kind]:
            raise ValueError("El archivo supera el límite de la demo.")
        if not as_bool(payload.get("consent")):
            raise ValueError("Es necesario confirmar el consentimiento antes de capturar o enviar el archivo.")
        now = utc_now()
        retention = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(timespec="seconds").replace("+00:00", "Z")
        upload_token = secrets.token_urlsafe(32)
        with self.connect() as db:
            incident = db.execute("SELECT * FROM incidents WHERE public_id=?", (public_id,)).fetchone()
            if not incident or not hmac.compare_digest(incident["access_token_hash"], token_hash(access_token or "")):
                raise LookupError("No se encuentra el caso o el enlace ha dejado de ser válido.")
            cursor = db.execute(
                """INSERT INTO media_assets(incident_id,upload_token_hash,kind,content_type,original_name,declared_size,status,
                   consent_at,retention_until,created_at) VALUES(?,?,?,?,?,?,'reserved',?,?,?)""",
                (incident["id"], token_hash(upload_token), kind, content_type, file_name, declared_size, now, retention, now),
            )
            media_id = "MD-" + str(500000 + int(cursor.lastrowid))
            db.execute("UPDATE media_assets SET public_id=? WHERE id=?", (media_id, cursor.lastrowid))
        return {
            "id": media_id, "incidentId": public_id, "kind": kind, "status": "reserved", "contentType": content_type,
            "maxBytes": kind_limits[kind], "uploadUrl": "/api/public/media/" + media_id, "uploadToken": upload_token,
            "retentionUntil": retention,
        }

    def store_media(self, media_id: str, upload_token: str, content_type: str, payload: bytes) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                """SELECT m.*,i.public_id AS incident_public_id,i.citizen_state,i.priority AS incident_priority
                   FROM media_assets m JOIN incidents i ON i.id=m.incident_id WHERE m.public_id=?""",
                (media_id,),
            ).fetchone()
            if not row or not hmac.compare_digest(row["upload_token_hash"], token_hash(upload_token or "")):
                raise LookupError("Autorización de carga no válida.")
            if row["status"] not in {"reserved", "failed"}:
                existing = self._media_public(db, row, include_content=False)
                existing["duplicate"] = True
                return existing
            if content_type.split(";", 1)[0].strip().lower() != row["content_type"]:
                raise ValueError("El tipo del archivo no coincide con la autorización.")
            if not payload or len(payload) > int(row["declared_size"]) or len(payload) > MAX_MEDIA_BYTES:
                raise ValueError("Tamaño multimedia no válido.")
            if not media_signature_matches(row["kind"], payload):
                raise ValueError("La firma real del archivo no coincide con su tipo.")
            digest = hashlib.sha256(payload).hexdigest()
            storage_name = secrets.token_hex(20) + ".bin"
            destination = self.media_dir / storage_name
            destination.write_bytes(payload)
            try:
                destination.chmod(0o600)
            except OSError:
                pass
            now = utc_now()
            db.execute(
                "UPDATE media_assets SET size_bytes=?,sha256=?,storage_name=?,status='ready',uploaded_at=? WHERE id=?",
                (len(payload), digest, storage_name, now, row["id"]),
            )
            suggested = "critical" if row["citizen_state"] == "trapped" else "high" if row["citizen_state"] == "help" else "medium"
            score = {"critical": 90.0, "high": 72.0, "medium": 50.0}[suggested]
            signals = ["Archivo recibido", "Firma y tamaño validados"]
            reasons = [
                "Prioridad provisional basada en la respuesta ciudadana del caso.",
                "SIMULACIÓN: el análisis cloud de contenido todavía no está conectado en la demo local.",
            ]
            db.execute(
                """INSERT INTO media_analyses(media_id,status,mode,provider,model,model_version,suggested_priority,score,confidence,
                   signals_json,reasons_json,human_status,created_at,completed_at)
                   VALUES(?,'ready','simulated','VT-01 demo rules','metadata-triage','1',?,?,NULL,?,?,'pending',?,?)
                   ON CONFLICT(media_id) DO UPDATE SET status='ready',suggested_priority=excluded.suggested_priority,
                   score=excluded.score,signals_json=excluded.signals_json,reasons_json=excluded.reasons_json,completed_at=excluded.completed_at""",
                (row["id"], suggested, score, json.dumps(signals, ensure_ascii=False), json.dumps(reasons, ensure_ascii=False), now, now),
            )
            if row["kind"] == "image":
                count = db.execute("SELECT COUNT(*) FROM media_assets WHERE incident_id=? AND kind='image' AND status='ready'", (row["incident_id"],)).fetchone()[0]
                db.execute("UPDATE incidents SET photo_count=?,media_photo='received',version=version+1,updated_at=? WHERE id=?", (count, now, row["incident_id"]))
            elif row["kind"] == "video":
                db.execute("UPDATE incidents SET media_video='received',version=version+1,updated_at=? WHERE id=?", (now, row["incident_id"]))
            db.execute(
                "INSERT INTO incident_events(incident_id,event_type,detail,actor,created_at) VALUES(?,?,?,?,?)",
                (row["incident_id"], "media_received", row["kind"] + " recibido y validado", "citizen", now),
            )
            updated = db.execute("SELECT m.*,i.public_id AS incident_public_id FROM media_assets m JOIN incidents i ON i.id=m.incident_id WHERE m.id=?", (row["id"],)).fetchone()
            return self._media_public(db, updated, include_content=False)

    def _media_public(self, db: sqlite3.Connection, row: sqlite3.Row, include_content: bool) -> dict[str, Any]:
        analysis = db.execute("SELECT * FROM media_analyses WHERE media_id=?", (row["id"],)).fetchone()
        result: dict[str, Any] = {
            "id": row["public_id"], "incidentId": row["incident_public_id"], "kind": row["kind"], "status": row["status"],
            "contentType": row["content_type"], "fileName": row["original_name"], "sizeBytes": row["size_bytes"],
            "sha256": row["sha256"], "createdAt": row["created_at"], "uploadedAt": row["uploaded_at"],
            "retentionUntil": row["retention_until"],
        }
        if include_content and row["status"] == "ready":
            result["contentUrl"] = "/api/admin/media/" + row["public_id"] + "/content"
        if analysis:
            result["analysis"] = {
                "status": analysis["status"], "mode": analysis["mode"], "provider": analysis["provider"],
                "model": analysis["model"], "modelVersion": analysis["model_version"],
                "suggestedPriority": analysis["suggested_priority"], "score": analysis["score"],
                "confidence": analysis["confidence"], "signals": json.loads(analysis["signals_json"] or "[]"),
                "reasons": json.loads(analysis["reasons_json"] or "[]"), "humanStatus": analysis["human_status"],
                "operatorPriority": analysis["operator_priority"], "overrideReason": analysis["override_reason"],
                "completedAt": analysis["completed_at"], "reviewedAt": analysis["reviewed_at"],
            }
        return result

    def list_media(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """SELECT m.*,i.public_id AS incident_public_id FROM media_assets m
                   JOIN incidents i ON i.id=m.incident_id ORDER BY m.created_at DESC LIMIT 200"""
            ).fetchall()
            return [self._media_public(db, row, include_content=True) for row in rows]

    def media_content(self, media_id: str) -> tuple[Path, str, str] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM media_assets WHERE public_id=? AND status='ready'", (media_id,)).fetchone()
        if not row or not row["storage_name"]:
            return None
        path = (self.media_dir / row["storage_name"]).resolve()
        try:
            path.relative_to(self.media_dir.resolve())
        except ValueError:
            return None
        if not path.is_file():
            return None
        return path, row["content_type"], row["original_name"]

    def review_media(self, media_id: str, payload: dict[str, Any], actor: dict[str, Any]) -> dict[str, Any]:
        human_status = payload.get("humanStatus") if payload.get("humanStatus") in {"confirmed", "overridden", "rejected"} else ""
        priority = payload.get("operatorPriority") if payload.get("operatorPriority") in {None, "low", "medium", "high", "critical"} else "invalid"
        reason = clean_text(payload.get("reason"), maximum=280)
        if not human_status or priority == "invalid" or (human_status in {"overridden", "rejected"} and not reason):
            raise ValueError("Revisión incompleta. Indica estado, prioridad y motivo cuando corresponda.")
        with self.connect() as db:
            row = db.execute(
                """SELECT m.*,i.public_id AS incident_public_id FROM media_assets m
                   JOIN incidents i ON i.id=m.incident_id WHERE m.public_id=?""",
                (media_id,),
            ).fetchone()
            if not row:
                raise LookupError("Archivo no encontrado.")
            analysis = db.execute("SELECT id FROM media_analyses WHERE media_id=?", (row["id"],)).fetchone()
            if not analysis:
                raise LookupError("Análisis no disponible.")
            now = utc_now()
            db.execute(
                "UPDATE media_analyses SET human_status=?,operator_priority=?,override_reason=?,reviewed_by=?,reviewed_at=? WHERE media_id=?",
                (human_status, priority, reason, actor["id"], now, row["id"]),
            )
            self._audit(db, actor["id"], "media_reviewed", media_id, human_status + ("; " + reason if reason else ""))
            updated = db.execute(
                "SELECT m.*,i.public_id AS incident_public_id FROM media_assets m JOIN incidents i ON i.id=m.incident_id WHERE m.id=?",
                (row["id"],),
            ).fetchone()
            return self._media_public(db, updated, include_content=True)

    def list_incidents(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM incidents ORDER BY updated_at DESC,id DESC LIMIT ?", (max(1, min(limit, 200)),)).fetchall()
        return [self._incident_public(row, include_private=True) for row in rows]

    def update_incident(self, public_id: str, payload: dict[str, Any], actor: dict[str, Any]) -> dict[str, Any]:
        allowed_values = {
            "status": {"ringing", "accepted", "closed"},
            "priority": {"pending", "critical", "high", "medium", "low"},
            "verification": {"review", "confirmed", "unconfirmed"},
            "delivery": {"", "Enviado", "Recibido", "Leído"},
            "mediaPhoto": {"none", "requested", "received"},
            "mediaVideo": {"none", "requested", "received"},
        }
        text_fields = {"assignee": ("assignee", 80), "unit": ("unit", 80), "instruction": ("instruction", 500)}
        assignments: list[str] = []
        values: list[Any] = []
        changes: list[str] = []
        with self.connect() as db:
            row = db.execute("SELECT * FROM incidents WHERE public_id=?", (public_id,)).fetchone()
            if not row:
                raise LookupError("Incidencia no encontrada.")
            expected = payload.get("version")
            if expected is not None and int(expected) != int(row["version"]):
                raise RuntimeError("version_conflict")
            for api_name, choices in allowed_values.items():
                if api_name not in payload:
                    continue
                value = payload[api_name]
                if value not in choices:
                    raise ValueError("Valor inválido para " + api_name)
                column = {"mediaPhoto": "media_photo", "mediaVideo": "media_video"}.get(api_name, api_name)
                assignments.append(column + "=?")
                values.append(value)
                changes.append(api_name + "=" + str(value))
            for api_name, (column, maximum) in text_fields.items():
                if api_name in payload:
                    value = clean_text(payload[api_name], maximum=maximum)
                    assignments.append(column + "=?")
                    values.append(value)
                    changes.append(api_name + " actualizado")
            if "contact" in payload:
                assignments.append("contact=?")
                values.append(int(as_bool(payload["contact"])))
                changes.append("contact=" + str(as_bool(payload["contact"])).lower())
            if not assignments:
                return self._incident_public(row, include_private=True)
            assignments.extend(["version=version+1", "updated_at=?"])
            values.append(utc_now())
            values.append(public_id)
            db.execute("UPDATE incidents SET " + ",".join(assignments) + " WHERE public_id=?", values)
            updated = db.execute("SELECT * FROM incidents WHERE public_id=?", (public_id,)).fetchone()
            detail = "; ".join(changes)
            db.execute(
                "INSERT INTO incident_events(incident_id,event_type,detail,actor,created_at) VALUES(?,?,?,?,?)",
                (updated["id"], "operator_update", detail, actor["username"], utc_now()),
            )
            self._audit(db, actor["id"], "incident_updated", public_id, detail)
        return self._incident_public(updated, include_private=True)

    def _incident_public(self, row: sqlite3.Row, include_private: bool) -> dict[str, Any]:
        try:
            triage = json.loads(row["triage_json"] or "{}")
        except (ValueError, TypeError):
            triage = {}
        result = {
            "id": row["public_id"],
            "clientRequestId": row["client_request_id"],
            "source": row["source"],
            "type": row["incident_type"],
            "summary": row["summary"],
            "zone": row["zone"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "accuracyM": row["accuracy_m"],
            "people": int(row["people"]),
            "need": row["need"],
            "citizenState": row["citizen_state"],
            "silent": bool(row["silent"]),
            "contact": bool(row["contact"]),
            "photoCount": int(row["photo_count"]),
            "status": row["status"],
            "priority": row["priority"],
            "triage": triage,
            "verification": row["verification"],
            "assignee": row["assignee"],
            "unit": row["unit"],
            "instruction": row["instruction"],
            "delivery": row["delivery"],
            "mediaRequests": {"photo": row["media_photo"], "video": row["media_video"]},
            "version": int(row["version"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        if include_private:
            result["hasPreciseLocation"] = row["latitude"] is not None and row["longitude"] is not None
        return result

    def _checkin_public(self, row: sqlite3.Row, *, created: bool) -> dict[str, Any]:
        client_policy_version = row["client_policy_version"]
        return {
            "id": row["public_id"],
            "clientRequestId": row["client_request_id"],
            "alertId": row["alert_id"],
            "alertVersion": int(row["alert_version"]),
            "alertType": row["alert_type"],
            "zoneId": row["zone"],
            "zone": row["zone_code"],
            "applicable": bool(row["applicable"]),
            "received": bool(row["received"]),
            "understood": None if row["understood"] is None else bool(row["understood"]),
            "canAct": None if row["can_act"] is None else bool(row["can_act"]),
            "needsHelp": None if row["needs_help"] is None else bool(row["needs_help"]),
            "danger": None if row["danger"] is None else bool(row["danger"]),
            "knowsAction": None if row["knows_action"] is None else bool(row["knows_action"]),
            "people": int(row["people"]),
            "precision": row["precision"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "clientPolicyVersion": int(client_policy_version) if client_policy_version is not None else None,
            "serverReceivedAt": row["created_at"],
            "updated": not created,
        }

    def upsert_checkin(self, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        client_id = clean_text(payload.get("clientRequestId"), maximum=80)
        if not client_id or not re.fullmatch(r"[A-Za-z0-9._:-]{8,80}", client_id):
            raise ValueError("clientRequestId inválido.")
        alert_id = clean_text(payload.get("alertId"), maximum=100, default="ALERT-DEMO-VALENCIA-01")
        alert_version = bounded_int(payload.get("alertVersion"), 1, 1_000_000, 1)
        raw_policy_version = payload.get("policyVersion")
        client_policy_version = (
            raw_policy_version
            if isinstance(raw_policy_version, int) and not isinstance(raw_policy_version, bool)
            and 1 <= raw_policy_version <= 1_000_000
            else None
        )
        applicable = as_bool(payload.get("applicable"), True)
        received = as_bool(payload.get("received")) if applicable else False
        understood = payload.get("understood") if isinstance(payload.get("understood"), bool) and applicable else None
        can_act = payload.get("canAct") if isinstance(payload.get("canAct"), bool) and applicable else None
        needs_help = payload.get("needsHelp") if isinstance(payload.get("needsHelp"), bool) and applicable else None
        danger = payload.get("danger") if isinstance(payload.get("danger"), bool) and applicable else None
        knows_action = payload.get("knowsAction") if isinstance(payload.get("knowsAction"), bool) and applicable else None
        allowed_reasons = {"mobility", "transport", "dependents", "medication", "blocked", "other", "private"}
        reasons = [item for item in payload.get("reasons", []) if isinstance(item, str) and item in allowed_reasons][:7]
        people = bounded_int(payload.get("people"), 1, 20, 1)
        precision = payload.get("precision") if payload.get("precision") in {"none", "zone", "street", "building", "exact"} else "none"
        lat = bounded_float(payload.get("latitude"), -90, 90) if precision == "exact" else None
        lon = bounded_float(payload.get("longitude"), -180, 180) if precision == "exact" else None
        now = utc_now()
        with self.connect() as db:
            persisted = db.execute(
                """SELECT r.*,a.alert_type,z.code AS zone_code
                   FROM alert_responses r
                   JOIN public_alerts a ON a.id=r.alert_id
                   LEFT JOIN zones z ON z.id=r.zone
                   WHERE r.client_request_id=?""",
                (client_id,),
            ).fetchone()
            if persisted:
                return self._checkin_public(persisted, created=False), False
            alert = db.execute("SELECT id,version,alert_type,status,expires_at FROM public_alerts WHERE id=?", (alert_id,)).fetchone()
            if not alert or alert["status"] != "active" or alert["expires_at"] <= now:
                raise ValueError("La alerta ya no está activa o no existe.")
            if "alertVersion" in payload and alert_version != int(alert["version"]):
                raise ValueError("La alerta ha cambiado. Actualiza la información antes de responder.")
            alert_version = int(alert["version"])
            zone_row = self._normalise_zone(db, payload.get("zoneId") or payload.get("zone") or "poblats-maritims")
            if not zone_row:
                raise ValueError("Zona no reconocida.")
            targeted = db.execute("SELECT 1 FROM alert_zones WHERE alert_id=? AND zone_id=?", (alert_id, zone_row["id"])).fetchone()
            if applicable and not targeted:
                raise ValueError("La alerta seleccionada no corresponde a esa zona.")
            zone = zone_row["id"]
            cursor = db.execute(
                """INSERT INTO alert_responses(
                    client_request_id,alert_id,alert_version,client_policy_version,zone,applicable,received,
                    understood,can_act,needs_help,danger,knows_action,reasons_json,people,precision,
                    latitude,longitude,created_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(client_request_id) DO NOTHING""",
                (client_id, alert_id, alert_version, client_policy_version, zone, int(applicable), int(received),
                 understood, can_act, needs_help, danger, knows_action, json.dumps(reasons), people, precision,
                 lat, lon, now, now),
            )
            created = cursor.rowcount == 1
            if created:
                public_id = "CK-" + str(400000 + int(cursor.lastrowid))
                db.execute("UPDATE alert_responses SET public_id=? WHERE id=?", (public_id, cursor.lastrowid))
            persisted = db.execute(
                """SELECT r.*,a.alert_type,z.code AS zone_code
                   FROM alert_responses r
                   JOIN public_alerts a ON a.id=r.alert_id
                   LEFT JOIN zones z ON z.id=r.zone
                   WHERE r.client_request_id=?""",
                (client_id,),
            ).fetchone()
        return self._checkin_public(persisted, created=created), created

    def checkin_aggregates(self, alert_id: str | None = None) -> list[dict[str, Any]]:
        with self.connect() as db:
            if alert_id:
                rows = db.execute("SELECT * FROM alert_responses WHERE alert_id=? ORDER BY id", (alert_id,)).fetchall()
            else:
                rows = db.execute("SELECT * FROM alert_responses ORDER BY id").fetchall()
            zone_rows = {row["id"]: row for row in db.execute("SELECT * FROM zones").fetchall()}
        grouped: dict[tuple[str, str], dict[str, Any]] = {}
        for row in rows:
            zone_id = row["zone"]
            zone = zone_rows.get(zone_id)
            key = (row["alert_id"], zone_id)
            item = grouped.setdefault(key, {
                "alertId": row["alert_id"], "alertVersion": int(row["alert_version"]),
                "zoneId": zone_id, "zone": zone["code"] if zone else zone_id.upper(),
                "responses": 0, "applicable": 0, "notApplicable": 0, "canAct": 0,
                "cannotAct": 0, "notUnderstood": 0, "needsHelp": 0, "peopleNeedingHelp": 0,
                "inDanger": 0, "knowsAction": 0, "doesNotKnowAction": 0,
                "reasons": defaultdict(int), "lastUpdatedAt": row["updated_at"],
            })
            item["responses"] += 1
            item["lastUpdatedAt"] = max(item["lastUpdatedAt"], row["updated_at"])
            if not row["applicable"]:
                item["notApplicable"] += 1
                continue
            item["applicable"] += 1
            if row["understood"] == 0:
                item["notUnderstood"] += 1
            elif row["understood"] == 1 and row["can_act"] == 1:
                item["canAct"] += 1
            elif row["understood"] == 1 and row["can_act"] == 0:
                item["cannotAct"] += 1
            if row["needs_help"] == 1:
                item["needsHelp"] += 1
                item["peopleNeedingHelp"] += int(row["people"])
            if row["danger"] == 1:
                item["inDanger"] += 1
            if row["knows_action"] == 1:
                item["knowsAction"] += 1
            elif row["knows_action"] == 0:
                item["doesNotKnowAction"] += 1
            for reason in json.loads(row["reasons_json"] or "[]"):
                item["reasons"][reason] += 1
        result = []
        for item in grouped.values():
            item["reasons"] = dict(item["reasons"])
            result.append(item)
        return sorted(result, key=lambda item: (item["alertId"], item["zone"]))

    def _audit(self, db: sqlite3.Connection, actor_id: int | None, action: str, target: str, detail: str) -> None:
        db.execute(
            "INSERT INTO audit_events(actor_admin_id,action,target,detail,created_at) VALUES(?,?,?,?,?)",
            (actor_id, action, target, detail, utc_now()),
        )


class RateLimiter:
    def __init__(self):
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] < now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)


LOGIN_LIMITER = RateLimiter()
PUBLIC_LIMITER = RateLimiter()


class VTServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], store: Store, public_dir: Path):
        super().__init__(address, VTHandler)
        self.store = store
        self.public_dir = Path(public_dir).resolve()


class VTHandler(BaseHTTPRequestHandler):
    server: VTServer
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _security_headers(self, *, api: bool = False) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(self), geolocation=(self), microphone=(self)")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        )
        self.send_header("Cache-Control", "no-store" if api else "no-cache")

    def _json(self, status: int, payload: dict[str, Any], extra_headers: list[tuple[str, str]] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._security_headers(api=True)
        for name, value in extra_headers or []:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, code: str, message: str) -> None:
        # Cierra la conexión en errores: algunas rutas rechazan la autorización
        # antes de leer el cuerpo y no debemos interpretarlo como otra petición.
        self.close_connection = True
        self._json(status, {"ok": False, "error": code, "message": message}, [("Connection", "close")])

    def _read_json(self) -> dict[str, Any] | None:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "json_required", "Se requiere Content-Type application/json.")
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_JSON_BYTES:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "invalid_size", "Tamaño de solicitud no válido.")
            return None
        try:
            payload = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error(HTTPStatus.BAD_REQUEST, "invalid_json", "JSON no válido.")
            return None
        if not isinstance(payload, dict):
            self._error(HTTPStatus.BAD_REQUEST, "object_required", "El cuerpo debe ser un objeto JSON.")
            return None
        return payload

    def _session_token(self) -> str | None:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return None
        value = cookie.get("vt_session")
        return value.value if value else None

    def _auth(self, *, superadmin: bool = False, csrf: bool = False, allow_password_change: bool = False) -> dict[str, Any] | None:
        session = self.server.store.session(self._session_token())
        if not session:
            self._error(HTTPStatus.UNAUTHORIZED, "authentication_required", "Inicia sesión para acceder a la central.")
            return None
        if session["mustChangePassword"] and not allow_password_change:
            self._error(HTTPStatus.FORBIDDEN, "password_change_required", "Debes cambiar la contraseña temporal.")
            return None
        if superadmin and session["role"] != "SuperAdmin":
            self._error(HTTPStatus.FORBIDDEN, "superadmin_required", "Solo un superadministrador puede realizar esta acción.")
            return None
        if csrf and not hmac.compare_digest(self.headers.get("X-CSRF-Token", ""), session["csrfToken"]):
            self._error(HTTPStatus.FORBIDDEN, "csrf_invalid", "La sesión ha cambiado. Recarga la página.")
            return None
        return session

    def _cookie_header(self, token: str, max_age: int) -> str:
        secure = os.environ.get("VT_COOKIE_SECURE") == "1" or self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        value = f"vt_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}"
        return value + ("; Secure" if secure else "")

    def _client_ip(self) -> str:
        peer = self.client_address[0]
        if peer in {"127.0.0.1", "::1"}:
            forwarded = self.headers.get("X-Forwarded-For", "")
            if forwarded:
                candidate = forwarded.split(",", 1)[0].strip()
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    pass
        return peer

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path == "/api/health":
            self._json(200, {"ok": True, "service": "vt01-local", "serverTime": utc_now()})
            return
        if path == "/api/auth/session":
            session = self.server.store.session(self._session_token())
            if not session:
                self._error(401, "authentication_required", "No hay una sesión activa.")
            else:
                self._json(200, {"ok": True, "admin": session})
            return
        if path == "/api/public/zones":
            self._json(200, {"ok": True, "zones": self.server.store.list_zones(), "serverTime": utc_now()})
            return
        if path == "/api/public/alerts":
            query = parse_qs(parsed.query)
            zone_id = clean_text((query.get("zoneId") or [""])[0], maximum=100)
            scope = (query.get("scope") or ["all"])[0]
            if scope not in {"local", "all"}:
                scope = "all"
            self._json(200, {"ok": True, "alerts": self.server.store.list_alerts(zone_id, scope), "serverTime": utc_now()})
            return
        if path == "/api/public/escalation-policy":
            self._json(200, {"ok": True, "policy": load_escalation_policy(), "serverTime": utc_now()})
            return
        if path == "/api/admin/dashboard":
            session = self._auth()
            if not session:
                return
            server_time = utc_now()
            self._json(200, {
                "ok": True,
                "serverTime": server_time,
                "incidents": self.server.store.list_incidents(),
                "checkinAggregates": self.server.store.checkin_aggregates(),
                "publicAlerts": self.server.store.list_alerts(),
                "zoneCriticalities": self.server.store.zone_criticalities(),
                "heatmapFeed": self.server.store.heatmap_feed(server_time),
                "media": self.server.store.list_media(),
            })
            return
        if path == "/api/admins":
            session = self._auth(superadmin=True)
            if not session:
                return
            self._json(200, {"ok": True, "admins": self.server.store.list_admins()})
            return
        match = re.fullmatch(r"/api/public/incidents/(VT-[0-9]{6})", path)
        if match:
            token = self.headers.get("X-Case-Token", "")
            incident = self.server.store.public_incident(match.group(1), token)
            if not incident:
                self._error(404, "case_not_found", "No se encuentra el caso o el enlace ha dejado de ser válido.")
            else:
                self._json(200, {"ok": True, "incident": incident})
            return
        match = re.fullmatch(r"/api/admin/media/(MD-[0-9]{6})/content", path)
        if match:
            session = self._auth()
            if not session:
                return
            item = self.server.store.media_content(match.group(1))
            if not item:
                self._error(404, "media_not_found", "Archivo no disponible.")
                return
            file_path, content_type, original_name = item
            body = file_path.read_bytes()
            safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", original_name)[:100] or "media"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Disposition", 'inline; filename="' + safe_name + '"')
            self._security_headers(api=True)
            self.end_headers()
            self.wfile.write(body)
            return
        if path.startswith("/api/"):
            self._error(404, "not_found", "Ruta API no encontrada.")
            return
        self._serve_static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/api/auth/login":
            payload = self._read_json()
            if payload is None:
                return
            username = clean_text(payload.get("username"), maximum=64)
            key = "login:" + self._client_ip() + ":" + username.casefold()
            if not LOGIN_LIMITER.allow(key, 8, 15 * 60):
                self._error(429, "rate_limited", "Demasiados intentos. Espera unos minutos.")
                return
            password = payload.get("password") if isinstance(payload.get("password"), str) else ""
            admin = self.server.store.authenticate(username, password)
            if not admin:
                self._error(401, "invalid_credentials", "Usuario o contraseña incorrectos.")
                return
            LOGIN_LIMITER.clear(key)
            token, session = self.server.store.create_session(admin["id"])
            self._json(200, {"ok": True, "admin": session}, [("Set-Cookie", self._cookie_header(token, SESSION_SECONDS))])
            return
        if path == "/api/auth/logout":
            session = self._auth(csrf=True, allow_password_change=True)
            if not session:
                return
            self.server.store.delete_session(self._session_token())
            self._json(200, {"ok": True}, [("Set-Cookie", self._cookie_header("", 0))])
            return
        if path == "/api/auth/change-password":
            session = self._auth(csrf=True, allow_password_change=True)
            if not session:
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                self.server.store.change_password(session["id"], str(payload.get("currentPassword", "")), str(payload.get("newPassword", "")))
            except (ValueError, PermissionError) as error:
                self._error(400, "password_rejected", str(error))
                return
            self._json(200, {"ok": True})
            return
        if path == "/api/admins":
            session = self._auth(superadmin=True, csrf=True)
            if not session:
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                admin = self.server.store.create_invited_admin(session["id"], payload.get("username", ""), payload.get("displayName", ""), payload.get("role", "Operator"))
            except ValueError as error:
                self._error(409 if "existe" in str(error) else 400, "admin_not_created", str(error))
                return
            except PermissionError as error:
                self._error(403, "superadmin_required", str(error))
                return
            self._json(201, {"ok": True, "admin": admin})
            return
        if path == "/api/public/incidents":
            if not PUBLIC_LIMITER.allow("incident:" + self._client_ip(), 40, 60 * 60):
                self._error(429, "rate_limited", "Se ha alcanzado el límite temporal de avisos para esta conexión.")
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                incident, created = self.server.store.create_incident(payload)
            except ValueError as error:
                self._error(400, "incident_rejected", str(error))
                return
            self._json(201 if created else 200, {"ok": True, "incident": incident, "serverReceivedAt": incident["createdAt"], "duplicate": not created})
            return
        if path == "/api/public/checkins":
            if not PUBLIC_LIMITER.allow("checkin:" + self._client_ip(), 120, 60 * 60):
                self._error(429, "rate_limited", "Se ha alcanzado el límite temporal de respuestas para esta conexión.")
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                response, created = self.server.store.upsert_checkin(payload)
            except ValueError as error:
                self._error(400, "checkin_rejected", str(error))
                return
            answers = {}
            if response["applicable"] and response["received"]:
                answers = {
                    field: response[field]
                    for field in ("danger", "knowsAction", "needsHelp")
                    if isinstance(response[field], bool)
                }
            escalation = evaluate_escalation(answers)
            escalation["clientPolicyVersion"] = response["clientPolicyVersion"]
            escalation["policyVersionMismatch"] = (
                response["clientPolicyVersion"] is not None
                and response["clientPolicyVersion"] != escalation["policyVersion"]
            )
            incident = None
            if response["applicable"] and response["received"] and escalation["createIncident"]:
                incident_type = {"flood": "dana", "rain": "rain", "fire": "fire"}.get(response["alertType"], "other")
                incident_payload = {
                    "clientRequestId": "triage-" + response["id"],
                    "type": incident_type,
                    "note": "",
                    "zone": response["zone"],
                    "latitude": response["latitude"], "longitude": response["longitude"],
                    "people": response["people"],
                    "need": escalation["need"], "citizenState": escalation["citizenState"],
                    "silent": False, "triageAnswers": answers, "automaticTriage": True,
                    "triageTrace": {
                        "alertId": response["alertId"], "alertVersion": response["alertVersion"],
                        "zoneId": response["zoneId"], "responseId": response["id"],
                        "clientPolicyVersion": response["clientPolicyVersion"],
                    },
                }
                try:
                    incident, _ = self.server.store.create_incident(incident_payload, trusted_triage=True)
                except ValueError as error:
                    self._error(400, "automatic_incident_rejected", str(error))
                    return
            self._json(201 if created else 200, {
                "ok": True, "response": response, "escalation": escalation, "incident": incident,
            })
            return
        match = re.fullmatch(r"/api/public/incidents/(VT-[0-9]{6})/media-intents", path)
        if match:
            if not PUBLIC_LIMITER.allow("media-intent:" + self._client_ip(), 60, 60 * 60):
                self._error(429, "rate_limited", "Se ha alcanzado el límite temporal de archivos.")
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                media = self.server.store.create_media_intent(match.group(1), self.headers.get("X-Case-Token", ""), payload)
            except LookupError as error:
                self._error(404, "case_not_found", str(error))
                return
            except ValueError as error:
                self._error(400, "media_rejected", str(error))
                return
            self._json(201, {"ok": True, "media": media})
            return
        self._error(404, "not_found", "Ruta API no encontrada.")

    def do_PUT(self) -> None:
        path = urlparse(self.path).path.rstrip("/")
        match = re.fullmatch(r"/api/public/media/(MD-[0-9]{6})", path)
        if not match:
            self._error(404, "not_found", "Ruta API no encontrada.")
            return
        if not PUBLIC_LIMITER.allow("media-upload:" + self._client_ip(), 60, 60 * 60):
            self._error(429, "rate_limited", "Se ha alcanzado el límite temporal de cargas.")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_MEDIA_BYTES:
            self._error(413, "invalid_size", "Tamaño multimedia no válido.")
            return
        body = self.rfile.read(length)
        try:
            media = self.server.store.store_media(
                match.group(1), self.headers.get("X-Media-Token", ""), self.headers.get("Content-Type", ""), body
            )
        except LookupError as error:
            self._error(404, "media_not_found", str(error))
            return
        except ValueError as error:
            self._error(400, "media_rejected", str(error))
            return
        self._json(200, {"ok": True, "media": media})

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path.rstrip("/")
        media_match = re.fullmatch(r"/api/admin/media/(MD-[0-9]{6})/review", path)
        if media_match:
            session = self._auth(csrf=True)
            if not session:
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                media = self.server.store.review_media(media_match.group(1), payload, session)
            except LookupError as error:
                self._error(404, "media_not_found", str(error))
                return
            except ValueError as error:
                self._error(400, "media_review_rejected", str(error))
                return
            self._json(200, {"ok": True, "media": media})
            return
        match = re.fullmatch(r"/api/admin/incidents/(VT-[0-9]{6})", path)
        if not match:
            self._error(404, "not_found", "Ruta API no encontrada.")
            return
        session = self._auth(csrf=True)
        if not session:
            return
        payload = self._read_json()
        if payload is None:
            return
        try:
            incident = self.server.store.update_incident(match.group(1), payload, session)
        except LookupError as error:
            self._error(404, "incident_not_found", str(error))
            return
        except RuntimeError:
            self._error(409, "version_conflict", "La incidencia cambió en otro puesto. Se actualizará la vista.")
            return
        except ValueError as error:
            self._error(400, "invalid_update", str(error))
            return
        self._json(200, {"ok": True, "incident": incident})

    def _serve_static(self, path: str) -> None:
        aliases = {"/": "index.html", "/ciudadano": "ciudadano.html", "/operador": "operador.html", "/login": "operador.html"}
        relative = aliases.get(path, unquote(path).lstrip("/"))
        target = (self.server.public_dir / relative).resolve()
        try:
            target.relative_to(self.server.public_dir)
        except ValueError:
            self._error(403, "forbidden", "Ruta no permitida.")
            return
        if not target.is_file():
            self._error(404, "not_found", "Página no encontrada.")
            return
        mime = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".webmanifest": "application/manifest+json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
        }.get(target.suffix.lower(), "application/octet-stream")
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self._security_headers(api=False)
        self.end_headers()
        self.wfile.write(body)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Demo conectada València Resiliente")
    parser.add_argument("--data-dir", default=os.environ.get("VT_DATA_DIR", str(DEFAULT_DATA_DIR)))
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init-admin", help="Crear el primer superadministrador")
    init.add_argument("--username", required=True)
    init.add_argument("--display-name", default="Administrador principal")
    init.add_argument("--password-stdin", action="store_true")
    serve = sub.add_parser("serve", help="Iniciar el servidor local")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=4173)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    data_dir = Path(args.data_dir).expanduser().resolve()
    store = Store(data_dir / "vt01.db", data_dir / "token-secret.key")
    if args.command == "init-admin":
        if args.password_stdin:
            password = sys.stdin.readline().rstrip("\n")
        else:
            password = getpass.getpass("Contraseña (mínimo 12, mayúscula, minúscula y número): ")
            repeat = getpass.getpass("Repite la contraseña: ")
            if password != repeat:
                print("Las contraseñas no coinciden.", file=sys.stderr)
                return 2
        try:
            admin = store.create_bootstrap_admin(args.username, args.display_name, password)
        except ValueError as error:
            print(str(error), file=sys.stderr)
            return 2
        print("Superadministrador creado:", admin["username"])
        return 0
    if store.admin_count() == 0:
        print("No existe ningún administrador. Ejecuta primero:", file=sys.stderr)
        print(f"  {sys.executable} server.py --data-dir {data_dir} init-admin --username admin", file=sys.stderr)
        return 2
    if not PUBLIC_DIR.is_dir():
        print(f"No se encuentra el directorio web: {PUBLIC_DIR}", file=sys.stderr)
        return 2
    httpd = VTServer((args.host, args.port), store, PUBLIC_DIR)
    host, port = httpd.server_address[:2]
    print(f"VT-01 disponible en http://{host}:{port}")
    print(f"Ciudadanía: http://{host}:{port}/ciudadano")
    print(f"Central:    http://{host}:{port}/operador")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
