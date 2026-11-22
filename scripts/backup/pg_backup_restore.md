# SURYA Database & Storage Backup / Restore Runbook (`Stage 7 / 7.5`)

## 1. Backup (`pg_dump` + Storage)
```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
pg_dump --format=custom --no-owner --no-acl --file="surya-$stamp.dump" $env:DATABASE_URL
```

Archive the Supabase Storage buckets (`documents`, `pms-attachments`, `avatars`) to encrypted cold storage alongside `surya-$stamp.dump` and verify SHA-256 checksums:
```powershell
Get-FileHash "surya-$stamp.dump" -Algorithm SHA256
```

## 2. Restore Drill (Non-Production Target)
```powershell
createdb surya_restore_drill
pg_restore --no-owner --no-acl --dbname="surya_restore_drill" "surya-$stamp.dump"
psql "surya_restore_drill" -c "SELECT count(*) FROM public.projects;"
```
Verify `python scripts/check_security_definer.py` and `npm test` pass after any schema restoration.
