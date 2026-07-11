import os
import secrets
import time

from flask import Flask, g, jsonify, request
from flask_cors import CORS
from pydantic import ValidationError
from sqlalchemy import text

try:
	from dotenv import load_dotenv
except ImportError:
	load_dotenv = None

if load_dotenv is not None:
	load_dotenv()

from auth_util import require_auth_or_401
from database import db_session, get_engine
from models import Base
from routes_auth import bp as auth_bp
from routes_clients import bp as clients_bp
from routes_quickbooks import bp as quickbooks_bp
from routes_suppliers import bp as suppliers_bp
from routes_transaction_extras import bp as trx_extras_bp
from routes_transactions import bp as transactions_bp
from runtime_config import validate_production_environment


def _is_production() -> bool:
	return bool(os.getenv("RENDER")) or os.getenv("APP_ENV", "").lower() == "production"


def _allowed_origins() -> list[str]:
	configured = os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_URL")
	if configured:
		return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
	if _is_production():
		return ["https://www.idcenergy.co", "https://idcenergy.co"]
	return ["http://localhost:5173", "http://127.0.0.1:5173"]


def create_app(initialize_database: bool | None = None) -> Flask:
	if _is_production():
		validate_production_environment()

	app = Flask(__name__)
	app.config["MAX_CONTENT_LENGTH"] = int(
		os.getenv("MAX_REQUEST_BYTES", str(12 * 1024 * 1024))
	)

	CORS(
		app,
		resources={
			r"/api/*": {"origins": _allowed_origins()},
			r"/auth/*": {"origins": _allowed_origins()},
			r"/quickbooks/*": {"origins": _allowed_origins()},
		},
		supports_credentials=True,
		allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
		methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		max_age=600,
	)

	app.register_blueprint(transactions_bp)
	app.register_blueprint(clients_bp)
	app.register_blueprint(trx_extras_bp)
	app.register_blueprint(suppliers_bp)
	app.register_blueprint(auth_bp)
	app.register_blueprint(quickbooks_bp)

	@app.before_request
	def begin_request():
		g.request_started_at = time.perf_counter()
		g.request_id = request.headers.get("X-Request-ID", "")[:64] or secrets.token_hex(12)
		if request.method != "OPTIONS" and (
			request.path == "/api" or request.path.startswith("/api/")
		):
			auth_result = require_auth_or_401()
			if isinstance(auth_result, tuple):
				return auth_result
		return None

	@app.after_request
	def finalize_request(response):
		started_at = getattr(g, "request_started_at", None)
		if started_at is not None:
			duration_ms = (time.perf_counter() - started_at) * 1000
			response.headers["X-Response-Time-ms"] = f"{duration_ms:.1f}"
			app.logger.info(
				"%s %s %s %.1fms request_id=%s",
				request.method,
				request.path,
				response.status_code,
				duration_ms,
				getattr(g, "request_id", "-"),
			)
		response.headers["X-Request-ID"] = getattr(g, "request_id", "")
		response.headers["X-Content-Type-Options"] = "nosniff"
		response.headers["X-Frame-Options"] = "DENY"
		response.headers["Referrer-Policy"] = "no-referrer"
		response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
		response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
		if _is_production():
			response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
		if request.path.startswith(("/api", "/auth", "/quickbooks")):
			response.headers["Cache-Control"] = "no-store"
		return response

	@app.errorhandler(413)
	def request_too_large(_error):
		return jsonify({"error": "request_too_large"}), 413

	@app.errorhandler(ValidationError)
	def invalid_request(error):
		return jsonify({
			"error": "invalid_input",
			"details": [
				{"field": ".".join(str(part) for part in item["loc"]), "message": item["msg"]}
				for item in error.errors()
			],
		}), 400

	@app.get("/live")
	def liveness():
		return jsonify({"status": "ok"})

	@app.get("/health")
	def readiness():
		try:
			with db_session() as session:
				session.execute(text("SELECT 1"))
			return jsonify({"status": "ok", "database": "connected"})
		except Exception:
			app.logger.exception("Database readiness check failed")
			return jsonify({"status": "degraded", "database": "unavailable"}), 503

	if initialize_database is None:
		initialize_database = (
			not _is_production()
			and os.getenv("SKIP_DB_INIT", "").lower() not in {"1", "true", "yes"}
		)
	if initialize_database:
		engine = get_engine()
		Base.metadata.create_all(bind=engine)
		app.logger.info("Development database schema ensured")

	return app


app = create_app()


if __name__ == "__main__":
	app.run(
		debug=os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes"},
		port=int(os.getenv("PORT", "5001")),
	)
