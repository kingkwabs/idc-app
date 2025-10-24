import os
import time
import jwt
from typing import Optional
from flask import request, jsonify


def get_jwt_secret() -> str:
	secret = os.getenv("JWT_SECRET")
	if not secret:
		raise RuntimeError("JWT_SECRET not set")
	return secret



def create_access_token(sub: str, ttl_seconds: int = 24 * 3600, extra_claims: dict = None) -> str:
	payload = {
		"sub": sub,
		"iat": int(time.time()),
		"exp": int(time.time()) + ttl_seconds,
	}
	if extra_claims:
		payload.update(extra_claims)
	return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


def verify_token(token: str) -> dict:
	return jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])  # raises on error


def extract_bearer_token() -> Optional[str]:
	auth = request.headers.get("Authorization", "")
	if auth.lower().startswith("bearer "):
		return auth.split(" ", 1)[1].strip()
	return None


def require_auth_or_401():
	"""Verify Authorization header and return payload or Flask response."""
	token = extract_bearer_token()
	if not token:
		return jsonify({"error": "missing_token"}), 401
	try:
		payload = verify_token(token)
		return payload
	except Exception:
		return jsonify({"error": "invalid_token"}), 401


def require_role(required_role: str):
	"""
	Decorator to require a specific role for an endpoint.
	Usage: @require_role('admin')
	"""
	def decorator(f):
		from functools import wraps
		@wraps(f)
		def wrapper(*args, **kwargs):
			auth_result = require_auth_or_401()
			# If auth failed, return the error response
			if isinstance(auth_result, tuple):
				return auth_result
			# Check role
			user_role = auth_result.get('role')
			if user_role != required_role:
				return jsonify({"error": "forbidden", "message": f"Requires {required_role} role"}), 403
			# Pass the user payload to the route
			return f(auth_result, *args, **kwargs)
		return wrapper
	return decorator


def require_admin(f):
	"""
	Decorator to require admin role for an endpoint.
	Usage: @require_admin
	"""
	return require_role('admin')(f)

