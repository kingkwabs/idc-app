from flask import Blueprint, jsonify
from sqlalchemy import select
from database import db_session
from models import Client
from schemas import ClientOut

bp = Blueprint('clients', __name__, url_prefix='/api/clients')

@bp.get('')
async def list_clients():
	async with db_session() as session:
		result = await session.execute(select(Client))
		items = result.scalars().all()
		data = [ClientOut.model_validate(i).model_dump() for i in items]
		return jsonify({"items": data})
