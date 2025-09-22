"""
Script to add a new employee to the database with a securely hashed password.
Usage: Set the following environment variables before running:
- NEW_EMPLOYEE_NAME
- NEW_EMPLOYEE_EMAIL
- NEW_EMPLOYEE_PASSWORD
- NEW_EMPLOYEE_ROLE
- MIGRATION_DB_URI (or DATABASE_URL)
"""
import os
from datetime import datetime
from sqlalchemy import create_engine, Table, MetaData
import bcrypt

DB_URI = os.getenv("MIGRATION_DB_URI") or os.getenv("DATABASE_URL")
if not DB_URI:
    raise RuntimeError("Set MIGRATION_DB_URI or DATABASE_URL to your DB connection string.")

name = os.getenv("NEW_EMPLOYEE_NAME")
email = os.getenv("NEW_EMPLOYEE_EMAIL")
password = os.getenv("NEW_EMPLOYEE_PASSWORD")
role = os.getenv("NEW_EMPLOYEE_ROLE", "employee")

if not all([name, email, password]):
    raise RuntimeError("Set NEW_EMPLOYEE_NAME, NEW_EMPLOYEE_EMAIL, and NEW_EMPLOYEE_PASSWORD.")

engine = create_engine(DB_URI)
metadata = MetaData(bind=engine)
metadata.reflect()
employees = metadata.tables["employees"]

pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

with engine.begin() as conn:
    exists = conn.execute(employees.select().where(employees.c.email == email)).fetchone()
    if exists:
        print(f"Employee with email {email} already exists.")
    else:
        conn.execute(
            employees.insert().values(
                name=name,
                email=email,
                password_hash=pw_hash,
                role=role,
                created_at=datetime.utcnow(),
            )
        )
        print(f"Added employee: {email}")
