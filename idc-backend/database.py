import json
import os
from contextlib import contextmanager
from typing import Generator, Optional

import boto3
import psycopg2
from botocore.exceptions import ClientError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

_engine = None
_SessionLocal: Optional[sessionmaker] = None


def _env_int(name: str, default: int) -> int:
	value = os.getenv(name)
	if value is None:
		return default
	try:
		return int(value)
	except ValueError as exc:
		raise RuntimeError(f"{name} must be an integer") from exc


def _secret_name() -> str:
	return os.getenv("DB_SECRET_NAME", "app/transactions-db-config")


def _region_name() -> str:
	return os.getenv("AWS_REGION", "eu-north-1")


def _secret_json(client, secret_id: str) -> dict:
	"""Fetch and parse a JSON secret from AWS Secrets Manager."""
	secret_value = client.get_secret_value(SecretId=secret_id)
	data_raw = secret_value.get("SecretString")
	if not data_raw:
		raise RuntimeError("Database secret has no SecretString")
	try:
		data = json.loads(data_raw)
	except (json.JSONDecodeError, TypeError) as exc:
		raise RuntimeError("Database secret is not valid JSON") from exc
	if not isinstance(data, dict):
		raise RuntimeError("Database secret must contain a JSON object")
	return data


def _credential_secret_ref(data: dict) -> Optional[str]:
	"""Return a referenced credential secret name/ARN from an app config secret."""
	for key in (
		"db_credentials_secret_arn",
		"db_credentials_secret_name",
		"db_secret_arn",
		"db_secret_name",
		"rds_master_secret_arn",
		"rds_master_secret_name",
		"secret_arn",
		"secret_name",
	):
		value = data.get(key)
		if value:
			return value
	return None


def _resolve_cluster(session) -> dict:
	"""Resolve RDS cluster metadata used for host/port/dbname and rotating secret ARN."""
	cluster_arn = os.getenv("DB_CLUSTER_ARN") or os.getenv("DB_CLUSTER_ID")
	if not cluster_arn:
		return {}
	rds = session.client("rds", region_name=_region_name())
	identifier = cluster_arn.split(":cluster:")[-1] if ":cluster:" in cluster_arn else cluster_arn
	resp = rds.describe_db_clusters(DBClusterIdentifier=identifier)
	clusters = resp.get("DBClusters") or []
	if not clusters:
		raise RuntimeError("Configured RDS cluster was not found")
	return clusters[0]


def _get_db_credentials() -> dict:
	"""Fetch database credentials, following stable config and rotating RDS secrets."""
	session = boto3.session.Session()
	client = session.client(service_name="secretsmanager", region_name=_region_name())
	try:
		secret_name = _secret_name()
		data = _secret_json(client, secret_name)
		loaded_secret_ids = {secret_name}

		# A stable app config secret may point to the actual rotating credential secret.
		credential_ref = _credential_secret_ref(data)
		if credential_ref and credential_ref not in loaded_secret_ids:
			credential_data = _secret_json(client, credential_ref)
			data = {**data, **credential_data}
			loaded_secret_ids.add(credential_ref)

		cluster = {}
		if os.getenv("DB_USE_CLUSTER_MASTER_SECRET", "true").lower() not in {"0", "false", "no"}:
			cluster = _resolve_cluster(session)
			master_secret_arn = (cluster.get("MasterUserSecret") or {}).get("SecretArn")
			if master_secret_arn and master_secret_arn not in loaded_secret_ids:
				credential_data = _secret_json(client, master_secret_arn)
				data = {**data, **credential_data}
				loaded_secret_ids.add(master_secret_arn)

		# Normalize common RDS secret shapes
		username = data.get("username") or data.get("user") or data.get("dbUser")
		password = data.get("password") or data.get("pwd")
		host = data.get("host") or data.get("hostname") or data.get("address")
		port = data.get("port")
		dbname = data.get("dbname") or data.get("database") or data.get("dbName")

		# Fallbacks when the RDS-managed secret omits host/port/dbname
		if not host:
			host = os.getenv("DB_HOST")
		if not port:
			port_env = os.getenv("DB_PORT")
			port = port_env if port_env else None
		if not dbname:
			dbname = os.getenv("DB_NAME")

		if (not host or not port or not dbname):
			if not cluster:
				cluster = _resolve_cluster(session)
			if cluster:
				host = host or cluster.get("Endpoint")
				port = port or cluster.get("Port")
				dbname = dbname or cluster.get("DatabaseName") or "postgres"

		missing_fields = [
			name
			for name, value in (
				("username", username),
				("password", password),
				("host", host),
				("port", port),
				("dbname", dbname),
			)
			if not value
		]
		if missing_fields:
			raise RuntimeError(
				"Database configuration is missing required fields: "
				+ ", ".join(missing_fields)
			)

		try:
			port_number = int(port)
		except (TypeError, ValueError) as exc:
			raise RuntimeError("Database port must be an integer") from exc
		if not 1 <= port_number <= 65535:
			raise RuntimeError("Database port must be between 1 and 65535")

		return {
			"username": username,
			"password": password,
			"host": host,
			"port": port_number,
			"dbname": dbname,
		}
	except ClientError as exc:
		code = (exc.response.get("Error") or {}).get("Code", "AWS error")
		raise RuntimeError(
			f"Unable to resolve database credentials from AWS ({code})"
		) from exc


def get_engine():
	"""Create or return an engine that resolves rotating credentials per new connection."""
	global _engine, _SessionLocal
	if _engine is not None:
		return _engine

	def connect_with_current_secret():
		creds = _get_db_credentials()
		sslmode = os.getenv("DB_SSLMODE", "require" if os.getenv("RENDER") else "prefer")
		connect_kwargs = {
			"user": creds["username"],
			"password": creds["password"],
			"host": creds["host"],
			"port": creds["port"],
			"dbname": creds.get("dbname", "postgres"),
			"connect_timeout": _env_int("DB_CONNECT_TIMEOUT_SECONDS", 10),
			"options": f"-c statement_timeout={_env_int('DB_STATEMENT_TIMEOUT_MS', 30000)}",
			"application_name": os.getenv("DB_APPLICATION_NAME", "idc-backend"),
			"sslmode": sslmode,
		}
		sslrootcert = os.getenv("DB_SSLROOTCERT")
		if sslrootcert:
			connect_kwargs["sslrootcert"] = sslrootcert
		if sslmode in {"verify-ca", "verify-full"} and not sslrootcert:
			raise RuntimeError("DB_SSLROOTCERT is required when DB_SSLMODE verifies certificates")
		return psycopg2.connect(**connect_kwargs)

	_engine = create_engine(
		"postgresql+psycopg2://",
		creator=connect_with_current_secret,
		pool_pre_ping=True,
		pool_size=_env_int("DB_POOL_SIZE", 5),
		max_overflow=_env_int("DB_MAX_OVERFLOW", 5),
		pool_recycle=_env_int("DB_POOL_RECYCLE_SECONDS", 300),
		pool_timeout=_env_int("DB_POOL_TIMEOUT_SECONDS", 15),
		pool_use_lifo=True,
	)
	_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
	return _engine


def reset_engine() -> None:
	"""Dispose cached connections so the next request rebuilds the pool."""
	global _engine, _SessionLocal
	if _engine is not None:
		_engine.dispose()
	_engine = None
	_SessionLocal = None


def get_sessionmaker() -> sessionmaker:
	global _SessionLocal
	if _SessionLocal is None:
		get_engine()
	if _SessionLocal is None:
		raise RuntimeError("Database session factory was not initialized")
	return _SessionLocal


@contextmanager
def db_session() -> Generator[Session, None, None]:
	"""Provide a transactional scope around a series of operations."""
	SessionLocal = get_sessionmaker()
	session: Session = SessionLocal()
	try:
		yield session
		session.commit()
	except Exception:
		session.rollback()
		raise
	finally:
		session.close()
