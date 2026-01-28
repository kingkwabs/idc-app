# Async Flask Migration Guide

## What Changed?

The backend has been **fully migrated to async Flask** for significant performance improvements:

### Key Changes:
1. **Database Layer**: SQLAlchemy async with `asyncpg` driver
2. **AWS Integration**: `aioboto3` for async AWS Secrets Manager calls
3. **Route Handlers**: All endpoints converted to `async def`
4. **Session Management**: Async context managers (`async with db_session()`)

## Performance Benefits

- **Non-blocking I/O**: Database queries no longer block the event loop
- **Concurrent requests**: Handle multiple requests simultaneously
- **Faster AWS calls**: Async AWS Secrets Manager integration
- **Better scalability**: More efficient resource utilization

## Running the Async Server

### Development (with hot reload):
```bash
cd idc-backend
uvicorn app:app --reload --port 5001
```

Or use the provided script:
```bash
./run_async.sh
```

### Production (with Gunicorn + Uvicorn workers):
```bash
gunicorn app:app \
  --bind 0.0.0.0:5001 \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 \
  --timeout 120
```

## Deployment on Render

Update your `render.yaml` start command:
```yaml
services:
  - type: web
    name: idc-backend
    env: python
    buildCommand: "pip install -r requirements.txt"
    startCommand: "gunicorn app:app --bind 0.0.0.0:$PORT --worker-class uvicorn.workers.UvicornWorker --workers 4 --timeout 120"
```

## Migration Checklist

✅ Updated `requirements.txt` with async dependencies:
  - `asyncpg` - PostgreSQL async driver
  - `aioboto3` - Async AWS SDK
  - `greenlet` - Async event loop support
  - `aiofiles` - Async file operations

✅ Migrated `database.py`:
  - Async engine creation
  - Async session management
  - Async AWS Secrets Manager calls

✅ Converted all route files to async:
  - `routes_auth.py`
  - `routes_transactions.py`
  - `routes_clients.py`
  - `routes_suppliers.py`
  - `routes_transaction_extras.py`
  - `routes_quickbooks.py`

✅ Updated `app.py`:
  - Async startup lifecycle
  - Async health check endpoint

## Backward Compatibility

**Important**: The API remains 100% backward compatible. No frontend changes required!
- Same endpoints
- Same request/response formats
- Same authentication

## Testing

Run tests with async support:
```bash
pytest -v
```

## Troubleshooting

### Issue: "RuntimeError: no running event loop"
**Solution**: Ensure you're using `uvicorn` or `gunicorn` with `UvicornWorker`, not plain Flask dev server.

### Issue: Database connection errors
**Solution**: Check that `asyncpg` is installed and your database connection string uses `postgresql+asyncpg://`

### Issue: Slow performance still
**Solution**:
1. Increase worker count: `--workers 8`
2. Check database connection pool settings in `database.py`
3. Monitor AWS RDS performance
4. Enable query logging to identify slow queries

## Performance Monitoring

Add these metrics to track async performance:
- Request latency (should decrease significantly)
- Concurrent connections (should increase)
- Database connection pool usage
- Event loop lag

## Next Steps

Consider these additional optimizations:
1. **Add Redis caching** for frequently accessed data
2. **Implement connection pooling** tuning
3. **Add query optimization** with eager loading
4. **Enable database read replicas** for read-heavy operations
5. **Add APM monitoring** (New Relic, Datadog, etc.)
