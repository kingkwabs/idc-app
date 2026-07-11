from datetime import timedelta

from flask import Blueprint, g, jsonify, request
from pydantic import ValidationError
from sqlalchemy import func

from auth_util import (
	clear_auth_cookies,
	clear_login_attempts,
	consume_login_attempt,
	create_auth_session,
	hash_password,
	login_rate_limit_key,
	normalize_email,
	password_policy_errors,
	password_hash_needs_upgrade,
	require_admin,
	require_auth_or_401,
	revoke_employee_sessions,
	set_auth_cookies,
	utcnow,
	verify_password,
)
from database import db_session
from models import AccountAuditLog, AuthSession, Employee
from schemas import EmployeeCreate, EmployeeOut, EmployeeUpdate, PasswordChange, ProfileUpdate

bp = Blueprint("auth", __name__, url_prefix="/auth")
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15


def _employee_payload(employee: Employee) -> dict:
	return EmployeeOut.model_validate(employee).model_dump(mode="json")


def _validation_response(exc: ValidationError):
	details = [
		{"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
		for error in exc.errors()
	]
	return jsonify({"error": "invalid_input", "details": details}), 400


def _audit(session, actor_id: int | None, target_id: int | None, action: str, details: str | None = None):
	session.add(AccountAuditLog(
		actor_employee_id=actor_id,
		target_employee_id=target_id,
		action=action,
		details=details,
	))


def _email_exists(session, email: str, exclude_employee_id: int | None = None) -> bool:
	query = session.query(Employee.id).filter(func.lower(Employee.email) == normalize_email(email))
	if exclude_employee_id is not None:
		query = query.filter(Employee.id != exclude_employee_id)
	return query.first() is not None


def _would_remove_last_admin(session, employee: Employee, role: str, is_active: bool) -> bool:
	if not employee.is_active or employee.role != "admin":
		return False
	if is_active and role == "admin":
		return False
	active_admins = session.query(Employee).filter(
		Employee.role == "admin",
		Employee.is_active.is_(True),
	).with_for_update().all()
	return len(active_admins) <= 1


@bp.post("/signup")
def signup():
	return jsonify({
		"error": "signup_disabled",
		"message": "Contact an administrator to create an account.",
	}), 403


@bp.post("/login")
def login():
	data = request.get_json(silent=True) or {}
	email = normalize_email(str(data.get("email") or ""))
	password = str(data.get("password") or "")
	rate_key = login_rate_limit_key(email)

	if not consume_login_attempt(rate_key):
		response = jsonify({"error": "invalid_credentials"})
		response.status_code = 429
		response.headers["Retry-After"] = str(LOCKOUT_MINUTES * 60)
		return response

	if not email or not password:
		return jsonify({"error": "invalid_credentials"}), 401

	now = utcnow()
	with db_session() as session:
		user = (
			session.query(Employee)
			.filter(func.lower(Employee.email) == email)
			.with_for_update()
			.first()
		)
		password_valid = verify_password(password, user.password_hash if user else None)

		if user and user.locked_until and user.locked_until > now:
			return jsonify({"error": "invalid_credentials"}), 401

		if not user or not password_valid or not user.is_active:
			if user and user.is_active and not password_valid:
				user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
				if user.failed_login_attempts >= MAX_FAILED_LOGINS:
					user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
			return jsonify({"error": "invalid_credentials"}), 401

		user.failed_login_attempts = 0
		user.locked_until = None
		user.last_login_at = now
		if password_hash_needs_upgrade(user.password_hash):
			user.password_hash = hash_password(password)
		session.query(AuthSession).filter(
			AuthSession.employee_id == user.id,
			(AuthSession.revoked_at.is_not(None)) | (AuthSession.expires_at <= now),
		).delete(synchronize_session=False)
		raw_token, raw_csrf, auth_session = create_auth_session(session, user)
		payload = _employee_payload(user)
		expires_at = auth_session.expires_at

	clear_login_attempts(rate_key)
	response = jsonify({"user": payload, "expires_at": expires_at.isoformat()})
	return set_auth_cookies(response, raw_token, raw_csrf, expires_at)


@bp.post("/logout")
def logout():
	auth_result = require_auth_or_401()
	if isinstance(auth_result, tuple):
		return auth_result
	session_id = getattr(g, "auth_session_id", None)
	if session_id is not None:
		with db_session() as session:
			record = session.get(AuthSession, session_id)
			if record and record.revoked_at is None:
				record.revoked_at = utcnow()
	response = jsonify({"message": "signed_out"})
	return clear_auth_cookies(response)


@bp.get("/me")
def get_current_user():
	auth_result = require_auth_or_401()
	if isinstance(auth_result, tuple):
		return auth_result
	with db_session() as session:
		employee = session.get(Employee, auth_result["id"])
		if employee is None:
			return jsonify({"error": "invalid_session"}), 401
		return jsonify({"user": _employee_payload(employee)})


@bp.put("/me")
def update_own_profile():
	auth_result = require_auth_or_401()
	if isinstance(auth_result, tuple):
		return auth_result
	data = request.get_json(silent=True) or {}
	if any(key in data for key in {"password", "new_password", "role", "is_active"}):
		return jsonify({"error": "use_change_password_endpoint"}), 400
	try:
		update_data = ProfileUpdate(**data)
	except ValidationError as exc:
		return _validation_response(exc)

	with db_session() as session:
		employee = session.get(Employee, auth_result["id"])
		if employee is None:
			return jsonify({"error": "employee_not_found"}), 404

		if update_data.email and normalize_email(str(update_data.email)) != employee.email:
			current_password = str(data.get("current_password") or "")
			if not verify_password(current_password, employee.password_hash):
				return jsonify({"error": "current_password_required"}), 400
			new_email = normalize_email(str(update_data.email))
			if _email_exists(session, new_email, employee.id):
				return jsonify({"error": "email_exists"}), 409
			employee.email = new_email

		if update_data.name is not None:
			employee.name = update_data.name
		employee.updated_at = utcnow()
		_audit(session, employee.id, employee.id, "profile_updated")
		session.flush()
		return jsonify({"user": _employee_payload(employee)})


@bp.post("/change-password")
def change_password():
	auth_result = require_auth_or_401()
	if isinstance(auth_result, tuple):
		return auth_result
	try:
		change = PasswordChange(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_response(exc)

	with db_session() as session:
		employee = session.get(Employee, auth_result["id"])
		if employee is None:
			return jsonify({"error": "employee_not_found"}), 404
		if not verify_password(change.current_password, employee.password_hash):
			return jsonify({"error": "invalid_current_password"}), 400
		errors = password_policy_errors(change.new_password, employee.email)
		if errors:
			return jsonify({"error": "weak_password", "details": errors}), 400
		if verify_password(change.new_password, employee.password_hash):
			return jsonify({"error": "password_reuse_not_allowed"}), 400

		employee.password_hash = hash_password(change.new_password)
		employee.password_changed_at = utcnow()
		employee.must_change_password = False
		employee.failed_login_attempts = 0
		employee.locked_until = None
		revoke_employee_sessions(session, employee.id)
		raw_token, raw_csrf, auth_session = create_auth_session(session, employee)
		_audit(session, employee.id, employee.id, "password_changed")
		payload = _employee_payload(employee)
		expires_at = auth_session.expires_at

	response = jsonify({"message": "password_changed", "user": payload})
	return set_auth_cookies(response, raw_token, raw_csrf, expires_at)


@bp.post("/employees")
@require_admin
def create_employee(current_user):
	try:
		employee_input = EmployeeCreate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_response(exc)

	email = normalize_email(str(employee_input.email))
	errors = password_policy_errors(employee_input.password, email)
	if errors:
		return jsonify({"error": "weak_password", "details": errors}), 400

	with db_session() as session:
		if _email_exists(session, email):
			return jsonify({"error": "email_exists"}), 409
		now = utcnow()
		employee = Employee(
			name=employee_input.name,
			email=email,
			password_hash=hash_password(employee_input.password),
			role=employee_input.role,
			is_active=True,
			must_change_password=True,
			created_at=now,
			updated_at=now,
			password_changed_at=now,
		)
		session.add(employee)
		session.flush()
		_audit(session, current_user["id"], employee.id, "account_created", f"role={employee.role}")
		return jsonify({"employee": _employee_payload(employee)}), 201


@bp.get("/employees")
@require_admin
def list_employees(current_user):
	with db_session() as session:
		employees = session.query(Employee).order_by(
			Employee.is_active.desc(),
			Employee.name.asc(),
		).all()
		return jsonify({"employees": [_employee_payload(employee) for employee in employees]})


@bp.put("/employees/<int:employee_id>")
@require_admin
def update_employee(current_user, employee_id):
	try:
		update_data = EmployeeUpdate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_response(exc)

	with db_session() as session:
		employee = session.query(Employee).filter(Employee.id == employee_id).with_for_update().first()
		if employee is None:
			return jsonify({"error": "employee_not_found"}), 404

		new_role = update_data.role if update_data.role is not None else employee.role
		new_active = update_data.is_active if update_data.is_active is not None else employee.is_active
		if employee.id == current_user["id"] and (new_role != "admin" or not new_active):
			return jsonify({"error": "cannot_remove_own_admin_access"}), 400
		if _would_remove_last_admin(session, employee, new_role, new_active):
			return jsonify({"error": "last_active_admin"}), 409

		changed_fields = []
		revoke_sessions = False
		if update_data.name is not None and update_data.name != employee.name:
			employee.name = update_data.name
			changed_fields.append("name")
		if update_data.email is not None:
			email = normalize_email(str(update_data.email))
			if email != employee.email:
				if _email_exists(session, email, employee.id):
					return jsonify({"error": "email_exists"}), 409
				employee.email = email
				changed_fields.append("email")
		if update_data.role is not None and update_data.role != employee.role:
			employee.role = update_data.role
			changed_fields.append("role")
			revoke_sessions = True
		if update_data.is_active is not None and update_data.is_active != employee.is_active:
			employee.is_active = update_data.is_active
			changed_fields.append("is_active")
			revoke_sessions = True
			if employee.is_active:
				employee.failed_login_attempts = 0
				employee.locked_until = None
		if update_data.temporary_password:
			errors = password_policy_errors(update_data.temporary_password, employee.email)
			if errors:
				return jsonify({"error": "weak_password", "details": errors}), 400
			employee.password_hash = hash_password(update_data.temporary_password)
			employee.password_changed_at = utcnow()
			employee.must_change_password = True
			employee.failed_login_attempts = 0
			employee.locked_until = None
			changed_fields.append("temporary_password")
			revoke_sessions = True

		if not changed_fields:
			return jsonify({"employee": _employee_payload(employee)})
		employee.updated_at = utcnow()
		if revoke_sessions:
			revoke_employee_sessions(session, employee.id)
		_audit(
			session,
			current_user["id"],
			employee.id,
			"account_updated",
			f"fields={','.join(changed_fields)}",
		)
		session.flush()
		return jsonify({"employee": _employee_payload(employee)})


@bp.delete("/employees/<int:employee_id>")
@require_admin
def disable_employee(current_user, employee_id):
	if employee_id == current_user["id"]:
		return jsonify({"error": "cannot_disable_self"}), 400
	with db_session() as session:
		employee = session.query(Employee).filter(Employee.id == employee_id).with_for_update().first()
		if employee is None:
			return jsonify({"error": "employee_not_found"}), 404
		if not employee.is_active:
			return jsonify({"employee": _employee_payload(employee)})
		if _would_remove_last_admin(session, employee, employee.role, False):
			return jsonify({"error": "last_active_admin"}), 409
		employee.is_active = False
		employee.updated_at = utcnow()
		revoke_employee_sessions(session, employee.id)
		_audit(session, current_user["id"], employee.id, "account_disabled")
		return jsonify({"employee": _employee_payload(employee)})


@bp.get("/account-audit")
@require_admin
def list_account_audit(current_user):
	with db_session() as session:
		items = session.query(AccountAuditLog).order_by(AccountAuditLog.created_at.desc()).limit(200).all()
		return jsonify({"items": [{
			"id": item.id,
			"actor_employee_id": item.actor_employee_id,
			"target_employee_id": item.target_employee_id,
			"action": item.action,
			"details": item.details,
			"created_at": item.created_at.isoformat(),
		} for item in items]})
