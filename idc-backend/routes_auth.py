from flask import Blueprint, request, jsonify
from datetime import datetime
import bcrypt

from auth_util import create_access_token
from database import db_session
from models import Employee
from schemas import EmployeeCreate

bp = Blueprint('auth', __name__, url_prefix='/auth')


@bp.post('/signup')
def signup():
	"""
	Register a new employee. Accepts name, email, password, and optional role.
	Hashes password, checks for duplicate email, and returns JWT on success.
	"""
	data = request.get_json() or {}
	try:
		emp_in = EmployeeCreate(**data)
	except Exception as e:
		return jsonify({"error": "invalid_input", "details": str(e)}), 400

	with db_session() as session:
		# Check for duplicate email
		if session.query(Employee).filter(Employee.email == emp_in.email).first():
			return jsonify({"error": "email_exists"}), 409

		pw_hash = bcrypt.hashpw(emp_in.password.encode(), bcrypt.gensalt()).decode()
		new_emp = Employee(
			name=emp_in.name,
			email=emp_in.email,
			password_hash=pw_hash,
			role=emp_in.role or "employee",
			created_at=datetime.utcnow(),
		)
		session.add(new_emp)
		session.flush()  # get new_emp.id

		claims = {
			"id": new_emp.id,
			"name": new_emp.name,
			"email": new_emp.email,
			"role": new_emp.role,
		}
		token = create_access_token(sub=str(new_emp.id), extra_claims=claims)
		return jsonify({"access_token": token, "employee": claims})


@bp.post('/login')
def login():
	"""
	Authenticate an employee using email and password.
	Only users in the employees table can log in.
	Passwords are checked using bcrypt.
	Returns a JWT with employee claims (id, name, email, role).
	Error messages are generic to avoid leaking info.
	"""
	data = request.get_json() or {}
	email = data.get('email')
	password = data.get('password')
	if not email or not password:
		return jsonify({"error": "invalid_credentials"}), 401

	with db_session() as session:
		user = session.query(Employee).filter(Employee.email == email).first()
		if not user or not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
			# Generic error message for security
			return jsonify({"error": "invalid_credentials"}), 401

		# JWT payload includes id, name, email, role (extendable for QuickBooks fields)
		claims = {
			"id": user.id,
			"name": user.name,
			"email": user.email,
			"role": user.role,
			# Future: add QuickBooks/payroll/invoice fields here
		}
		token = create_access_token(sub=str(user.id), extra_claims=claims)
		return jsonify({"access_token": token})
