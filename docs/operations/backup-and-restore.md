# Backup And Restore

## Backup

1. Create a consistent MongoDB dump for the `ghetto_sqs` database.
2. Store backups in immutable object storage with lifecycle retention rules.
3. Encrypt backups at rest and in transit.
4. Record backup metadata:
   - backup timestamp
   - MongoDB cluster/source
   - git commit hash for application version

Example:

```bash
mongodump --uri "$DATABASE_URL" --db ghetto_sqs --archive=backup-$(date +%Y%m%d%H%M%S).archive --gzip
```

## Restore

1. Restore to an isolated environment first.
2. Validate queue message and audit event record counts.
3. Run smoke tests against restored data.
4. Promote restored environment only after validation.

Example:

```bash
mongorestore --uri "$DATABASE_URL" --archive=backup-20260226120000.archive --gzip --drop
```

## Recovery Drills

1. Run restore drills at least monthly.
2. Track RTO and RPO for each drill.
3. Capture follow-up actions for any missed targets.
