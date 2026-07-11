from flask import Blueprint, jsonify, request
from pydantic import ValidationError
from sqlalchemy import and_, case, func, not_, select

from database import db_session
from models import Client, Transaction
from schemas import ClientCreate, ClientOut, ClientUpdate
from workflow import COMPLETED_TRANSACTION_STATUS, TERMINAL_TRANSACTION_STATUSES

bp = Blueprint("clients", __name__, url_prefix="/api/clients")


def _validation_error(exc: ValidationError):
	return jsonify({
		"error": "invalid_input",
		"details": [
			{"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
			for error in exc.errors()
		],
	}), 400


@bp.get("")
def list_clients():
	with db_session() as session:
		items = session.execute(select(Client).order_by(Client.name)).scalars().all()
		return jsonify({
			"items": [ClientOut.model_validate(item).model_dump(mode="json") for item in items],
		})


@bp.post("")
def create_client():
	try:
		payload = ClientCreate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		if session.query(Client.id).filter(func.lower(Client.name) == payload.name.lower()).first():
			return jsonify({"error": "client_exists"}), 409
		client = Client(**payload.model_dump(mode="json"))
		session.add(client)
		session.flush()
		return jsonify(ClientOut.model_validate(client).model_dump(mode="json")), 201


@bp.put("/<int:client_id>")
def update_client(client_id: int):
	try:
		payload = ClientUpdate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		client = session.get(Client, client_id)
		if client is None:
			return jsonify({"error": "client_not_found"}), 404
		updates = payload.model_dump(mode="json", exclude_unset=True)
		if "name" in updates:
			if updates["name"] is None:
				return jsonify({"error": "client_name_required"}), 400
			existing = session.query(Client.id).filter(
				func.lower(Client.name) == updates["name"].lower(),
				Client.id != client_id,
			).first()
			if existing:
				return jsonify({"error": "client_exists"}), 409
		for field, value in updates.items():
			setattr(client, field, value)
		session.flush()
		return jsonify(ClientOut.model_validate(client).model_dump(mode="json"))


@bp.get("/metrics")
def list_client_metrics():
	status_text = func.coalesce(func.lower(Transaction.status), "")
	completed_status = status_text == COMPLETED_TRANSACTION_STATUS
	active_status = and_(
		Transaction.id.is_not(None),
		not_(status_text.in_(TERMINAL_TRANSACTION_STATUSES)),
	)
	revenue_amount = func.coalesce(Transaction.client_po_amount, Transaction.client_quote_amount, 0)
	with db_session() as session:
		statement = (
			select(
				Client.id,
				Client.name,
				func.coalesce(func.sum(case((active_status, 1), else_=0)), 0).label("active_transactions"),
				func.coalesce(func.sum(case((completed_status, 1), else_=0)), 0).label("completed_transactions"),
				func.coalesce(func.sum(revenue_amount), 0).label("total_revenue"),
			)
			.outerjoin(Transaction, Transaction.client_id == Client.id)
			.group_by(Client.id, Client.name)
			.order_by(Client.name)
		)
		items = []
		for row in session.execute(statement).all():
			active = int(row.active_transactions or 0)
			completed = int(row.completed_transactions or 0)
			items.append({
				"id": row.id,
				"name": row.name,
				"active_transactions": active,
				"completed_transactions": completed,
				"total_revenue": float(row.total_revenue or 0),
			})
		return jsonify({"items": items})
