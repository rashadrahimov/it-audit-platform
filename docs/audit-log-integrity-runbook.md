# Audit log integrity incident runbook

Purpose: keep LOG-01 tamper-evidence meaningful when `/audit-log` reports `needsReview`
with `reason=content-hash` or `reason=chain-link`.

## What the signal means

The platform recalculates every tenant audit-log hash from the stored payload and the previous
hash. A failure means at least one of these happened after the original event was written:

- the event payload changed (`content-hash`);
- the chain pointer changed or an event was inserted/removed between hashed rows (`chain-link`);
- an incompatible manual data migration touched hashed audit-log columns.

Do **not** “fix” this by silently recomputing hashes in place. That destroys the evidence that
the immutable log is designed to surface.

## Immediate triage

1. Restrict direct database access for the affected environment until the incident owner is named.
2. Capture the UI state from `/audit-log`: checked event count, `brokenAt`, `reason`, time, tenant.
3. Export the recent operational log:

   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Tenant-Slug: $TENANT" \
     "$APP_URL/audit/syslog?limit=1000" > audit-syslog.txt
   ```

4. From an owner/forensic connection, export the broken row and nearby rows without editing them:

   ```sql
   select id, at, action, entity_type, entity_id, actor_user_id, prev_hash, hash
   from audit_log
   where tenant_id = :tenant_id
   order by id;
   ```

5. Compare the affected row against backups or WAL/PITR snapshots if available.

## Resolution options

Choose one explicitly and record the decision in the incident ticket:

1. **Restore from trusted backup/PITR** if the audit log must remain a single unbroken chain.
2. **Preserve the broken chain and open a new trust epoch** after approval. The old rows remain
   evidence; new events prove integrity from the approved restart point.
3. **For demo/non-production only:** reseed the demo tenant if the break came from a known tamper
   test or manual walkthrough.

## Acceptance criteria

- Incident owner and decision recorded.
- Broken row evidence preserved.
- The UI either returns to `valid` after restore/reseed, or the incident ticket documents the
  accepted trust-epoch boundary.
- Release notes mention whether the environment is production, demo, or test.

