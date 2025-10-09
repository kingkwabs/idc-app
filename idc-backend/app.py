# app.py
from flask import Flask, request, jsonify
import os
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
from models import Base

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

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

@app.route('/health', methods=['GET'])
def health_check():
	return jsonify({"status": "ok"}), 200

@app.route('/debug/schema', methods=['GET'])
def debug_schema():
	"""Temporary endpoint to inspect database schema (remove in production)."""
	from sqlalchemy import inspect
	try:
		engine = get_engine()
		inspector = inspect(engine)
		tables = inspector.get_table_names()
		schema = {}
		for table in tables:
			columns = []
			for col in inspector.get_columns(table):
				columns.append({
					"name": col["name"],
					"type": str(col["type"]),
					"nullable": col["nullable"]
				})
			schema[table] = columns
		return jsonify({"tables": tables, "schema": schema}), 200
	except Exception as e:
		return jsonify({"error": str(e)}), 500

# Legacy demo endpoint kept for compatibility (prefer blueprint)
@app.route('/api/transactions', methods=['POST'])
def create_transaction_legacy():
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
	app.run(debug=True, port=5001) # Run on a different port than your frontend