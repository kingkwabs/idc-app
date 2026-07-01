# app.py
from flask import Flask, jsonify, request
import os
import time
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass
from flask_cors import CORS # Import CORS
from database import get_engine
from routes_transactions import bp as transactions_bp
from routes_clients import bp as clients_bp
from routes_transaction_extras import bp as trx_extras_bp
from routes_suppliers import bp as suppliers_bp
from routes_auth import bp as auth_bp
from routes_quickbooks import bp as quickbooks_bp
from models import Base

app = Flask(__name__)
CORS(app) # Enable CORS for all routes


@app.before_request
def start_request_timer():
	request._started_at = time.perf_counter()


@app.after_request
def log_request_duration(response):
	started_at = getattr(request, "_started_at", None)
	if started_at is not None:
		duration_ms = (time.perf_counter() - started_at) * 1000
		response.headers["X-Response-Time-ms"] = f"{duration_ms:.1f}"
		print(f"{request.method} {request.path} {response.status_code} {duration_ms:.1f}ms")
	return response


# Initialize DB engine on startup
try:
	engine = get_engine()
	Base.metadata.create_all(bind=engine)
	print("Database engine initialized and tables ensured.")
except Exception as e:
	print(f"Database engine initialization failed: {e}")

# Register blueprints
app.register_blueprint(transactions_bp)
app.register_blueprint(clients_bp)
app.register_blueprint(trx_extras_bp)
app.register_blueprint(suppliers_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(quickbooks_bp)

@app.route('/health', methods=['GET'])
def health_check():
	"""Health check endpoint that also pings the database to keep it warm."""
	try:
		from database import db_session
		from sqlalchemy import text
		with db_session() as session:
			# Simple query to keep database connection alive
			session.execute(text("SELECT 1"))
		return jsonify({"status": "ok", "database": "connected"}), 200
	except Exception as e:
		return jsonify({"status": "degraded", "database": "error", "message": str(e)}), 503

if __name__ == '__main__':
	app.run(debug=True, port=5001) # Run on a different port than your frontend
