import pytest

from runtime_config import ProductionConfigurationError, validate_production_environment


def test_valid_production_environment_passes(production_environment):
	validate_production_environment()


@pytest.mark.parametrize(
	"name",
	(
		"CORS_ORIGINS",
		"DB_CLUSTER_ARN",
		"DB_SECRET_NAME",
		"DB_SSLMODE",
		"DB_SSLROOTCERT",
		"FRONTEND_URL",
		"JWT_SECRET",
		"QB_CLIENT_ID",
		"QB_CLIENT_SECRET",
		"QB_ENVIRONMENT",
		"QB_REDIRECT_URI",
		"QB_SERVICE_ITEM_NAME",
		"QB_TOKEN_ENCRYPTION_KEY",
	),
)
def test_required_production_setting_is_named_without_its_value(
	production_environment,
	monkeypatch,
	name,
):
	original_value = production_environment[name]
	monkeypatch.delenv(name)

	with pytest.raises(ProductionConfigurationError) as exc_info:
		validate_production_environment()

	message = str(exc_info.value)
	assert name in message
	if name in {"JWT_SECRET", "QB_CLIENT_SECRET", "QB_TOKEN_ENCRYPTION_KEY"}:
		assert original_value not in message


def test_insecure_urls_cookie_and_database_tls_are_rejected(
	production_environment,
	monkeypatch,
):
	monkeypatch.setenv("FRONTEND_URL", "http://www.idcenergy.co")
	monkeypatch.setenv("CORS_ORIGINS", "*")
	monkeypatch.setenv("QB_REDIRECT_URI", "https://example.com/wrong?code=value")
	monkeypatch.setenv("DB_SSLMODE", "require")
	monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")

	with pytest.raises(ProductionConfigurationError) as exc_info:
		validate_production_environment()

	message = str(exc_info.value)
	assert "FRONTEND_URL must be an HTTPS URL" in message
	assert "CORS_ORIGINS must contain only explicit HTTPS origins" in message
	assert "QB_REDIRECT_URI must be an HTTPS /quickbooks/callback URL" in message
	assert "DB_SSLMODE must be verify-full" in message
	assert "SESSION_COOKIE_SECURE cannot be disabled" in message
	assert "http://www.idcenergy.co" not in message
	assert "code=value" not in message


def test_invalid_encryption_key_and_short_jwt_secret_are_rejected(
	production_environment,
	monkeypatch,
):
	monkeypatch.setenv("QB_TOKEN_ENCRYPTION_KEY", "not-a-fernet-key")
	monkeypatch.setenv("JWT_SECRET", "too-short")

	with pytest.raises(ProductionConfigurationError) as exc_info:
		validate_production_environment()

	message = str(exc_info.value)
	assert "QB_TOKEN_ENCRYPTION_KEY must be a valid Fernet key" in message
	assert "JWT_SECRET must be at least 32 characters" in message
	assert "not-a-fernet-key" not in message
	assert "too-short" not in message
