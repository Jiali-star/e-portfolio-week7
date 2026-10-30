# Tiny persistent static web server (pure PowerShell, no Python needed)
# Usage: .\_serve.ps1  (run from the portfolio folder)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:5501/"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix  — press Ctrl+C to stop"

$mime = @{
  ".html"="text/html; charset=utf-8"
  ".htm" ="text/html; charset=utf-8"
  ".css" ="text/css; charset=utf-8"
  ".js"  ="application/javascript; charset=utf-8"
  ".svg" ="image/svg+xml"
  ".png" ="image/png"
  ".jpg" ="image/jpeg"
  ".jpeg"="image/jpeg"
  ".gif" ="image/gif"
  ".ico" ="image/x-icon"
  ".pdf" ="application/pdf"
  ".json"="application/json; charset=utf-8"
  ".md"  ="text/markdown; charset=utf-8"
}

function url-decode([string]$s) { return [System.Uri]::UnescapeDataString($s) }

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response

    # Parse path, strip query, default to index.html
    $rawPath = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rawPath)) { $rawPath = "index.html" }
    # Guard against .. path traversal
    if ($rawPath -match '\.\.[\\/]') {
      $resp.StatusCode = 403; $resp.Close(); continue
    }

    $file = Join-Path $root $rawPath

    if (Test-Path $file -PathType Container) {
      $file = Join-Path $file "index.html"
    }

    if (-not (Test-Path $file -PathType Leaf)) {
      $resp.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawPath")
      $resp.ContentType = "text/plain; charset=utf-8"
      $resp.ContentLength64 = $bytes.Length
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
      $resp.Close(); continue
    }

    $ext = [IO.Path]::GetExtension($file).ToLower()
    $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
    $bytes = [IO.File]::ReadAllBytes($file)
    $resp.ContentType = $contentType
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.Close()
    Write-Host "$($req.HttpMethod) $rawPath  OK"
  } catch {
    Write-Host "ERR: $_" -ForegroundColor Red
  }
}
