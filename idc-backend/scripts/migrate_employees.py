"""Explicit one-time initial-admin bootstrap with no default credentials."""

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
	sys.path.insert(0, str(ROOT_DIR))

from sqlalchemy import func
from sqlalchemy.orm import sessionmaker

from auth_util import hash_password, normalize_email, password_policy_errors, utcnow
from database import get_engine
from models import Employee


def main() -> None:
	name = (os.getenv("ADMIN_NAME") or "").strip()
	email = normalize_email(os.getenv("ADMIN_EMAIL") or "")
	password = os.getenv("ADMIN_PASSWORD") or ""
	if not name or not email or not password:
		raise RuntimeError(
			"ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD are required; no defaults are provided."
		)
	password_errors = password_policy_errors(password, email)
	if password_errors:
		raise RuntimeError("Initial admin password rejected: " + " ".join(password_errors))

	session_factory = sessionmaker(bind=get_engine(), autoflush=False)
	with session_factory.begin() as session:
		existing = session.query(Employee).filter(func.lower(Employee.email) == email).first()
		if existing:
			print(f"Admin bootstrap skipped: account already exists for {email}")
			return
		now = utcnow()
		session.add(Employee(
			name=name,
			email=email,
			password_hash=hash_password(password),
			role="admin",
			is_active=True,
			must_change_password=True,
			created_at=now,
			updated_at=now,
			password_changed_at=now,
		))
	print(f"Initial admin created for {email}; password change required on first login.")


if __name__ == "__main__":
	main()
