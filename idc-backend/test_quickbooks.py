#!/usr/bin/env python3
"""
QuickBooks Integration Test Script

Tests the QuickBooks OAuth flow, customer creation, and invoice generation.
Run this locally to verify the integration before deploying.

Usage:
    python test_quickbooks.py --help
    python test_quickbooks.py check-connection
    python test_quickbooks.py test-customer --client-id 1
    python test_quickbooks.py test-invoice --transaction-id 1
    python test_quickbooks.py full-test
"""

# This is a manually invoked sandbox smoke tool, not a pytest test module.
__test__ = False

import os
import sys
import argparse
from datetime import datetime
from database import db_session, get_engine
from models import Base, Client, Transaction, SupplierQuote, AssociatedCost, Supplier
from quickbooks_service import QuickBooksService
from routes_quickbooks import _build_invoice_plan

# Colors for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}✓ {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}✗ {msg}{Colors.END}")

def print_info(msg):
    print(f"{Colors.BLUE}ℹ {msg}{Colors.END}")

def print_warning(msg):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.END}")

def print_header(msg):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{msg}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")


def check_env_vars():
    """Check if required environment variables are set"""
    print_header("Checking Environment Variables")

    required_vars = [
        'QB_CLIENT_ID',
        'QB_CLIENT_SECRET',
        'QB_REDIRECT_URI',
        'QB_ENVIRONMENT',
        'QB_TOKEN_ENCRYPTION_KEY',
        'QB_SERVICE_ITEM_NAME',
    ]
    missing = []

    for var in required_vars:
        value = os.getenv(var)
        if value:
            # Mask sensitive values
            if 'SECRET' in var or 'KEY' in var:
                display_value = value[:4] + '...' + value[-4:] if len(value) > 8 else '***'
            else:
                display_value = value
            print_success(f"{var} = {display_value}")
        else:
            print_error(f"{var} is not set")
            missing.append(var)

    if missing:
        print_error(f"\nMissing environment variables: {', '.join(missing)}")
        print_info("Set these in your .env file or export them")
        return False

    print_success("\nAll environment variables are set!")
    return True


def check_connection():
    """Check if QuickBooks is connected"""
    print_header("Checking QuickBooks Connection")

    if not check_env_vars():
        return False

    with db_session() as session:
        qb_service = QuickBooksService(session)

        if not qb_service.is_connected():
            print_error("QuickBooks is not connected")
            print_info("Connect the sandbox company from the authenticated QuickBooks settings page.")
            return False

        print_success("QuickBooks is connected!")

        # Get token info
        from models import QuickBooksToken
        token = session.query(QuickBooksToken).first()
        if token:
            print_info(f"Token expires at: {token.token_expires_at}")
            print_info(f"Refresh expires at: {token.refresh_expires_at}")

            # Check if token is expired
            if datetime.utcnow() >= token.token_expires_at:
                print_warning("Access token is expired (will be auto-refreshed on next API call)")

            if datetime.utcnow() >= token.refresh_expires_at:
                print_error("Refresh token is expired! You need to reconnect QuickBooks")
                return False

        return True


def create_test_data():
    """Create test data for QuickBooks testing"""
    print_header("Creating Test Data")

    with db_session() as session:
        # Check if test client exists
        test_client = session.query(Client).filter(Client.name == "Test Client QB").first()
        if not test_client:
            test_client = Client(name="Test Client QB", contact_name="John Doe", email="test@example.com")
            session.add(test_client)
            session.commit()
            print_success(f"Created test client: {test_client.name} (ID: {test_client.id})")
        else:
            print_info(f"Test client already exists (ID: {test_client.id})")

        # Check if test supplier exists
        test_supplier = session.query(Supplier).filter(Supplier.name == "Test Supplier QB").first()
        if not test_supplier:
            test_supplier = Supplier(name="Test Supplier QB", contact_name="Jane Smith")
            session.add(test_supplier)
            session.commit()
            print_success(f"Created test supplier: {test_supplier.name} (ID: {test_supplier.id})")
        else:
            print_info(f"Test supplier already exists (ID: {test_supplier.id})")

        # Create test transaction
        test_transaction = Transaction(
            client_id=test_client.id,
            rfq_number=f"TEST-RFQ-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            client_po_number=f"TEST-PO-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            client_po_amount=5000.00,
            item_description="Test Equipment for QuickBooks Integration",
            status="prepare-proposal",
        )
        session.add(test_transaction)
        session.commit()
        print_success(f"Created test transaction (ID: {test_transaction.id})")

        # Add supplier quote
        test_quote = SupplierQuote(
            transaction_id=test_transaction.id,
            supplier_id=test_supplier.id,
            amount=4000.00,
            lead_time_days=30,
            notes="Test quote for QB integration"
        )
        session.add(test_quote)
        session.commit()
        print_success(f"Created test supplier quote (ID: {test_quote.id})")

        # Add associated costs
        costs = [
            AssociatedCost(transaction_id=test_transaction.id, description="Shipping", amount=500.00),
            AssociatedCost(transaction_id=test_transaction.id, description="Handling Fee", amount=250.00),
            AssociatedCost(transaction_id=test_transaction.id, description="Insurance", amount=250.00),
        ]
        for cost in costs:
            session.add(cost)
        session.commit()
        print_success(f"Created {len(costs)} associated costs")

        print_success(f"\nTest data created successfully!")
        print_info(f"Transaction ID: {test_transaction.id}")
        print_info(f"Client ID: {test_client.id}")
        print_info(f"Total Amount: ${test_transaction.client_po_amount}")

        return test_transaction.id, test_client.id


def test_customer_creation(client_id=None):
    """Test customer creation/lookup in QuickBooks"""
    print_header("Testing Customer Creation/Lookup")

    if not check_connection():
        return False

    with db_session() as session:
        qb_service = QuickBooksService(session)

        # Get client
        if client_id:
            client = session.query(Client).filter(Client.id == client_id).first()
        else:
            client = session.query(Client).first()

        if not client:
            print_error("No client found in database")
            print_info("Run: python test_quickbooks.py full-test")
            return False

        print_info(f"Testing with client: {client.name} (ID: {client.id})")

        try:
            customer_id = qb_service.find_or_create_customer(client)
            print_success(f"Customer created/found in QuickBooks!")
            print_info(f"QuickBooks Customer ID: {customer_id}")

            # Verify it was stored in database
            session.refresh(client)
            if client.quickbooks_customer_id:
                print_success(f"Customer ID stored in database: {client.quickbooks_customer_id}")

            return True
        except Exception as e:
            print_error(f"Failed to create/find customer ({type(e).__name__})")
            return False


def test_invoice_creation(transaction_id=None):
    """Test invoice creation in QuickBooks"""
    print_header("Testing Invoice Creation")

    if not check_connection():
        return False

    with db_session() as session:
        qb_service = QuickBooksService(session)

        # Get transaction
        if transaction_id:
            transaction = session.query(Transaction).filter(Transaction.id == transaction_id).first()
        else:
            transaction = session.query(Transaction).filter(
                Transaction.quickbooks_invoice_id == None
            ).first()

        if not transaction:
            print_error("No transaction found")
            print_info("Run: python test_quickbooks.py full-test")
            return False

        print_info(f"Testing with transaction ID: {transaction.id}")
        print_info(f"Client: {transaction.client.name}")
        print_info(f"RFQ: {transaction.rfq_number}")

        # Check if already invoiced
        if transaction.quickbooks_invoice_id:
            print_warning(f"Transaction already has an invoice: {transaction.quickbooks_invoice_number}")
            print_info("Skipping invoice creation")
            return True

        # Reuse the production planner. Associated costs stay internal unless
        # their IDs are explicitly supplied to the planner.
        plan = _build_invoice_plan(session, transaction)
        if not plan["can_create"]:
            for error in plan["errors"]:
                print_error(error)
            return False
        line_items = plan["line_items"]

        print_info(f"\nInvoice will have {len(line_items)} line items:")
        total = 0
        for item in line_items:
            print_info(f"  - {item['description']}: ${item['amount']:.2f}")
            total += item['amount']
        print_info(f"Total: ${total:.2f}")

        # Create invoice
        try:
            print_info("\nCreating invoice in QuickBooks...")
            qb_client = qb_service.get_client()
            result = qb_service.create_invoice(
                transaction=transaction,
                line_items=line_items,
                notes=plan["notes"],
                attach_documents=False,
                qb_client=qb_client,
                currency=plan["currency"],
            )

            print_success("Invoice created successfully!")
            print_info(f"Invoice ID: {result['invoice_id']}")
            print_info(f"Invoice Number: {result['invoice_number']}")
            print_info(f"Total: ${result['total']}")

            return True
        except Exception as e:
            print_error(f"Failed to create invoice ({type(e).__name__})")
            return False


def full_test():
    """Run full end-to-end test"""
    print_header("Running Full QuickBooks Integration Test")

    # Step 1: Check environment
    if not check_env_vars():
        return False

    # Step 2: Check connection
    if not check_connection():
        return False

    # Step 3: Create test data
    transaction_id, client_id = create_test_data()

    # Step 4: Test customer creation
    if not test_customer_creation(client_id):
        return False

    # Step 5: Test invoice creation
    if not test_invoice_creation(transaction_id):
        return False

    print_header("Full Test Complete!")
    print_success("All tests passed! ✓")
    print_info("\nYou can now view the invoice in your QuickBooks account")
    return True


def main():
    if os.getenv("QB_ENVIRONMENT", "").lower() != "sandbox":
        print_error("Refusing to run: QB_ENVIRONMENT must be sandbox.")
        return 2
    if os.getenv("QB_ALLOW_SANDBOX_SMOKE", "").lower() not in {"1", "true", "yes"}:
        print_error("Refusing to run: set QB_ALLOW_SANDBOX_SMOKE=true explicitly.")
        return 2

    parser = argparse.ArgumentParser(
        description='QuickBooks Integration Test Suite',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_quickbooks.py check-connection
  python test_quickbooks.py test-customer --client-id 1
  python test_quickbooks.py test-invoice --transaction-id 5
  python test_quickbooks.py full-test
        """
    )

    parser.add_argument(
        'command',
        choices=['check-connection', 'test-customer', 'test-invoice', 'full-test', 'create-data'],
        help='Test command to run'
    )
    parser.add_argument('--client-id', type=int, help='Client ID for customer test')
    parser.add_argument('--transaction-id', type=int, help='Transaction ID for invoice test')

    args = parser.parse_args()

    # Ensure database tables exist
    try:
        engine = get_engine()
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print_error(f"Database initialization failed: {e}")
        return 1

    # Run command
    try:
        if args.command == 'check-connection':
            success = check_connection()
        elif args.command == 'test-customer':
            success = test_customer_creation(args.client_id)
        elif args.command == 'test-invoice':
            success = test_invoice_creation(args.transaction_id)
        elif args.command == 'create-data':
            create_test_data()
            success = True
        elif args.command == 'full-test':
            success = full_test()
        else:
            parser.print_help()
            return 1

        return 0 if success else 1
    except KeyboardInterrupt:
        print_error("\n\nTest interrupted by user")
        return 1
    except Exception as e:
        print_error(f"\nUnexpected error ({type(e).__name__})")
        return 1


if __name__ == '__main__':
    sys.exit(main())
