"""Central production configuration validation for fail-fast deployments."""

import os
from pathlib import Path
from urllib.parse import urlparse

from qb_token_crypto import QBTokenConfigurationError, QBTokenCrypto


class ProductionConfigurationError(RuntimeError):
	"""Raised before startup when required production configuration is unsafe."""


def _value(name: str) -> str:
	return os.getenv(name, "").strip()


def _is_https_url(value: str) -> bool:
	parsed = urlparse(value)
	return parsed.scheme == "https" and bool(parsed.netloc) and not parsed.username


def validate_production_environment() -> None:
	"""Validate production invariants without including secret values in errors."""
	errors: list[str] = []
	required = (
		"CORS_ORIGINS",
		"DB_CLUSTER_ARN",
		"DB_SECRET_NAME",
		"DB_SSLMODE",
		"DB_SSLROOTCERT",
		"FRONTEND_URL",
		"JWT_SECRET",
		"QB_CLIENT_ID",
		"QB_CLIENT_SECRET",
		"QB_ENVIRONMENT",
		"QB_REDIRECT_URI",
		"QB_SERVICE_ITEM_NAME",
		"QB_TOKEN_ENCRYPTION_KEY",
	)
	for name in required:
		if not _value(name):
			errors.append(f"{name} is required")

	frontend_url = _value("FRONTEND_URL")
	if frontend_url and not _is_https_url(frontend_url):
		errors.append("FRONTEND_URL must be an HTTPS URL")

	cors_origins = [
		origin.strip().rstrip("/")
		for origin in _value("CORS_ORIGINS").split(",")
		if origin.strip()
	]
	if cors_origins:
		if "*" in cors_origins or any(not _is_https_url(origin) for origin in cors_origins):
			errors.append("CORS_ORIGINS must contain only explicit HTTPS origins")
		if frontend_url and frontend_url.rstrip("/") not in cors_origins:
			errors.append("CORS_ORIGINS must include FRONTEND_URL")

	jwt_secret = _value("JWT_SECRET")
	if jwt_secret and len(jwt_secret) < 32:
		errors.append("JWT_SECRET must be at least 32 characters")

	if _value("QB_ENVIRONMENT").lower() != "production":
		errors.append("QB_ENVIRONMENT must be production")

	redirect_uri = _value("QB_REDIRECT_URI")
	if redirect_uri:
		parsed_redirect = urlparse(redirect_uri)
		if (
			not _is_https_url(redirect_uri)
			or parsed_redirect.path != "/quickbooks/callback"
			or parsed_redirect.params
			or parsed_redirect.query
			or parsed_redirect.fragment
		):
			errors.append(
				"QB_REDIRECT_URI must be an HTTPS /quickbooks/callback URL without query or fragment"
			)

	service_item_name = _value("QB_SERVICE_ITEM_NAME")
	if len(service_item_name) > 100:
		errors.append("QB_SERVICE_ITEM_NAME must be 100 characters or fewer")

	if _value("DB_SSLMODE") != "verify-full":
		errors.append("DB_SSLMODE must be verify-full")
	root_certificate = _value("DB_SSLROOTCERT")
	if root_certificate and not Path(root_certificate).is_file():
		errors.append("DB_SSLROOTCERT must reference an existing certificate file")

	secure_cookie = _value("SESSION_COOKIE_SECURE").lower()
	if secure_cookie in {"0", "false", "no"}:
		errors.append("SESSION_COOKIE_SECURE cannot be disabled")

	if _value("QB_TOKEN_ENCRYPTION_KEY"):
		try:
			QBTokenCrypto(environment="production")
		except QBTokenConfigurationError:
			errors.append("QB_TOKEN_ENCRYPTION_KEY must be a valid Fernet key")

	if errors:
		raise ProductionConfigurationError(
			"Invalid production configuration: " + "; ".join(sorted(set(errors)))
		)
