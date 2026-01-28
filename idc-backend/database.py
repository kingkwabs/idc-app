import json
import os
from contextlib import asynccontextmanager
from typing import Optional, AsyncGenerator

import aioboto3
from botocore.exceptions import ClientError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession, AsyncEngine
from sqlalchemy.pool import NullPool

# AWS Secrets Manager settings
SECRET_NAME = os.getenv("DB_SECRET_NAME", "app/transactions-db-config")
REGION_NAME = "eu-north-1"

_engine: Optional[AsyncEngine] = None
_AsyncSessionLocal: Optional[async_sessionmaker] = None


async def _get_db_credentials() -> dict:
	"""Fetch database credentials JSON from AWS Secrets Manager using aioboto3."""
	session = aioboto3.Session()
	async with session.client(service_name="secretsmanager", region_name=REGION_NAME) as client:
		try:
			secret_value = await client.get_secret_value(SecretId=SECRET_NAME)
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

			if not host or not port or not dbname:
				cluster_arn = os.getenv("DB_CLUSTER_ARN") or os.getenv("DB_CLUSTER_ID")
				if cluster_arn:
					async with session.client("rds", region_name=REGION_NAME) as rds:
						identifier = cluster_arn.split(":cluster:")[-1] if ":cluster:" in cluster_arn else cluster_arn
						resp = await rds.describe_db_clusters(DBClusterIdentifier=identifier)
						cluster = resp["DBClusters"][0]
						host = host or cluster.get("Endpoint")
						port = port or cluster.get("Port")
						dbname = dbname or cluster.get("DatabaseName") or "postgres"

			if not (username and password and host and port and dbname):
				raise RuntimeError(f"DB secret missing required fields (have keys: {list(data.keys())}); resolved host={bool(host)} port={port} dbname={dbname}")

			return {"username": username, "password": password, "host": host, "port": port or 5432, "dbname": dbname}
		except ClientError as e:
			raise RuntimeError(f"Error fetching DB secret: {e}")


async def get_engine() -> AsyncEngine:
	"""Create or return a cached async SQLAlchemy engine using credentials from Secrets Manager."""
	global _engine, _AsyncSessionLocal
	if _engine is not None:
		return _engine

	creds = await _get_db_credentials()
	username = creds["username"]
	password = creds["password"]
	host = creds["host"]
	port = creds["port"]
	dbname = creds.get("dbname", "postgres")

	# Use asyncpg driver for PostgreSQL async
	connection_uri = f"postgresql+asyncpg://{username}:{password}@{host}:{port}/{dbname}"
	_engine = create_async_engine(
		connection_uri,
		pool_pre_ping=True,
		pool_size=10,
		max_overflow=20,
		pool_recycle=3600,
		echo=False,
		connect_args={
			"timeout": 10,
			"command_timeout": 30,
		}
	)
	_AsyncSessionLocal = async_sessionmaker(
		_engine,
		class_=AsyncSession,
		expire_on_commit=False,
		autocommit=False,
		autoflush=False,
	)
	return _engine


def get_sessionmaker() -> async_sessionmaker:
	"""Return the async session maker (requires engine to be initialized)."""
	global _AsyncSessionLocal
	if _AsyncSessionLocal is None:
		raise RuntimeError("Engine not initialized. Call get_engine() first.")
	return _AsyncSessionLocal


@asynccontextmanager
async def db_session() -> AsyncGenerator[AsyncSession, None]:
	"""Provide an async transactional scope around a series of operations."""
	SessionLocal = get_sessionmaker()
	session: AsyncSession = SessionLocal()
	try:
		yield session
		await session.commit()
	except Exception:
		await session.rollback()
		raise
	finally:
		await session.close()
