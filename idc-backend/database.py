import json
import os
from contextlib import contextmanager
from typing import Generator, Optional

import boto3
from botocore.exceptions import ClientError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

# AWS Secrets Manager settings
# Prefer environment variable so we can point to the RDS-managed rotating secret directly
SECRET_NAME = os.getenv("DB_SECRET_NAME", "app/transactions-db-config")
REGION_NAME = "eu-north-1"

_engine = None
_SessionLocal: Optional[sessionmaker] = None


def _get_db_credentials() -> dict:
	"""Fetch database credentials JSON from AWS Secrets Manager."""
	session = boto3.session.Session()
	client = session.client(service_name="secretsmanager", region_name=REGION_NAME)
	try:
		secret_value = client.get_secret_value(SecretId=SECRET_NAME)
		data_raw = secret_value.get("SecretString")
		if not data_raw:
			raise RuntimeError("DB secret has no SecretString")
		data = json.loads(data_raw)
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
			cluster_arn = os.getenv("DB_CLUSTER_ARN") or os.getenv("DB_CLUSTER_ID")
			if cluster_arn:
				rds = session.client("rds", region_name=REGION_NAME)
				# If ARN provided, extract identifier after ':cluster:'; else treat as identifier
				identifier = cluster_arn.split(":cluster:")[-1] if ":cluster:" in cluster_arn else cluster_arn
				resp = rds.describe_db_clusters(DBClusterIdentifier=identifier)
				cluster = resp["DBClusters"][0]
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

	connection_uri = f"postgresql+psycopg2://{username}:{password}@{host}:{port}/{dbname}"
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
