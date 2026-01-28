from flask import Blueprint, request, jsonify
from datetime import datetime
import bcrypt
from sqlalchemy import select

from auth_util import create_access_token, require_admin, require_auth_or_401
from database import db_session
from models import Employee
from schemas import EmployeeCreate, EmployeeOut, EmployeeUpdate

bp = Blueprint('auth', __name__, url_prefix='/auth')


@bp.post('/signup')
async def signup():
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
async def login():
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

	async with db_session() as session:
		result = await session.execute(select(Employee).filter(Employee.email == email))
		user = result.scalars().first()
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
async def create_employee(current_user):
	"""
	Admin-only endpoint to create new employees.
	Accepts name, email, password, and role.
	"""
	data = request.get_json() or {}
	try:
		emp_in = EmployeeCreate(**data)
	except Exception as e:
		return jsonify({"error": "invalid_input", "details": str(e)}), 400

	async with db_session() as session:
		# Check for duplicate email
		result = await session.execute(select(Employee).filter(Employee.email == emp_in.email))
		if result.scalars().first():
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
		await session.flush()  # get new_emp.id

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
async def list_employees(current_user):
	"""
	Admin-only endpoint to list all employees.
	"""
	async with db_session() as session:
		result = await session.execute(select(Employee).order_by(Employee.created_at.desc()))
		employees = result.scalars().all()
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
async def delete_employee(current_user, employee_id):
	"""
	Admin-only endpoint to delete an employee.
	Prevents deleting yourself.
	"""
	if current_user.get('id') == employee_id:
		return jsonify({"error": "cannot_delete_self"}), 400

	async with db_session() as session:
		result = await session.execute(select(Employee).filter(Employee.id == employee_id))
		employee = result.scalars().first()
		if not employee:
			return jsonify({"error": "employee_not_found"}), 404

		await session.delete(employee)
		return jsonify({"message": "Employee deleted successfully"}), 200


@bp.get('/me')
async def get_current_user():
	"""
	Get current user info from JWT token.
	"""
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


@bp.put('/employees/<int:employee_id>')
@require_admin
async def update_employee(current_user, employee_id):
	"""
	Admin-only endpoint to update any employee's details.
	Can update name, email, password, role.
	"""
	data = request.get_json() or {}
	try:
		update_data = EmployeeUpdate(**data)
	except Exception as e:
		return jsonify({"error": "invalid_input", "details": str(e)}), 400

	async with db_session() as session:
		result = await session.execute(select(Employee).filter(Employee.id == employee_id))
		employee = result.scalars().first()
		if not employee:
			return jsonify({"error": "employee_not_found"}), 404

		# Check for email conflicts if email is being changed
		if update_data.email and update_data.email != employee.email:
			existing_result = await session.execute(select(Employee).filter(Employee.email == update_data.email))
			existing = existing_result.scalars().first()
			if existing:
				return jsonify({"error": "email_exists"}), 409

		# Update fields if provided
		if update_data.name:
			employee.name = update_data.name
		if update_data.email:
			employee.email = update_data.email
		if update_data.password:
			employee.password_hash = bcrypt.hashpw(update_data.password.encode(), bcrypt.gensalt()).decode()
		if update_data.role:
			employee.role = update_data.role
		if update_data.quickbooks_employee_id is not None:
			employee.quickbooks_employee_id = update_data.quickbooks_employee_id
		if update_data.payroll_info is not None:
			employee.payroll_info = update_data.payroll_info
		if update_data.invoice_mapping is not None:
			employee.invoice_mapping = update_data.invoice_mapping

		await session.flush()

		employee_data = {
			"id": employee.id,
			"name": employee.name,
			"email": employee.email,
			"role": employee.role,
			"created_at": employee.created_at.isoformat()
		}
		return jsonify({"employee": employee_data}), 200


@bp.put('/me')
async def update_own_profile():
	"""
	Endpoint for any authenticated user to update their own profile.
	Can update name, email, password (but NOT role).
	"""
	auth_result = require_auth_or_401()
	if isinstance(auth_result, tuple):
		return auth_result

	user_id = auth_result.get('id')
	data = request.get_json() or {}

	# Only allow updating certain fields
	allowed_fields = {'name', 'email', 'password'}
	if any(key not in allowed_fields for key in data.keys()):
		return jsonify({"error": "forbidden", "message": "Can only update name, email, or password"}), 403

	try:
		update_data = EmployeeUpdate(**data)
	except Exception as e:
		return jsonify({"error": "invalid_input", "details": str(e)}), 400

	async with db_session() as session:
		result = await session.execute(select(Employee).filter(Employee.id == user_id))
		employee = result.scalars().first()
		if not employee:
			return jsonify({"error": "employee_not_found"}), 404

		# Check for email conflicts if email is being changed
		if update_data.email and update_data.email != employee.email:
			existing_result = await session.execute(select(Employee).filter(Employee.email == update_data.email))
			existing = existing_result.scalars().first()
			if existing:
				return jsonify({"error": "email_exists"}), 409

		# Update fields if provided
		if update_data.name:
			employee.name = update_data.name
		if update_data.email:
			employee.email = update_data.email
		if update_data.password:
			employee.password_hash = bcrypt.hashpw(update_data.password.encode(), bcrypt.gensalt()).decode()

		await session.flush()

		# Generate new token with updated claims
		claims = {
			"id": employee.id,
			"name": employee.name,
			"email": employee.email,
			"role": employee.role,
		}
		token = create_access_token(sub=str(employee.id), extra_claims=claims)

		return jsonify({
			"user": {
				"id": employee.id,
				"name": employee.name,
				"email": employee.email,
				"role": employee.role
			},
			"access_token": token  # Return new token with updated info
		}), 200
