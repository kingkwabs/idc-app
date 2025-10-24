from flask import Blueprint, request, jsonify
from datetime import datetime
import bcrypt

from auth_util import create_access_token, require_admin
from database import db_session
from models import Employee
from schemas import EmployeeCreate, EmployeeOut

bp = Blueprint('auth', __name__, url_prefix='/auth')


@bp.post('/signup')
def signup():
	"""
	DEPRECATED: Public signup disabled for security.
	Use /auth/employees (admin-only) to create new employees.
	This endpoint is kept for backwards compatibility but restricted.
	"""
	return jsonify({
		"error": "signup_disabled",
		"message": "Public signup is disabled. Contact an administrator to create an account."
	}), 403


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


@bp.post('/employees')
@require_admin
def create_employee(current_user):
	"""
	Admin-only endpoint to create new employees.
	Accepts name, email, password, and role.
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

		employee_data = {
			"id": new_emp.id,
			"name": new_emp.name,
			"email": new_emp.email,
			"role": new_emp.role,
			"created_at": new_emp.created_at.isoformat()
		}
		return jsonify({"employee": employee_data}), 201


@bp.get('/employees')
@require_admin
def list_employees(current_user):
	"""
	Admin-only endpoint to list all employees.
	"""
	with db_session() as session:
		employees = session.query(Employee).order_by(Employee.created_at.desc()).all()
		employee_list = [
			{
				"id": emp.id,
				"name": emp.name,
				"email": emp.email,
				"role": emp.role,
				"created_at": emp.created_at.isoformat()
			}
			for emp in employees
		]
		return jsonify({"employees": employee_list})


@bp.delete('/employees/<int:employee_id>')
@require_admin
def delete_employee(current_user, employee_id):
	"""
	Admin-only endpoint to delete an employee.
	Prevents deleting yourself.
	"""
	if current_user.get('id') == employee_id:
		return jsonify({"error": "cannot_delete_self"}), 400

	with db_session() as session:
		employee = session.query(Employee).filter(Employee.id == employee_id).first()
		if not employee:
			return jsonify({"error": "employee_not_found"}), 404

		session.delete(employee)
		return jsonify({"message": "Employee deleted successfully"}), 200


@bp.get('/me')
def get_current_user():
	"""
	Get current user info from JWT token.
	"""
	from auth_util import require_auth_or_401
	auth_result = require_auth_or_401()
	if isinstance(auth_result, tuple):
		return auth_result

	return jsonify({
		"user": {
			"id": auth_result.get('id'),
			"name": auth_result.get('name'),
			"email": auth_result.get('email'),
			"role": auth_result.get('role')
		}
	})
