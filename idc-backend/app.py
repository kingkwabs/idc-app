# app.py
from flask import Flask, request, jsonify
import os
import asyncio
try:
	from dotenv import load_dotenv
	load_dotenv()
except Exception:
	pass
from flask_cors import CORS
from database import get_engine
from routes_transactions import bp as transactions_bp
from routes_clients import bp as clients_bp
from routes_transaction_extras import bp as trx_extras_bp
from routes_suppliers import bp as suppliers_bp
from routes_auth import bp as auth_bp
from routes_quickbooks import bp as quickbooks_bp
from models import Base

app = Flask(__name__)
CORS(app)

# Initialize DB engine on startup (async)
@app.before_serving
async def startup():
	"""Initialize async database engine before serving requests."""
	try:
		engine = await get_engine()
		# Create tables using run_sync for metadata operations
		async with engine.begin() as conn:
			await conn.run_sync(Base.metadata.create_all)
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
async def health_check():
	"""Health check endpoint that also pings the database to keep it warm."""
	try:
		from database import db_session
		from sqlalchemy import text
		async with db_session() as session:
			# Simple query to keep database connection alive
			await session.execute(text("SELECT 1"))
		return jsonify({"status": "ok", "database": "connected"}), 200
	except Exception as e:
		return jsonify({"status": "degraded", "database": "error", "message": str(e)}), 503

# Legacy demo endpoint kept for compatibility (prefer blueprint)
@app.route('/api/transactions', methods=['POST'])
async def create_transaction_legacy():
	data = request.get_json()
	client = data.get('client')
	transaction_name = data.get('transactionName')
	print(f"Received new transaction: {transaction_name} for client {client}")
	response = {
		"message": "Transaction created successfully",
		"transaction": {
			"id": 123,
			"name": transaction_name,
			"status": "RFQ Received"
		}
	}
	return jsonify(response), 201

if __name__ == '__main__':
	# For development with async support, use hypercorn or uvicorn
	# uvicorn app:app --reload --port 5001
	# or: hypercorn app:app --bind 0.0.0.0:5001 --reload
	print("For async support, run with: uvicorn app:app --reload --port 5001")
	print("Or: hypercorn app:app --bind 0.0.0.0:5001 --reload")
	app.run(debug=True, port=5001)
