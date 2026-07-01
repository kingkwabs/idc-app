from flask import Blueprint, jsonify
from sqlalchemy import select, func, case
from database import db_session
from models import Client, Transaction
from schemas import ClientOut

bp = Blueprint('clients', __name__, url_prefix='/api/clients')

@bp.get('')
def list_clients():
	with db_session() as session:
		items = session.execute(select(Client)).scalars().all()
		data = [ClientOut.model_validate(i).model_dump() for i in items]
		return jsonify({"items": data})


@bp.get('/metrics')
def list_client_metrics():
	completed_status = func.coalesce(func.lower(Transaction.status), "") == "loans-cleared"
	revenue_amount = func.coalesce(Transaction.client_po_amount, Transaction.client_quote_amount, 0)
	with db_session() as session:
		stmt = (
			select(
				Client.id,
				Client.name,
				func.count(Transaction.id).label("transaction_count"),
				func.coalesce(func.sum(case((completed_status, 1), else_=0)), 0).label("completed_transactions"),
				func.coalesce(func.sum(revenue_amount), 0).label("total_revenue"),
			)
			.outerjoin(Transaction, Transaction.client_id == Client.id)
			.group_by(Client.id, Client.name)
			.order_by(Client.name)
		)
		items = []
		for row in session.execute(stmt).all():
			transaction_count = int(row.transaction_count or 0)
			completed = int(row.completed_transactions or 0)
			items.append({
				"id": row.id,
				"name": row.name,
				"active_transactions": max(transaction_count - completed, 0),
				"completed_transactions": completed,
				"total_revenue": float(row.total_revenue or 0),
			})
		return jsonify({"items": items})
