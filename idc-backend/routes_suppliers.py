from flask import Blueprint, jsonify
from sqlalchemy import select
from database import db_session
from models import Supplier

bp = Blueprint('suppliers', __name__, url_prefix='/api/suppliers')

@bp.get('')
def list_suppliers():
	with db_session() as session:
		items = session.execute(select(Supplier)).scalars().all()
		return jsonify({"items": [{"id": s.id, "name": s.name} for s in items]}) 