import importlib


def test_real_app_protects_business_routes_and_restricts_cors(
	app,
	monkeypatch,
	production_environment,
):
	monkeypatch.setenv("SKIP_DB_INIT", "true")
	app_module = importlib.import_module("app")
	production_app = app_module.create_app(initialize_database=False)
	production_app.config["TESTING"] = True
	client = production_app.test_client()

	response = client.get(
		"/api/transactions",
		headers={"Origin": "https://attacker.example"},
	)
	assert response.status_code == 401
	assert "Access-Control-Allow-Origin" not in response.headers
	assert response.headers["X-Content-Type-Options"] == "nosniff"
	assert response.headers["X-Frame-Options"] == "DENY"
	assert response.headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"
	assert response.headers["Cache-Control"] == "no-store"

	allowed = client.options(
		"/auth/login",
		headers={
			"Origin": "https://www.idcenergy.co",
			"Access-Control-Request-Method": "POST",
		},
	)
	assert allowed.headers["Access-Control-Allow-Origin"] == "https://www.idcenergy.co"
	assert allowed.headers["Access-Control-Allow-Credentials"] == "true"
