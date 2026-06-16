import json
import os
from contextlib import contextmanager
from typing import Generator, Optional

import boto3
from botocore.exceptions import ClientError
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, Session

# AWS Secrets Manager settings
# DB_SECRET_NAME can point directly to DB credentials or to a stable app config
# secret that references a rotating RDS-managed credential secret.
SECRET_NAME = os.getenv("DB_SECRET_NAME", "app/transactions-db-config")
REGION_NAME = os.getenv("AWS_REGION", "eu-north-1")

_engine = None
_SessionLocal: Optional[sessionmaker] = None


def _secret_json(client, secret_id: str) -> dict:
	"""Fetch and parse a JSON secret from AWS Secrets Manager."""
	secret_value = client.get_secret_value(SecretId=secret_id)
	data_raw = secret_value.get("SecretString")
	if not data_raw:
		raise RuntimeError(f"Secret {secret_id} has no SecretString")
	return json.loads(data_raw)


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
	rds = session.client("rds", region_name=REGION_NAME)
	identifier = cluster_arn.split(":cluster:")[-1] if ":cluster:" in cluster_arn else cluster_arn
	resp = rds.describe_db_clusters(DBClusterIdentifier=identifier)
	return resp["DBClusters"][0]


def _get_db_credentials() -> dict:
	"""Fetch database credentials, following stable config and rotating RDS secrets."""
	session = boto3.session.Session()
	client = session.client(service_name="secretsmanager", region_name=REGION_NAME)
	try:
		data = _secret_json(client, SECRET_NAME)

		# A stable app config secret may point to the actual rotating credential secret.
		credential_ref = _credential_secret_ref(data)
		if credential_ref:
			credential_data = _secret_json(client, credential_ref)
			data = {**data, **credential_data}

		cluster = {}
		if os.getenv("DB_USE_CLUSTER_MASTER_SECRET", "true").lower() not in {"0", "false", "no"}:
			cluster = _resolve_cluster(session)
			master_secret_arn = (cluster.get("MasterUserSecret") or {}).get("SecretArn")
			if master_secret_arn:
				credential_data = _secret_json(client, master_secret_arn)
				data = {**data, **credential_data}

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
			port = int(port_env) if port_env else None
		if not dbname:
			dbname = os.getenv("DB_NAME")

		if (not host or not port or not dbname):
			if not cluster:
				cluster = _resolve_cluster(session)
			if cluster:
				host = host or cluster.get("Endpoint")
				port = port or cluster.get("Port")
				dbname = dbname or cluster.get("DatabaseName") or "postgres"

		if not (username and password and host and port and dbname):
			raise RuntimeError(f"DB secret missing required fields (have keys: {list(data.keys())}); resolved host={bool(host)} port={port} dbname={dbname}")

		return {"username": username, "password": password, "host": host, "port": port or 5432, "dbname": dbname}
	except ClientError as e:
		raise RuntimeError(f"Error fetching DB secret: {e}")


def get_engine():
	"""Create or return a cached SQLAlchemy engine using credentials from Secrets Manager."""
	global _engine, _SessionLocal
	if _engine is not None:
		return _engine

	creds = _get_db_credentials()
	username = creds["username"]
	password = creds["password"]
	host = creds["host"]
	port = creds["port"]
	dbname = creds.get("dbname", "postgres")

	connection_uri = URL.create(
		"postgresql+psycopg2",
		username=username,
		password=password,
		host=host,
		port=port,
		database=dbname,
	)
	_engine = create_engine(
		connection_uri,
		pool_pre_ping=True,  # Verify connections before using
		pool_size=10,  # Keep 10 connections in pool
		max_overflow=20,  # Allow up to 20 additional connections
		pool_recycle=3600,  # Recycle connections after 1 hour
		pool_timeout=30,  # Wait 30s for connection from pool
		connect_args={
			"connect_timeout": 10,  # 10s connection timeout
			"options": "-c statement_timeout=30000"  # 30s query timeout
		}
	)
	_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
	return _engine


def get_sessionmaker() -> sessionmaker:
	global _SessionLocal
	if _SessionLocal is None:
		get_engine()
	assert _SessionLocal is not None
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
