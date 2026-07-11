import json

import pytest
from botocore.exceptions import ClientError

import database


class FakeSecretsClient:
	def __init__(self, secrets):
		self.secrets = secrets
		self.calls = []

	def get_secret_value(self, SecretId):
		self.calls.append(SecretId)
		value = self.secrets[SecretId]
		if isinstance(value, Exception):
			raise value
		if isinstance(value, str):
			return {"SecretString": value}
		return {"SecretString": json.dumps(value)}


class FakeRdsClient:
	def __init__(self, clusters):
		self.clusters = clusters
		self.calls = []

	def describe_db_clusters(self, DBClusterIdentifier):
		self.calls.append(DBClusterIdentifier)
		return {"DBClusters": self.clusters}


class FakeAwsSession:
	def __init__(self, secrets, clusters=()):
		self.secrets = FakeSecretsClient(secrets)
		self.rds = FakeRdsClient(list(clusters))
		self.client_calls = []

	def client(self, service_name, region_name):
		self.client_calls.append((service_name, region_name))
		if service_name == "secretsmanager":
			return self.secrets
		if service_name == "rds":
			return self.rds
		raise AssertionError(f"Unexpected AWS service: {service_name}")


@pytest.fixture(autouse=True)
def isolated_database_environment(monkeypatch):
	for name in (
		"DB_SECRET_NAME",
		"DB_CLUSTER_ARN",
		"DB_CLUSTER_ID",
		"DB_USE_CLUSTER_MASTER_SECRET",
		"DB_HOST",
		"DB_PORT",
		"DB_NAME",
		"DB_SSLMODE",
		"DB_SSLROOTCERT",
		"RENDER",
	):
		monkeypatch.delenv(name, raising=False)
	monkeypatch.setattr(database, "_engine", None)
	monkeypatch.setattr(database, "_SessionLocal", None)


def install_fake_aws(monkeypatch, fake_session):
	monkeypatch.setattr(database.boto3.session, "Session", lambda: fake_session)


def test_cluster_managed_secret_supplies_current_credentials(monkeypatch):
	cluster_arn = "arn:aws:rds:eu-north-1:123456789012:cluster:idc-energy"
	rotating_secret_arn = "arn:aws:secretsmanager:eu-north-1:123456789012:secret:rds-current"
	fake_session = FakeAwsSession(
		{
			"stable-config": {"purpose": "IDC database configuration"},
			rotating_secret_arn: {
				"username": "current-user",
				"password": "current-password",
			},
		},
		clusters=[{
			"Endpoint": "idc.cluster.example.rds.amazonaws.com",
			"Port": 5432,
			"DatabaseName": "idc",
			"MasterUserSecret": {"SecretArn": rotating_secret_arn},
		}],
	)
	install_fake_aws(monkeypatch, fake_session)
	monkeypatch.setenv("DB_SECRET_NAME", "stable-config")
	monkeypatch.setenv("DB_CLUSTER_ARN", cluster_arn)
	monkeypatch.setenv("AWS_REGION", "eu-north-1")

	credentials = database._get_db_credentials()

	assert credentials == {
		"username": "current-user",
		"password": "current-password",
		"host": "idc.cluster.example.rds.amazonaws.com",
		"port": 5432,
		"dbname": "idc",
	}
	assert fake_session.secrets.calls == ["stable-config", rotating_secret_arn]
	assert fake_session.rds.calls == ["idc-energy"]
	assert fake_session.client_calls == [
		("secretsmanager", "eu-north-1"),
		("rds", "eu-north-1"),
	]


def test_explicit_rotating_secret_reference_works_without_cluster_lookup(monkeypatch):
	fake_session = FakeAwsSession({
		"stable-config": {
			"db_credentials_secret_name": "rotating-credentials",
			"host": "database.example.com",
			"port": "5433",
			"dbname": "operations",
		},
		"rotating-credentials": {
			"username": "runtime-user",
			"password": "runtime-password",
		},
	})
	install_fake_aws(monkeypatch, fake_session)
	monkeypatch.setenv("DB_SECRET_NAME", "stable-config")
	monkeypatch.setenv("DB_USE_CLUSTER_MASTER_SECRET", "false")

	credentials = database._get_db_credentials()

	assert credentials == {
		"username": "runtime-user",
		"password": "runtime-password",
		"host": "database.example.com",
		"port": 5433,
		"dbname": "operations",
	}
	assert fake_session.secrets.calls == ["stable-config", "rotating-credentials"]
	assert fake_session.rds.calls == []


def test_cluster_secret_overrides_stale_credentials_in_stable_config(monkeypatch):
	fake_session = FakeAwsSession(
		{
			"stable-config": {
				"username": "stale-user",
				"password": "stale-password",
				"host": "database.example.com",
				"port": 5432,
				"dbname": "operations",
			},
			"current-credentials": {
				"username": "current-user",
				"password": "current-password",
			},
		},
		clusters=[{
			"MasterUserSecret": {"SecretArn": "current-credentials"},
		}],
	)
	install_fake_aws(monkeypatch, fake_session)
	monkeypatch.setenv("DB_SECRET_NAME", "stable-config")
	monkeypatch.setenv("DB_CLUSTER_ID", "idc-energy")

	credentials = database._get_db_credentials()

	assert credentials["username"] == "current-user"
	assert credentials["password"] == "current-password"


def test_missing_fields_error_does_not_echo_secret_contents(monkeypatch):
	fake_session = FakeAwsSession({
		"stable-config": {
			"password": "do-not-leak-this-value",
			"private-note": "do-not-leak-this-note",
		},
	})
	install_fake_aws(monkeypatch, fake_session)
	monkeypatch.setenv("DB_SECRET_NAME", "stable-config")
	monkeypatch.setenv("DB_USE_CLUSTER_MASTER_SECRET", "false")

	with pytest.raises(RuntimeError) as exc_info:
		database._get_db_credentials()

	message = str(exc_info.value)
	assert message == (
		"Database configuration is missing required fields: "
		"username, host, port, dbname"
	)
	assert "do-not-leak" not in message
	assert "private-note" not in message


def test_empty_cluster_response_has_controlled_error(monkeypatch):
	fake_session = FakeAwsSession({"stable-config": {}})
	install_fake_aws(monkeypatch, fake_session)
	monkeypatch.setenv("DB_SECRET_NAME", "stable-config")
	monkeypatch.setenv("DB_CLUSTER_ID", "missing-cluster")

	with pytest.raises(RuntimeError, match="Configured RDS cluster was not found"):
		database._get_db_credentials()


def test_aws_error_preserves_code_without_resource_details(monkeypatch):
	error = ClientError(
		{
			"Error": {
				"Code": "AccessDeniedException",
				"Message": "Denied for arn:aws:secretsmanager:secret/private-resource",
			},
		},
		"GetSecretValue",
	)
	fake_session = FakeAwsSession({"stable-config": error})
	install_fake_aws(monkeypatch, fake_session)
	monkeypatch.setenv("DB_SECRET_NAME", "stable-config")

	with pytest.raises(RuntimeError) as exc_info:
		database._get_db_credentials()

	message = str(exc_info.value)
	assert message == (
		"Unable to resolve database credentials from AWS (AccessDeniedException)"
	)
	assert "private-resource" not in message


def test_each_new_physical_connection_fetches_current_password(monkeypatch):
	passwords = iter(("first-password", "rotated-password"))
	connect_calls = []
	engine_options = {}
	dummy_engine = object()

	def current_credentials():
		return {
			"username": "idc-user",
			"password": next(passwords),
			"host": "database.example.com",
			"port": 5432,
			"dbname": "operations",
		}

	def fake_create_engine(url, **options):
		assert url == "postgresql+psycopg2://"
		engine_options.update(options)
		return dummy_engine

	def fake_connect(**options):
		connect_calls.append(options)
		return object()

	monkeypatch.setattr(database, "_get_db_credentials", current_credentials)
	monkeypatch.setattr(database, "create_engine", fake_create_engine)
	monkeypatch.setattr(database, "sessionmaker", lambda **options: object())
	monkeypatch.setattr(database.psycopg2, "connect", fake_connect)
	monkeypatch.setenv("DB_SSLMODE", "require")

	assert database.get_engine() is dummy_engine
	engine_options["creator"]()
	engine_options["creator"]()

	assert [call["password"] for call in connect_calls] == [
		"first-password",
		"rotated-password",
	]
	assert engine_options["pool_pre_ping"] is True
	assert engine_options["pool_use_lifo"] is True


@pytest.mark.parametrize("secret_value", ("not-json", "[]"))
def test_database_secret_must_be_a_json_object(monkeypatch, secret_value):
	fake_session = FakeAwsSession({"stable-config": secret_value})
	install_fake_aws(monkeypatch, fake_session)
	monkeypatch.setenv("DB_SECRET_NAME", "stable-config")

	with pytest.raises(RuntimeError, match="Database secret"):
		database._get_db_credentials()
