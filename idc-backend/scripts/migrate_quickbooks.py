#!/usr/bin/env python3
"""
QuickBooks Database Migration Script

This script creates the necessary database tables for QuickBooks integration:
- quickbooks_tokens: Store OAuth access/refresh tokens
- Adds QuickBooks fields to existing tables (clients, transactions)

Run this script to set up QuickBooks integration in your database.

Usage:
    python scripts/migrate_quickbooks.py
"""

import sys
import os

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_engine
from sqlalchemy import text, inspect
from models import Base, QuickBooksToken


def check_table_exists(engine, table_name):
    """Check if a table exists in the database"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def check_column_exists(engine, table_name, column_name):
    """Check if a column exists in a table"""
    inspector = inspect(engine)
    if not check_table_exists(engine, table_name):
        return False

    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def migrate_quickbooks_tables():
    """Run QuickBooks database migrations"""
    print("=" * 60)
    print("QuickBooks Database Migration")
    print("=" * 60)
    print()

    engine = get_engine()

    try:
        with engine.connect() as conn:
            # 1. Create quickbooks_tokens table
            print("1. Checking quickbooks_tokens table...")
            if not check_table_exists(engine, 'quickbooks_tokens'):
                print("   Creating quickbooks_tokens table...")
                QuickBooksToken.__table__.create(engine)
                print("   ✓ quickbooks_tokens table created")
            else:
                print("   ✓ quickbooks_tokens table already exists")

            # 2. Add quickbooks_customer_id to clients table
            print("\n2. Checking clients.quickbooks_customer_id column...")
            if not check_column_exists(engine, 'clients', 'quickbooks_customer_id'):
                print("   Adding quickbooks_customer_id to clients table...")
                conn.execute(text(
                    "ALTER TABLE clients ADD COLUMN quickbooks_customer_id VARCHAR"
                ))
                conn.commit()
                print("   ✓ quickbooks_customer_id column added to clients")
            else:
                print("   ✓ quickbooks_customer_id column already exists in clients")

            # 3. Add QuickBooks fields to transactions table
            print("\n3. Checking transactions QuickBooks columns...")

            if not check_column_exists(engine, 'transactions', 'quickbooks_invoice_id'):
                print("   Adding quickbooks_invoice_id to transactions table...")
                conn.execute(text(
                    "ALTER TABLE transactions ADD COLUMN quickbooks_invoice_id VARCHAR"
                ))
                conn.commit()
                print("   ✓ quickbooks_invoice_id column added")
            else:
                print("   ✓ quickbooks_invoice_id column already exists")

            if not check_column_exists(engine, 'transactions', 'quickbooks_invoice_number'):
                print("   Adding quickbooks_invoice_number to transactions table...")
                conn.execute(text(
                    "ALTER TABLE transactions ADD COLUMN quickbooks_invoice_number VARCHAR"
                ))
                conn.commit()
                print("   ✓ quickbooks_invoice_number column added")
            else:
                print("   ✓ quickbooks_invoice_number column already exists")

            if not check_column_exists(engine, 'transactions', 'invoiced_at'):
                print("   Adding invoiced_at to transactions table...")
                conn.execute(text(
                    "ALTER TABLE transactions ADD COLUMN invoiced_at TIMESTAMP"
                ))
                conn.commit()
                print("   ✓ invoiced_at column added")
            else:
                print("   ✓ invoiced_at column already exists")

            print("\n" + "=" * 60)
            print("Migration Complete!")
            print("=" * 60)
            print("\nYour database is now ready for QuickBooks integration.")
            print("\nNext steps:")
            print("1. Set up QuickBooks OAuth credentials (see QUICKBOOKS_SETUP.md)")
            print("2. Run: python test_quickbooks.py check-connection")
            print("3. Connect to QuickBooks via the /quickbooks/auth/connect endpoint")

    except Exception as e:
        print(f"\n✗ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(migrate_quickbooks_tables())
