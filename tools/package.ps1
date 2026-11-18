# Builds the ZIP for the Chrome Web Store from the extension folder and writes it to
# dist\sit-stand-timer-<version>.zip (the version comes from manifest.json).
#
#   powershell -ExecutionPolicy Bypass -File tools\package.ps1

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$source = (Resolve-Path (Join-Path $PSScriptRoot '..\extension')).Path
$manifest = Get-Content (Join-Path $source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json

$dist = Join-Path $PSScriptRoot '..\dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zipPath = Join-Path (Resolve-Path $dist).Path ("sit-stand-timer-{0}.zip" -f $manifest.version)
if (Test-Path $zipPath) { Remove-Item $zipPath -Confirm:$false }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in Get-ChildItem $source -Recurse -File) {
        # Entry names must use forward slashes, otherwise the store does not find the
        # files in subfolders (_locales, icons).
        $entryName = $file.FullName.Substring($source.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $zip.Dispose()
}

$size = [Math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Output "wrote $zipPath ($size KB, version $($manifest.version))"
