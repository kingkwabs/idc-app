import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional

import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from flask import g, jsonify, request

from database import db_session
from models import AuthSession, Employee


SESSION_COOKIE_NAME = "idc_session"
CSRF_COOKIE_NAME = "idc_csrf"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_PASSWORD_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
_DUMMY_PASSWORD_HASH = _PASSWORD_HASHER.hash("idc-invalid-login-sentinel")
_LOGIN_ATTEMPTS: OrderedDict[str, list[float]] = OrderedDict()
_LOGIN_ATTEMPTS_LOCK = threading.Lock()
_COMMON_PASSWORDS = {
	"adminpass123",
	"password1234",
	"password123!",
	"qwerty123456",
	"letmein123456",
}


def utcnow() -> datetime:
	return datetime.now(timezone.utc).replace(tzinfo=None)


def get_jwt_secret() -> str:
	secret = os.getenv("JWT_SECRET")
	if not secret:
		raise RuntimeError("JWT_SECRET not set")
	return secret


def create_access_token(sub: str, ttl_seconds: int = 10 * 60, extra_claims: dict = None) -> str:
	"""Create a short-lived signed token for non-session purposes such as OAuth state."""
	now = int(time.time())
	payload = {
		"sub": sub,
		"iat": now,
		"exp": now + ttl_seconds,
		# This is a JWT claim marker, not a credential.
		"token_type": "signed_state",  # nosec B105
	}
	if extra_claims:
		payload.update(extra_claims)
	return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


def verify_token(token: str) -> dict:
	payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
	if payload.get("token_type") != "signed_state":
		raise jwt.InvalidTokenError("invalid token type")
	return payload


def normalize_email(value: str) -> str:
	return value.strip().lower()


def hash_secret(value: str) -> str:
	return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
	return _PASSWORD_HASHER.hash(password)


def verify_password(password: str, password_hash: Optional[str]) -> bool:
	candidate_hash = password_hash or _DUMMY_PASSWORD_HASH
	if candidate_hash.startswith("$argon2"):
		try:
			return _PASSWORD_HASHER.verify(candidate_hash, password)
		except (InvalidHashError, VerificationError, VerifyMismatchError):
			return False
	try:
		return bcrypt.checkpw(password.encode("utf-8"), candidate_hash.encode("utf-8"))
	except (ValueError, TypeError):
		try:
			_PASSWORD_HASHER.verify(_DUMMY_PASSWORD_HASH, password)
		except (InvalidHashError, VerificationError, VerifyMismatchError):
			pass
		return False


def password_hash_needs_upgrade(password_hash: str) -> bool:
	if not password_hash.startswith("$argon2"):
		return True
	try:
		return _PASSWORD_HASHER.check_needs_rehash(password_hash)
	except InvalidHashError:
		return True


def password_policy_errors(password: str, email: Optional[str] = None) -> list[str]:
	errors = []
	if len(password) < 12:
		errors.append("Password must be at least 12 characters.")
	if len(password) > 128:
		errors.append("Password must be at most 128 characters.")
	if password.lower() in _COMMON_PASSWORDS:
		errors.append("Choose a less common password.")
	if len(set(password)) < 5:
		errors.append("Choose a less repetitive password.")
	if email:
		local_part = normalize_email(email).split("@", 1)[0]
		if len(local_part) >= 4 and local_part in password.lower():
			errors.append("Password must not contain your email name.")
	return errors


def login_rate_limit_key(email: str) -> str:
	forwarded_for = request.headers.get("X-Forwarded-For", "")
	client_ip = forwarded_for.split(",", 1)[0].strip() or request.remote_addr or "unknown"
	return f"{client_ip}:{normalize_email(email)}"


def consume_login_attempt(key: str) -> bool:
	window_seconds = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "900"))
	max_attempts = int(os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS", "10"))
	max_keys = max(int(os.getenv("LOGIN_RATE_LIMIT_MAX_KEYS", "10000")), 1)
	now = time.monotonic()
	with _LOGIN_ATTEMPTS_LOCK:
		recent = [stamp for stamp in _LOGIN_ATTEMPTS.get(key, []) if now - stamp < window_seconds]
		if len(recent) >= max_attempts:
			_LOGIN_ATTEMPTS[key] = recent
			_LOGIN_ATTEMPTS.move_to_end(key)
			return False
		recent.append(now)
		if key not in _LOGIN_ATTEMPTS and len(_LOGIN_ATTEMPTS) >= max_keys:
			_LOGIN_ATTEMPTS.popitem(last=False)
		_LOGIN_ATTEMPTS[key] = recent
		_LOGIN_ATTEMPTS.move_to_end(key)
		return True


def clear_login_attempts(key: str) -> None:
	with _LOGIN_ATTEMPTS_LOCK:
		_LOGIN_ATTEMPTS.pop(key, None)


def _session_ttl() -> timedelta:
	return timedelta(hours=int(os.getenv("AUTH_SESSION_HOURS", "12")))


def cookie_secure() -> bool:
	configured = os.getenv("SESSION_COOKIE_SECURE")
	if configured is not None:
		return configured.strip().lower() not in {"0", "false", "no"}
	return bool(os.getenv("RENDER")) or os.getenv("APP_ENV", "").lower() == "production"


def create_auth_session(session, employee: Employee) -> tuple[str, str, AuthSession]:
	raw_token = secrets.token_urlsafe(32)
	raw_csrf = secrets.token_urlsafe(32)
	now = utcnow()
	record = AuthSession(
		employee_id=employee.id,
		token_hash=hash_secret(raw_token),
		csrf_token_hash=hash_secret(raw_csrf),
		expires_at=now + _session_ttl(),
		created_at=now,
		last_seen_at=now,
	)
	session.add(record)
	session.flush()
	return raw_token, raw_csrf, record


def set_auth_cookies(response, raw_token: str, raw_csrf: str, expires_at: datetime):
	max_age = max(int((expires_at - utcnow()).total_seconds()), 0)
	common = {
		"secure": cookie_secure(),
		"samesite": "Lax",
		"path": "/",
		"max_age": max_age,
	}
	response.set_cookie(SESSION_COOKIE_NAME, raw_token, httponly=True, **common)
	response.set_cookie(CSRF_COOKIE_NAME, raw_csrf, httponly=False, **common)
	return response


def clear_auth_cookies(response):
	common = {"secure": cookie_secure(), "samesite": "Lax", "path": "/"}
	response.delete_cookie(SESSION_COOKIE_NAME, httponly=True, **common)
	response.delete_cookie(CSRF_COOKIE_NAME, httponly=False, **common)
	return response


def revoke_employee_sessions(session, employee_id: int, except_session_id: Optional[int] = None) -> None:
	query = session.query(AuthSession).filter(
		AuthSession.employee_id == employee_id,
		AuthSession.revoked_at.is_(None),
	)
	if except_session_id is not None:
		query = query.filter(AuthSession.id != except_session_id)
	query.update({"revoked_at": utcnow()}, synchronize_session=False)


def _extract_session_credential() -> tuple[Optional[str], Optional[str]]:
	auth = request.headers.get("Authorization", "")
	if auth.lower().startswith("bearer "):
		return auth.split(" ", 1)[1].strip(), "bearer"
	cookie_value = request.cookies.get(SESSION_COOKIE_NAME)
	if cookie_value:
		return cookie_value, "cookie"
	return None, None


def _csrf_valid(record: AuthSession) -> bool:
	if request.method not in UNSAFE_METHODS:
		return True
	if getattr(g, "auth_source", None) != "cookie":
		return True
	cookie_token = request.cookies.get(CSRF_COOKIE_NAME, "")
	header_token = request.headers.get("X-CSRF-Token", "")
	if not cookie_token or not header_token or not hmac.compare_digest(cookie_token, header_token):
		return False
	return hmac.compare_digest(hash_secret(header_token), record.csrf_token_hash)


def require_auth_or_401():
	"""Authenticate an opaque session and return current database-backed user data."""
	cached = getattr(g, "current_user", None)
	if cached is not None:
		return cached

	raw_token, source = _extract_session_credential()
	if not raw_token:
		return jsonify({"error": "authentication_required"}), 401

	now = utcnow()
	with db_session() as session:
		record = session.query(AuthSession).filter(AuthSession.token_hash == hash_secret(raw_token)).first()
		if (
			record is None
			or record.revoked_at is not None
			or record.expires_at <= now
		):
			return jsonify({"error": "invalid_session"}), 401

		employee = session.get(Employee, record.employee_id)
		if employee is None or not employee.is_active:
			if record.revoked_at is None:
				record.revoked_at = now
			return jsonify({"error": "invalid_session"}), 401

		g.auth_source = source
		if not _csrf_valid(record):
			return jsonify({"error": "csrf_validation_failed"}), 403

		if not record.last_seen_at or now - record.last_seen_at > timedelta(minutes=5):
			record.last_seen_at = now

		current_user = {
			"id": employee.id,
			"name": employee.name,
			"email": employee.email,
			"role": employee.role,
			"is_active": employee.is_active,
			"must_change_password": employee.must_change_password,
		}
		if employee.must_change_password and request.path not in {
			"/auth/me",
			"/auth/change-password",
			"/auth/logout",
		}:
			return jsonify({"error": "password_change_required"}), 403
		g.current_user = current_user
		g.auth_session_id = record.id
		return current_user


def require_role(required_role: str):
	def decorator(function):
		@wraps(function)
		def wrapper(*args, **kwargs):
			auth_result = require_auth_or_401()
			if isinstance(auth_result, tuple):
				return auth_result
			if auth_result.get("role") != required_role:
				return jsonify({"error": "forbidden"}), 403
			return function(auth_result, *args, **kwargs)
		return wrapper
	return decorator


def require_admin(function):
	return require_role("admin")(function)
