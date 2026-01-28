from flask import Blueprint, request, jsonify
from sqlalchemy import select, desc, delete
from sqlalchemy.exc import NoResultFound
from database import db_session
from models import Transaction, Document, ShipmentInfo, ActivityLog, TransactionSupplierLink
from schemas import TransactionCreate, TransactionOut, TransactionUpdate

bp = Blueprint('transactions', __name__, url_prefix='/api/transactions')


@bp.post('')
async def create_transaction():
	payload = request.get_json() or {}
	data = TransactionCreate(**payload)
	async with db_session() as session:
		trx = Transaction(
			client_id=data.client_id,
			rfq_number=data.rfq_number,
			date_received=data.date_received,
			item_description=data.item_description,
			client_quote_amount=data.client_quote_amount,
			client_quote_currency=data.client_quote_currency,
		)
		session.add(trx)
		await session.flush()  # assign id
		return jsonify(TransactionOut.model_validate(trx).model_dump()), 201


@bp.get('')
async def list_transactions():
	page = int(request.args.get('page', 1))
	size = int(request.args.get('size', 20))
	offset = (page - 1) * size
	async with db_session() as session:
		stmt = select(Transaction).order_by(desc(Transaction.id)).offset(offset).limit(size)
		result = await session.execute(stmt)
		items = result.scalars().all()
		data = [TransactionOut.model_validate(i).model_dump() for i in items]
		return jsonify({"items": data, "page": page, "size": size})


@bp.get('/<int:trx_id>')
async def get_transaction(trx_id: int):
	async with db_session() as session:
		obj = await session.get(Transaction, trx_id)
		if obj is None:
			return jsonify({"error": "Not found"}), 404
		return jsonify(TransactionOut.model_validate(obj).model_dump())


@bp.patch('/<int:trx_id>')
async def update_transaction(trx_id: int):
	payload = request.get_json() or {}
	data = TransactionUpdate(**payload)
	async with db_session() as session:
		obj = await session.get(Transaction, trx_id)
		if obj is None:
			return jsonify({"error": "Not found"}), 404
		if data.item_description is not None:
			obj.item_description = data.item_description
		if data.status is not None:
			obj.status = data.status
		if data.client_quote_amount is not None:
			obj.client_quote_amount = data.client_quote_amount
		if data.client_quote_currency is not None:
			obj.client_quote_currency = data.client_quote_currency
		session.add(obj)
		return jsonify(TransactionOut.model_validate(obj).model_dump())


@bp.delete('/<int:trx_id>')
async def delete_transaction(trx_id: int):
	async with db_session() as session:
		obj = await session.get(Transaction, trx_id)
		if obj is None:
			return jsonify({"error": "Not found"}), 404
		# Delete related rows first
		await session.execute(delete(Document).where(Document.transaction_id == trx_id))
		await session.execute(delete(ShipmentInfo).where(ShipmentInfo.transaction_id == trx_id))
		await session.execute(delete(ActivityLog).where(ActivityLog.transaction_id == trx_id))
		await session.execute(delete(TransactionSupplierLink).where(TransactionSupplierLink.transaction_id == trx_id))
		# Then delete transaction
		await session.delete(obj)
		return ('', 204)
