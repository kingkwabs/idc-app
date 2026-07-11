import pytest

from database import db_session
from models import AccountAuditLog, Employee
from scripts import add_employee


def configure_bootstrap(monkeypatch, *, email="recovery@idcenergy.co", role="admin"):
	monkeypatch.setenv("NEW_EMPLOYEE_NAME", "Recovery Admin")
	monkeypatch.setenv("NEW_EMPLOYEE_EMAIL", email)
	monkeypatch.setenv("NEW_EMPLOYEE_PASSWORD", "Temporary!Atlas947")
	monkeypatch.setenv("NEW_EMPLOYEE_ROLE", role)
	monkeypatch.delenv("ALLOW_ADDITIONAL_ADMIN_BOOTSTRAP", raising=False)


def test_bootstrap_refuses_to_bypass_an_active_admin(app, monkeypatch):
	configure_bootstrap(monkeypatch)

	with pytest.raises(RuntimeError, match="Add accounts from Admin > Employees"):
		add_employee.main()


def test_bootstrap_creates_forced_change_admin_during_explicit_recovery(
	app,
	monkeypatch,
	capsys,
):
	configure_bootstrap(monkeypatch)
	monkeypatch.setenv("ALLOW_ADDITIONAL_ADMIN_BOOTSTRAP", "true")

	add_employee.main()

	with db_session() as session:
		employee = session.query(Employee).filter(
			Employee.email == "recovery@idcenergy.co"
		).one()
		assert employee.role == "admin"
		assert employee.is_active is True
		assert employee.must_change_password is True
		assert employee.password_hash.startswith("$argon2")
		audit = session.query(AccountAuditLog).filter(
			AccountAuditLog.target_employee_id == employee.id,
			AccountAuditLog.action == "account_bootstrapped",
		).one()
		assert audit.actor_employee_id is None
	assert "temporary password" in capsys.readouterr().out


def test_bootstrap_never_creates_regular_employee_accounts(app, monkeypatch):
	configure_bootstrap(monkeypatch, role="employee")
	monkeypatch.setenv("ALLOW_ADDITIONAL_ADMIN_BOOTSTRAP", "true")

	with pytest.raises(RuntimeError, match="only bootstrap an administrator"):
		add_employee.main()


def test_bootstrap_rejects_duplicate_email_before_recovery_override(app, monkeypatch):
	configure_bootstrap(monkeypatch, email="ADMIN@IDCENERGY.CO")
	monkeypatch.setenv("ALLOW_ADDITIONAL_ADMIN_BOOTSTRAP", "true")

	with pytest.raises(RuntimeError, match="email already exists"):
		add_employee.main()
