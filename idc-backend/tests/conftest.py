import os
import sys
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from flask import Flask, jsonify, request
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
	sys.path.insert(0, str(ROOT))

import database
from auth_util import hash_password, require_auth_or_401
from models import Base, Employee
from routes_auth import bp as auth_bp
from routes_clients import bp as clients_bp
from routes_suppliers import bp as suppliers_bp
from routes_transaction_extras import bp as transaction_extras_bp
from routes_transactions import bp as transactions_bp


@pytest.fixture()
def app(monkeypatch):
	engine = create_engine(
		"sqlite+pysqlite://",
		connect_args={"check_same_thread": False},
		poolclass=StaticPool,
	)
	Base.metadata.create_all(engine)
	session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
	monkeypatch.setattr(database, "_engine", engine)
	monkeypatch.setattr(database, "_SessionLocal", session_factory)
	monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
	monkeypatch.setenv("JWT_SECRET", "test-only-jwt-secret-that-is-long-enough")
	monkeypatch.setenv("LOGIN_RATE_LIMIT_ATTEMPTS", "50")

	test_app = Flask(__name__)
	test_app.config.update(TESTING=True)
	test_app.register_blueprint(auth_bp)
	test_app.register_blueprint(clients_bp)
	test_app.register_blueprint(suppliers_bp)
	test_app.register_blueprint(transactions_bp)
	test_app.register_blueprint(transaction_extras_bp)

	@test_app.before_request
	def protect_api():
		if request.path.startswith("/api/"):
			result = require_auth_or_401()
			if isinstance(result, tuple):
				return result
		return None

	@test_app.route("/api/protected", methods=["GET", "POST"])
	def protected():
		return jsonify({"ok": True})

	@test_app.errorhandler(ValidationError)
	def invalid_request(error):
		return jsonify({
			"error": "invalid_input",
			"details": [
				{"field": ".".join(str(part) for part in item["loc"]), "message": item["msg"]}
				for item in error.errors()
			],
		}), 400

	with session_factory.begin() as session:
		session.add(Employee(
			name="Primary Admin",
			email="admin@idcenergy.co",
			password_hash=hash_password("CorrectHorse!Battery9"),
			role="admin",
			is_active=True,
			must_change_password=False,
		))

	yield test_app

	Base.metadata.drop_all(engine)
	database._SessionLocal = None
	database._engine = None


@pytest.fixture()
def client(app):
	return app.test_client()


def login(client, email="admin@idcenergy.co", password="CorrectHorse!Battery9"):
	return client.post("/auth/login", json={"email": email, "password": password})


def csrf_token(client) -> str:
	cookie = client.get_cookie("idc_csrf")
	assert cookie is not None
	return cookie.value


def csrf_headers(client) -> dict[str, str]:
	return {"X-CSRF-Token": csrf_token(client)}


@pytest.fixture()
def production_environment(monkeypatch, tmp_path):
	certificate = tmp_path / "rds-ca.pem"
	certificate.write_text("test certificate placeholder", encoding="utf-8")
	values = {
		"APP_ENV": "production",
		"CORS_ORIGINS": "https://www.idcenergy.co,https://idcenergy.co",
		"DB_CLUSTER_ARN": "arn:aws:rds:eu-north-1:123456789012:cluster:idc-energy",
		"DB_SECRET_NAME": "app/transactions-db-config",
		"DB_SSLMODE": "verify-full",
		"DB_SSLROOTCERT": str(certificate),
		"FRONTEND_URL": "https://www.idcenergy.co",
		"JWT_SECRET": "production-test-jwt-secret-value-1234567890",
		"QB_CLIENT_ID": "test-quickbooks-client-id",
		"QB_CLIENT_SECRET": "test-quickbooks-client-secret",
		"QB_ENVIRONMENT": "production",
		"QB_REDIRECT_URI": "https://idc-app.onrender.com/quickbooks/callback",
		"QB_SERVICE_ITEM_NAME": "Services",
		"QB_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode("ascii"),
		"SESSION_COOKIE_SECURE": "true",
	}
	for name, value in values.items():
		monkeypatch.setenv(name, value)
	return values
