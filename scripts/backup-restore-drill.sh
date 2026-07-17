#!/usr/bin/env bash
set -Eeuo pipefail

# Logical backup/restore drill. The source is only read; restoration happens in
# a short-lived PostgreSQL container that is never published on a host port.

readonly POSTGRES_IMAGE="${DRILL_POSTGRES_IMAGE:-postgres:16-alpine}"
readonly SOURCE_DATABASE_URL="${RESTORE_SOURCE_DATABASE_URL:-}"
readonly TARGET_DATABASE="restore_drill"
readonly TARGET_USER="restore_drill"

if [[ -z "$SOURCE_DATABASE_URL" ]]; then
  echo "RESTORE_SOURCE_DATABASE_URL is required." >&2
  exit 2
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 2
}
docker info >/dev/null 2>&1 || {
  echo "Docker daemon is not available." >&2
  exit 2
}

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/eduvault-restore-drill.XXXXXX")"
container_name="eduvault-restore-drill-${GITHUB_RUN_ID:-local}-$$"
target_password="$(openssl rand -hex 24 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -d '\n=/+')"
started_at="$(date +%s)"

network_args=()
if [[ -n "${DRILL_DOCKER_NETWORK:-}" ]]; then
  network_args=(--network "$DRILL_DOCKER_NETWORK")
fi

cleanup() {
  local exit_code=$?
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -rf -- "$temp_dir"
  unset PGURI POSTGRES_PASSWORD
  return "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

manifest_sql=$(cat <<'SQL'
SET TIME ZONE 'UTC';

CREATE FUNCTION pg_temp.table_manifest(schema_name text, table_name text)
RETURNS TABLE(row_count bigint, content_checksum text)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT count(*)::bigint,
            COALESCE(sum(((''x'' || substr(row_hash, 1, 16))::bit(64)::bigint)::numeric), 0)::text
            || '':'' ||
            COALESCE(sum(((''x'' || substr(row_hash, 17, 16))::bit(64)::bigint)::numeric), 0)::text
       FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM %I.%I AS t) AS row_hashes',
    schema_name,
    table_name
  );
END;
$$;

CREATE FUNCTION pg_temp.sequence_manifest(schema_name text, sequence_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  sequence_state text;
BEGIN
  EXECUTE format(
    'SELECT last_value::text || '':'' || is_called::text FROM %I.%I',
    schema_name,
    sequence_name
  ) INTO sequence_state;
  RETURN sequence_state;
END;
$$;

SELECT object_name, row_count, content_checksum
FROM (
  SELECT 'table:' || quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS object_name,
         manifest.row_count,
         manifest.content_checksum
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_temp.table_manifest(n.nspname, c.relname) AS manifest
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'

  UNION ALL

  SELECT 'sequence:' || quote_ident(n.nspname) || '.' || quote_ident(c.relname),
         1::bigint,
         pg_temp.sequence_manifest(n.nspname, c.relname)
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'S'
) AS objects
ORDER BY object_name;
SQL
)

write_source_manifest() {
  local destination="$1"
  # PGURI keeps credentials out of the command shown by docker inspect.
  PGURI="$SOURCE_DATABASE_URL" docker run --rm \
    "${network_args[@]}" \
    -e PGURI \
    -e MANIFEST_SQL \
    "$POSTGRES_IMAGE" \
    sh -eu -c 'exec psql "$PGURI" --no-psqlrc -X -v ON_ERROR_STOP=1 -At -F "|" -c "$MANIFEST_SQL"' \
    >"$destination"
}

write_target_manifest() {
  local destination="$1"
  docker exec \
    -e PGPASSWORD="$target_password" \
    -e MANIFEST_SQL="$manifest_sql" \
    "$container_name" \
    sh -eu -c 'exec psql -U restore_drill -d restore_drill --no-psqlrc -X -v ON_ERROR_STOP=1 -At -F "|" -c "$MANIFEST_SQL"' \
    >"$destination"
}

# Export the SQL separately as an environment variable so neither database URL
# nor SQL quoting is interpolated by a shell inside the image.
export MANIFEST_SQL="$manifest_sql"

echo "[1/6] Reading source manifest..."
write_source_manifest "$temp_dir/source-before.manifest"

echo "[2/6] Creating encrypted-in-transit logical backup (connection policy comes from the URL)..."
PGURI="$SOURCE_DATABASE_URL" docker run --rm \
  "${network_args[@]}" \
  -e PGURI \
  --mount "type=bind,source=$temp_dir,target=/backup" \
  "$POSTGRES_IMAGE" \
  sh -eu -c 'exec pg_dump "$PGURI" --format=custom --compress=6 --no-owner --no-privileges --file=/backup/source.dump'

echo "[3/6] Confirming that compared source data did not change during backup..."
write_source_manifest "$temp_dir/source-after.manifest"
if ! cmp -s "$temp_dir/source-before.manifest" "$temp_dir/source-after.manifest"; then
  echo "Source data changed while pg_dump was running; retry in a quiet/read-only window." >&2
  exit 3
fi

echo "[4/6] Starting isolated restore target..."
POSTGRES_PASSWORD="$target_password" docker run -d \
  --name "$container_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --tmpfs /var/run/postgresql:rw,nosuid,size=16m \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,size="${DRILL_TARGET_TMPFS_SIZE:-1g}" \
  -e POSTGRES_DB="$TARGET_DATABASE" \
  -e POSTGRES_USER="$TARGET_USER" \
  -e POSTGRES_PASSWORD \
  --mount "type=bind,source=$temp_dir,target=/backup,readonly" \
  "$POSTGRES_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready -U "$TARGET_USER" -d "$TARGET_DATABASE" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container_name" pg_isready -U "$TARGET_USER" -d "$TARGET_DATABASE" >/dev/null

echo "[5/6] Restoring backup with fail-fast semantics..."
docker exec \
  -e PGPASSWORD="$target_password" \
  "$container_name" \
  pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
    -U "$TARGET_USER" -d "$TARGET_DATABASE" /backup/source.dump

echo "[6/6] Comparing table counts and content checksums..."
write_target_manifest "$temp_dir/target.manifest"
if ! cmp -s "$temp_dir/source-before.manifest" "$temp_dir/target.manifest"; then
  echo "Restore manifest differs from the source manifest:" >&2
  diff -u "$temp_dir/source-before.manifest" "$temp_dir/target.manifest" >&2 || true
  exit 4
fi

backup_bytes="$(wc -c <"$temp_dir/source.dump" | tr -d ' ')"
backup_sha256="$(sha256sum "$temp_dir/source.dump" | awk '{print $1}')"
object_count="$(wc -l <"$temp_dir/target.manifest" | tr -d ' ')"
elapsed="$(( $(date +%s) - started_at ))"

echo "Restore drill passed: ${object_count} tables/sequences, ${backup_bytes} backup bytes, sha256=${backup_sha256}, elapsed=${elapsed}s."
echo "The ephemeral database and backup will now be removed."
