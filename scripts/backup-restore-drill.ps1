[CmdletBinding()]
param(
    [string]$SourceDatabaseUrl = $env:RESTORE_SOURCE_DATABASE_URL,
    [string]$PostgresImage = $(if ($env:DRILL_POSTGRES_IMAGE) { $env:DRILL_POSTGRES_IMAGE } else { 'postgres:16-alpine' }),
    [string]$DockerNetwork = $env:DRILL_DOCKER_NETWORK
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($SourceDatabaseUrl)) {
    throw 'RESTORE_SOURCE_DATABASE_URL (or -SourceDatabaseUrl) is required.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required.'
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker daemon is not available.'
}

$targetDatabase = 'restore_drill'
$targetUser = 'restore_drill'
$randomBytes = [byte[]]::new(32)
$randomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$randomNumberGenerator.GetBytes($randomBytes)
$randomNumberGenerator.Dispose()
$targetPassword = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
$tempDirectory = Join-Path ([IO.Path]::GetTempPath()) ("eduvault-restore-drill-{0}" -f [guid]::NewGuid().ToString('N'))
$containerName = "eduvault-restore-drill-{0}" -f [guid]::NewGuid().ToString('N').Substring(0, 12)
$startedAt = [DateTimeOffset]::UtcNow
$utf8NoBom = [Text.UTF8Encoding]::new($false)

$manifestSql = @'
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
'@

$savedPgUri = $env:PGURI
$savedManifestSql = $env:MANIFEST_SQL
$savedPostgresPassword = $env:POSTGRES_PASSWORD

function Invoke-DockerChecked {
    param([Parameter(Mandatory)][string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE."
    }
}

function Get-NetworkArguments {
    if ([string]::IsNullOrWhiteSpace($DockerNetwork)) { return @() }
    return @('--network', $DockerNetwork)
}

function Write-SourceManifest {
    param([Parameter(Mandatory)][string]$Destination)
    $arguments = @('run', '--rm') + (Get-NetworkArguments) + @(
        '-e', 'PGURI',
        '-e', 'MANIFEST_SQL',
        $PostgresImage,
        'sh', '-eu', '-c', 'exec psql "$PGURI" --no-psqlrc -X -v ON_ERROR_STOP=1 -At -F "|" -c "$MANIFEST_SQL"'
    )
    $output = @(& docker @arguments)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the source manifest.' }
    [IO.File]::WriteAllLines($Destination, [string[]]$output, $utf8NoBom)
}

function Write-TargetManifest {
    param([Parameter(Mandatory)][string]$Destination)
    $arguments = @(
        'exec',
        '-e', "PGPASSWORD=$targetPassword",
        '-e', 'MANIFEST_SQL',
        $containerName,
        'sh', '-eu', '-c', 'exec psql -U restore_drill -d restore_drill --no-psqlrc -X -v ON_ERROR_STOP=1 -At -F "|" -c "$MANIFEST_SQL"'
    )
    $output = @(& docker @arguments)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the restored manifest.' }
    [IO.File]::WriteAllLines($Destination, [string[]]$output, $utf8NoBom)
}

try {
    New-Item -ItemType Directory -Path $tempDirectory | Out-Null
    $env:PGURI = $SourceDatabaseUrl
    $env:MANIFEST_SQL = $manifestSql
    $env:POSTGRES_PASSWORD = $targetPassword

    Write-Host '[1/6] Reading source manifest...'
    $sourceBefore = Join-Path $tempDirectory 'source-before.manifest'
    Write-SourceManifest $sourceBefore

    Write-Host '[2/6] Creating logical backup...'
    $dumpArguments = @('run', '--rm') + (Get-NetworkArguments) + @(
        '-e', 'PGURI',
        '--mount', "type=bind,source=$tempDirectory,target=/backup",
        $PostgresImage,
        'sh', '-eu', '-c', 'exec pg_dump "$PGURI" --format=custom --compress=6 --no-owner --no-privileges --file=/backup/source.dump'
    )
    Invoke-DockerChecked $dumpArguments

    Write-Host '[3/6] Confirming that compared source data did not change during backup...'
    $sourceAfter = Join-Path $tempDirectory 'source-after.manifest'
    Write-SourceManifest $sourceAfter
    if ((Get-FileHash $sourceBefore -Algorithm SHA256).Hash -ne (Get-FileHash $sourceAfter -Algorithm SHA256).Hash) {
        throw 'Source data changed while pg_dump was running; retry in a quiet/read-only window.'
    }

    Write-Host '[4/6] Starting isolated restore target...'
    $startArguments = @(
        'run', '-d',
        '--name', $containerName,
        '--read-only',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
        '--tmpfs', '/var/run/postgresql:rw,nosuid,size=16m',
        '--tmpfs', "/var/lib/postgresql/data:rw,nosuid,size=$(if ($env:DRILL_TARGET_TMPFS_SIZE) { $env:DRILL_TARGET_TMPFS_SIZE } else { '1g' })",
        '-e', "POSTGRES_DB=$targetDatabase",
        '-e', "POSTGRES_USER=$targetUser",
        '-e', 'POSTGRES_PASSWORD',
        '--mount', "type=bind,source=$tempDirectory,target=/backup,readonly",
        $PostgresImage
    )
    $containerId = & docker @startArguments
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the isolated restore target.' }

    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        & docker exec $containerName pg_isready -U $targetUser -d $targetDatabase *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Restore target did not become ready within 60 seconds.' }

    Write-Host '[5/6] Restoring backup with fail-fast semantics...'
    Invoke-DockerChecked @(
        'exec', '-e', "PGPASSWORD=$targetPassword", $containerName,
        'pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges',
        '-U', $targetUser, '-d', $targetDatabase, '/backup/source.dump'
    )

    Write-Host '[6/6] Comparing table counts and content checksums...'
    $targetManifest = Join-Path $tempDirectory 'target.manifest'
    Write-TargetManifest $targetManifest
    if ((Get-FileHash $sourceBefore -Algorithm SHA256).Hash -ne (Get-FileHash $targetManifest -Algorithm SHA256).Hash) {
        $difference = Compare-Object (Get-Content $sourceBefore) (Get-Content $targetManifest)
        $difference | Format-Table -AutoSize | Out-String | Write-Error
        throw 'Restore manifest differs from the source manifest.'
    }

    $dump = Get-Item (Join-Path $tempDirectory 'source.dump')
    $dumpHash = (Get-FileHash $dump.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $objectCount = @(Get-Content $targetManifest).Count
    $elapsed = [math]::Round(([DateTimeOffset]::UtcNow - $startedAt).TotalSeconds, 1)
    Write-Host "Restore drill passed: $objectCount tables/sequences, $($dump.Length) backup bytes, sha256=$dumpHash, elapsed=${elapsed}s."
    Write-Host 'The ephemeral database and backup will now be removed.'
}
finally {
    & docker rm -f $containerName *> $null
    if (Test-Path -LiteralPath $tempDirectory) {
        Remove-Item -LiteralPath $tempDirectory -Recurse -Force
    }
    $env:PGURI = $savedPgUri
    $env:MANIFEST_SQL = $savedManifestSql
    $env:POSTGRES_PASSWORD = $savedPostgresPassword
}
