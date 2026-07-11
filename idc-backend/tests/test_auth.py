import database
import auth_util
from auth_util import consume_login_attempt, hash_secret
from conftest import csrf_headers, login
from models import AccountAuditLog, AuthSession, Employee


def test_login_sets_opaque_secure_shape_and_me_uses_current_account(client):
	response = login(client, email="  ADMIN@IDCENERGY.CO ")
	assert response.status_code == 200
	assert "access_token" not in response.get_json()
	cookies = response.headers.getlist("Set-Cookie")
	session_cookie = next(value for value in cookies if value.startswith("idc_session="))
	assert "HttpOnly" in session_cookie
	assert "SameSite=Lax" in session_cookie
	assert client.get("/auth/me").get_json()["user"]["role"] == "admin"


def test_business_api_is_default_deny_and_cookie_mutations_require_csrf(client):
	assert client.get("/api/protected").status_code == 401
	assert login(client).status_code == 200
	assert client.get("/api/protected").status_code == 200
	assert client.post("/api/protected").status_code == 403
	assert client.post("/api/protected", headers=csrf_headers(client)).status_code == 200


def test_admin_can_create_account_and_employee_cannot_administer(client, app):
	assert login(client).status_code == 200
	response = client.post(
		"/auth/employees",
		headers=csrf_headers(client),
		json={
			"name": "Operations User",
			"email": "OPS@IDCENERGY.CO",
			"password": "Temporary!Password88",
			"role": "employee",
		},
	)
	assert response.status_code == 201
	created = response.get_json()["employee"]
	assert created["email"] == "ops@idcenergy.co"
	assert created["must_change_password"] is True

	employee_client = app.test_client()
	assert login(employee_client, "ops@idcenergy.co", "Temporary!Password88").status_code == 200
	assert employee_client.get("/auth/employees").status_code == 403
	blocked = employee_client.get("/api/protected")
	assert blocked.status_code == 403
	assert blocked.get_json()["error"] == "password_change_required"
	assert employee_client.post(
		"/auth/change-password",
		headers=csrf_headers(employee_client),
		json={
			"current_password": "Temporary!Password88",
			"new_password": "Permanent!Password889",
		},
	).status_code == 200
	assert employee_client.get("/api/protected").status_code == 200


def test_weak_password_is_rejected_server_side(client):
	assert login(client).status_code == 200
	response = client.post(
		"/auth/employees",
		headers=csrf_headers(client),
		json={
			"name": "Weak Password",
			"email": "weak@idcenergy.co",
			"password": "password1234",
			"role": "employee",
		},
	)
	assert response.status_code == 400
	assert response.get_json()["error"] == "weak_password"


def test_disabling_account_revokes_existing_sessions(client, app):
	assert login(client).status_code == 200
	create_response = client.post(
		"/auth/employees",
		headers=csrf_headers(client),
		json={
			"name": "Disable Target",
			"email": "disable@idcenergy.co",
			"password": "Temporary!Password91",
			"role": "employee",
		},
	)
	employee_id = create_response.get_json()["employee"]["id"]

	employee_client = app.test_client()
	assert login(employee_client, "disable@idcenergy.co", "Temporary!Password91").status_code == 200
	assert employee_client.get("/auth/me").status_code == 200

	disabled = client.delete(
		f"/auth/employees/{employee_id}",
		headers=csrf_headers(client),
	)
	assert disabled.status_code == 200
	assert disabled.get_json()["employee"]["is_active"] is False
	assert employee_client.get("/auth/me").status_code == 401


def test_password_change_revokes_other_sessions_and_rotates_current(client, app):
	assert login(client).status_code == 200
	old_session_cookie = client.get_cookie("idc_session").value
	second_client = app.test_client()
	assert login(second_client).status_code == 200

	response = client.post(
		"/auth/change-password",
		headers=csrf_headers(client),
		json={
			"current_password": "CorrectHorse!Battery9",
			"new_password": "NewCorrect!Battery92",
		},
	)
	assert response.status_code == 200
	new_session_cookie = client.get_cookie("idc_session").value
	assert new_session_cookie != old_session_cookie
	assert client.get("/auth/me").status_code == 200
	assert second_client.get("/auth/me").status_code == 401
	with database.db_session() as session:
		old_record = session.query(AuthSession).filter_by(
			token_hash=hash_secret(old_session_cookie),
		).one()
		new_record = session.query(AuthSession).filter_by(
			token_hash=hash_secret(new_session_cookie),
		).one()
		assert old_record.revoked_at is not None
		assert new_record.revoked_at is None


def test_admin_cannot_disable_or_demote_self(client):
	assert login(client).status_code == 200
	admin_id = client.get("/auth/me").get_json()["user"]["id"]
	assert client.delete(
		f"/auth/employees/{admin_id}",
		headers=csrf_headers(client),
	).status_code == 400
	response = client.put(
		f"/auth/employees/{admin_id}",
		headers=csrf_headers(client),
		json={"role": "employee"},
	)
	assert response.status_code == 400
	assert response.get_json()["error"] == "cannot_remove_own_admin_access"


def test_duplicate_email_is_case_insensitive(client):
	assert login(client).status_code == 200
	response = client.post(
		"/auth/employees",
		headers=csrf_headers(client),
		json={
			"name": "Duplicate Admin",
			"email": "ADMIN@IDCENERGY.CO",
			"password": "Another!SecurePass77",
			"role": "employee",
		},
	)
	assert response.status_code == 409


def test_logout_revokes_server_session(client):
	assert login(client).status_code == 200
	assert client.post("/auth/logout", headers=csrf_headers(client)).status_code == 200
	assert client.get("/auth/me").status_code == 401
	with database.db_session() as session:
		assert session.query(AuthSession).filter(AuthSession.revoked_at.is_not(None)).count() == 1


def test_signup_is_disabled_and_production_cookie_is_secure(client, monkeypatch):
	assert client.post("/auth/signup", json={}).status_code == 403
	monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
	response = login(client)
	assert response.status_code == 200
	session_cookie = next(
		value for value in response.headers.getlist("Set-Cookie")
		if value.startswith("idc_session=")
	)
	assert "Secure" in session_cookie


def test_repeated_failures_lock_account_without_revealing_account_state(client, app):
	for _ in range(5):
		response = login(client, password="WrongPassword!2026")
		assert response.status_code == 401
		assert response.get_json() == {"error": "invalid_credentials"}

	locked = login(client)
	assert locked.status_code == 401
	assert locked.get_json() == {"error": "invalid_credentials"}
	unknown_client = app.test_client()
	for _ in range(6):
		unknown = login(
			unknown_client,
			email="unknown@idcenergy.co",
			password="WrongPassword!2026",
		)
		assert unknown.status_code == 401
		assert unknown.get_json() == {"error": "invalid_credentials"}
	with database.db_session() as session:
		employee = session.query(Employee).filter_by(email="admin@idcenergy.co").one()
		assert employee.failed_login_attempts == 5
		assert employee.locked_until is not None


def test_login_spray_limiter_has_a_bounded_key_cache(monkeypatch):
	monkeypatch.setenv("LOGIN_RATE_LIMIT_ATTEMPTS", "5")
	monkeypatch.setenv("LOGIN_RATE_LIMIT_MAX_KEYS", "2")
	auth_util._LOGIN_ATTEMPTS.clear()
	try:
		assert consume_login_attempt("ip-a:user-a") is True
		assert consume_login_attempt("ip-b:user-b") is True
		assert consume_login_attempt("ip-c:user-c") is True
		assert list(auth_util._LOGIN_ATTEMPTS) == ["ip-b:user-b", "ip-c:user-c"]
	finally:
		auth_util._LOGIN_ATTEMPTS.clear()


def test_admin_reset_reenable_and_audit_lifecycle(client, app):
	assert login(client).status_code == 200
	created = client.post(
		"/auth/employees",
		headers=csrf_headers(client),
		json={
			"name": "Lifecycle User",
			"email": "lifecycle@idcenergy.co",
			"password": "Temporary!Password73",
			"role": "employee",
		},
	)
	assert created.status_code == 201
	employee_id = created.get_json()["employee"]["id"]

	employee_client = app.test_client()
	assert login(employee_client, "lifecycle@idcenergy.co", "Temporary!Password73").status_code == 200
	reset = client.put(
		f"/auth/employees/{employee_id}",
		headers=csrf_headers(client),
		json={"temporary_password": "Replacement!Password74"},
	)
	assert reset.status_code == 200
	assert reset.get_json()["employee"]["must_change_password"] is True
	assert employee_client.get("/auth/me").status_code == 401
	assert login(app.test_client(), "lifecycle@idcenergy.co", "Temporary!Password73").status_code == 401

	disabled = client.delete(
		f"/auth/employees/{employee_id}",
		headers=csrf_headers(client),
	)
	assert disabled.status_code == 200
	assert login(app.test_client(), "lifecycle@idcenergy.co", "Replacement!Password74").status_code == 401

	reenabled = client.put(
		f"/auth/employees/{employee_id}",
		headers=csrf_headers(client),
		json={"is_active": True},
	)
	assert reenabled.status_code == 200
	assert reenabled.get_json()["employee"]["is_active"] is True
	assert login(app.test_client(), "lifecycle@idcenergy.co", "Replacement!Password74").status_code == 200

	audit_response = client.get("/auth/account-audit")
	assert audit_response.status_code == 200
	actions = [item["action"] for item in audit_response.get_json()["items"]]
	assert actions.count("account_created") == 1
	assert actions.count("account_updated") == 2
	assert actions.count("account_disabled") == 1
	with database.db_session() as session:
		serialized_details = " ".join(
			item.details or "" for item in session.query(AccountAuditLog).all()
		)
		assert "Replacement!Password74" not in serialized_details


def test_whitespace_only_account_and_entity_names_are_rejected(client):
	assert login(client).status_code == 200
	assert client.put(
		"/auth/me",
		headers=csrf_headers(client),
		json={"name": "   "},
	).status_code == 400
	assert client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "   "},
	).status_code == 400
	assert client.post(
		"/api/suppliers",
		headers=csrf_headers(client),
		json={"name": "   "},
	).status_code == 400
