from flask import Blueprint, jsonify
from sqlalchemy import select
from database import db_session
from models import Supplier

bp = Blueprint('suppliers', __name__, url_prefix='/api/suppliers')

@bp.get('')
async def list_suppliers():
	async with db_session() as session:
		result = await session.execute(select(Supplier))
		items = result.scalars().all()
		return jsonify({"items": [{"id": s.id, "name": s.name} for s in items]})
