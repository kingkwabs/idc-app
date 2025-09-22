"""
Migration script to create employees table and seed an initial admin user.
"""
import os
import sys
from datetime import datetime
from sqlalchemy import create_engine, Table, Column, Integer, String, DateTime, MetaData
from sqlalchemy.exc import ProgrammingError
import bcrypt

# Use the same DB connection logic as in database.py
DB_URI = os.getenv("MIGRATION_DB_URI") or os.getenv("DATABASE_URL")
if not DB_URI:
    print("Set MIGRATION_DB_URI or DATABASE_URL to your DB connection string.")
    sys.exit(1)

engine = create_engine(DB_URI)
metadata = MetaData()

employees = Table(
    "employees",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    Column("email", String, unique=True, nullable=False),
    Column("password_hash", String, nullable=False),
    Column("role", String, nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow),
    # Placeholders for future QuickBooks/payroll/invoice fields
    Column("quickbooks_employee_id", String, nullable=True),
    Column("payroll_info", String, nullable=True),
    Column("invoice_mapping", String, nullable=True),
)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def main():
    metadata.create_all(engine, tables=[employees])
    conn = engine.connect()
    # Seed admin user if not exists
    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "adminpass123")
    admin_name = os.getenv("ADMIN_NAME", "Admin User")
    admin_role = "admin"
    result = conn.execute(employees.select().where(employees.c.email == admin_email)).fetchone()
    if not result:
        pw_hash = hash_password(admin_password)
        conn.execute(
            employees.insert().values(
                name=admin_name,
                email=admin_email,
                password_hash=pw_hash,
                role=admin_role,
                created_at=datetime.utcnow(),
            )
        )
        print(f"Seeded admin user: {admin_email}")
    else:
        print(f"Admin user already exists: {admin_email}")
    conn.close()

if __name__ == "__main__":
    main()
