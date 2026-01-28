from flask import Blueprint, jsonify
from sqlalchemy import select
from database import db_session
from models import Client
from schemas import ClientOut

bp = Blueprint('clients', __name__, url_prefix='/api/clients')

@bp.get('')
def list_clients():
	with db_session() as session:
		items = session.execute(select(Client)).scalars().all()
		data = [ClientOut.model_validate(i).model_dump() for i in items]
		return jsonify({"items": data}) 