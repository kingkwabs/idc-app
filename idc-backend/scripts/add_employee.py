"""Bootstrap an administrator when no active admin account exists."""

import os
import sys
from pathlib import Path

from pydantic import ValidationError


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
	sys.path.append(str(ROOT_DIR))

from auth_util import hash_password, normalize_email, password_policy_errors, utcnow
from database import db_session
from models import AccountAuditLog, Employee
from schemas import EmployeeCreate


def _allow_emergency_bootstrap() -> bool:
	return os.getenv("ALLOW_ADDITIONAL_ADMIN_BOOTSTRAP", "").strip().lower() in {
		"1",
		"true",
		"yes",
	}


def _employee_input() -> EmployeeCreate:
	try:
		return EmployeeCreate(
			name=os.getenv("NEW_EMPLOYEE_NAME", ""),
			email=os.getenv("NEW_EMPLOYEE_EMAIL", ""),
			password=os.getenv("NEW_EMPLOYEE_PASSWORD", ""),
			role=os.getenv("NEW_EMPLOYEE_ROLE", "admin"),
		)
	except ValidationError as exc:
		raise RuntimeError(
			"Set valid NEW_EMPLOYEE_NAME, NEW_EMPLOYEE_EMAIL, "
			"NEW_EMPLOYEE_PASSWORD, and NEW_EMPLOYEE_ROLE values."
		) from exc


def main() -> None:
	employee_input = _employee_input()
	email = normalize_email(str(employee_input.email))
	policy_errors = password_policy_errors(employee_input.password, email)
	if policy_errors:
		raise RuntimeError("Bootstrap password does not meet the account password policy.")
	if employee_input.role != "admin":
		raise RuntimeError("This recovery script can only bootstrap an administrator.")

	with db_session() as session:
		if session.query(Employee).filter(Employee.email == email).first() is not None:
			raise RuntimeError("An employee with that email already exists.")

		active_admin_exists = session.query(Employee).filter(
			Employee.role == "admin",
			Employee.is_active.is_(True),
		).first() is not None
		if active_admin_exists and not _allow_emergency_bootstrap():
			raise RuntimeError(
				"An active administrator already exists. Add accounts from Admin > Employees."
			)
		now = utcnow()
		employee = Employee(
			name=employee_input.name,
			email=email,
			password_hash=hash_password(employee_input.password),
			role=employee_input.role,
			created_at=now,
			updated_at=now,
			password_changed_at=now,
			is_active=True,
			must_change_password=True,
		)
		session.add(employee)
		session.flush()
		session.add(AccountAuditLog(
			actor_employee_id=None,
			target_employee_id=employee.id,
			action="account_bootstrapped",
			details="source=bootstrap_script",
			created_at=now,
		))

	print("Bootstrap account created; change its temporary password at first sign-in.")


if __name__ == "__main__":
	main()
