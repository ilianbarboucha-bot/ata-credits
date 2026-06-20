$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $request = @{
    Method  = $Method
    Uri     = $Url
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $request.ContentType = "application/json"
    $request.Body = ($Body | ConvertTo-Json -Depth 8)
  } elseif ($Method -in @("POST", "PUT", "PATCH")) {
    $request.ContentType = "application/json"
    $request.Body = "{}"
  }

  $statusCode = 0
  $raw = ""

  try {
    $response = Invoke-WebRequest @request
    $statusCode = [int]$response.StatusCode
    $raw = $response.Content
  } catch {
    $httpResponse = $_.Exception.Response
    if ($null -eq $httpResponse) {
      throw
    }

    $statusCode = [int]$httpResponse.StatusCode
    $stream = $httpResponse.GetResponseStream()
    if ($null -ne $stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $raw = $reader.ReadToEnd()
      $reader.Dispose()
      $stream.Dispose()
    }

    if (-not $raw -and $_.ErrorDetails -and $_.ErrorDetails.Message) {
      $raw = $_.ErrorDetails.Message
    }
  }

  $json = $null
  if ($raw) {
    $json = $raw | ConvertFrom-Json
  }

  return [pscustomobject]@{
    StatusCode = $statusCode
    Json       = $json
    Raw        = $raw
  }
}

function Wait-ForHealth {
  param(
    [string]$HealthUrl,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    try {
      $health = Invoke-JsonRequest -Method Get -Url $HealthUrl
      if ($health.StatusCode -eq 200 -and $health.Json.ok) {
        return
      }
    } catch {
    }

    Start-Sleep -Milliseconds 500
  }

  $stdout = if (Test-Path $StdoutPath) { Get-Content -Raw $StdoutPath } else { "" }
  $stderr = if (Test-Path $StderrPath) { Get-Content -Raw $StderrPath } else { "" }
  throw "Backend health check did not become ready.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
}

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "apps/backend"
$smokeDbPath = Join-Path $root "output/ata-credits-smoke.sqlite"
$smokeStdoutPath = Join-Path $root "output/ata-credits-smoke-stdout.log"
$smokeStderrPath = Join-Path $root "output/ata-credits-smoke-stderr.log"
$smokePort = 8791
$baseUrl = "http://127.0.0.1:$smokePort"

New-Item -ItemType Directory -Force (Join-Path $root "output") | Out-Null
Remove-Item "$smokeDbPath*" -Force -ErrorAction SilentlyContinue
Remove-Item $smokeStdoutPath, $smokeStderrPath -Force -ErrorAction SilentlyContinue

$previousDatabaseUrl = $env:DATABASE_URL
$previousPort = $env:PORT
$previousCountry = $env:ATA_CREDITS_DEFAULT_COUNTRY
$previousLegacyCountry = $env:SPONSORCREDITS_DEFAULT_COUNTRY
$previousModel = $env:ATA_CREDITS_SPONSORED_GATEWAY_MODEL
$previousLegacyModel = $env:SPONSORED_GATEWAY_MODEL
$backendProcess = $null

try {
  $env:DATABASE_URL = "file:$($smokeDbPath.Replace('\', '/'))"
  $env:PORT = "$smokePort"
  $env:ATA_CREDITS_DEFAULT_COUNTRY = "fr"
  $env:ATA_CREDITS_SPONSORED_GATEWAY_MODEL = "ata-credits-smoke-model"

  npm run build | Out-Null
  npm run db:push | Out-Null

  $nodePath = (Get-Command node).Source
  $backendProcess = Start-Process `
    -FilePath $nodePath `
    -ArgumentList "--disable-warning=ExperimentalWarning", "dist/src/index.js" `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $smokeStdoutPath `
    -RedirectStandardError $smokeStderrPath `
    -PassThru

  Wait-ForHealth "$baseUrl/health" $smokeStdoutPath $smokeStderrPath

  $unauthorizedWallet = Invoke-JsonRequest -Method Get -Url "$baseUrl/wallet"
  Assert-True ($unauthorizedWallet.StatusCode -eq 401) "Wallet should require auth."

  $login = Invoke-JsonRequest -Method Post -Url "$baseUrl/auth/login" -Body @{
    email = "smoke@example.com"
    provider = "google_mock"
  }
  Assert-True ($login.StatusCode -eq 200) "Login failed."
  $token = $login.Json.sessionToken
  $authHeaders = @{
    authorization = "Bearer $token"
  }

  $wallet0 = Invoke-JsonRequest -Method Get -Url "$baseUrl/wallet" -Headers $authHeaders
  Assert-True ($wallet0.StatusCode -eq 200) "Initial wallet fetch failed."
  Assert-True ($wallet0.Json.availableCreditsCents -eq 0) "Expected zero initial available credits."

  $settings0 = Invoke-JsonRequest -Method Get -Url "$baseUrl/settings" -Headers $authHeaders
  Assert-True ($settings0.Json.tokenOptimizationMode -eq "recommended") "Expected default recommended optimization."

  $settings1 = Invoke-JsonRequest -Method Post -Url "$baseUrl/settings" -Headers $authHeaders -Body @{
    tokenOptimizationMode = "conservative"
    country = "fr"
  }
  Assert-True ($settings1.StatusCode -eq 200) "Settings update failed."
  Assert-True ($settings1.Json.tokenOptimizationMode -eq "conservative") "Settings update did not persist."
  Assert-True ($settings1.Json.country -eq "fr") "Country setting did not persist."

  $adsOff = Invoke-JsonRequest -Method Post -Url "$baseUrl/settings" -Headers $authHeaders -Body @{
    adsEnabled = $false
  }
  Assert-True ($adsOff.StatusCode -eq 200) "Disabling ads failed."
  Assert-True ($adsOff.Json.adsEnabled -eq $false) "Ads should be disabled."

  $disabledAd = Invoke-JsonRequest -Method Post -Url "$baseUrl/ads/request" -Headers $authHeaders -Body @{
    route = "official"
    sessionId = "ads-disabled"
  }
  Assert-True ($disabledAd.StatusCode -eq 200) "Disabled ad request failed."
  Assert-True ($disabledAd.Json.adsEnabled -eq $false) "Disabled ad response should report ads disabled."
  Assert-True ($null -eq $disabledAd.Json.ad) "Disabled ad response should not include a sponsor card."

  $adsOn = Invoke-JsonRequest -Method Post -Url "$baseUrl/settings" -Headers $authHeaders -Body @{
    adsEnabled = $true
  }
  Assert-True ($adsOn.StatusCode -eq 200) "Re-enabling ads failed."
  Assert-True ($adsOn.Json.adsEnabled -eq $true) "Ads should be re-enabled."

  $poorLogin = Invoke-JsonRequest -Method Post -Url "$baseUrl/auth/login" -Body @{
    email = "insufficient@example.com"
  }
  $poorToken = $poorLogin.Json.sessionToken
  $poorHeaders = @{
    authorization = "Bearer $poorToken"
  }
  $insufficient = Invoke-JsonRequest -Method Post -Url "$baseUrl/ai/sponsored-request" -Headers $poorHeaders -Body @{
    prompt = "Attempt a sponsored request with no credits."
    sessionId = "poor-user-session"
    mode = "recommended"
  }
  Assert-True ($insufficient.StatusCode -eq 409) "Expected sponsored request refusal for insufficient credits."
  Assert-True ($insufficient.Json.error -eq "INSUFFICIENT_SPONSORED_CREDITS") "Insufficient credit error mismatch."

  function Start-RechargeCycle {
    param(
      [string]$SessionId,
      [bool]$LogOfficial
    )

    $estimate = Invoke-JsonRequest -Method Post -Url "$baseUrl/ai/estimate" -Headers $authHeaders -Body @{
      prompt = "Recharge cycle $SessionId with duplicated log lines.`nDEBUG: temp`nDEBUG: temp"
      mode = "conservative"
    }
    Assert-True ($estimate.StatusCode -eq 200) "Estimate failed for $SessionId."

    $adRequest = Invoke-JsonRequest -Method Post -Url "$baseUrl/ads/request" -Headers $authHeaders -Body @{
      route = $estimate.Json.route
      sessionId = $SessionId
    }
    Assert-True ($adRequest.StatusCode -eq 200) "Ad request failed for $SessionId."
    Assert-True ($adRequest.Json.adsEnabled -eq $true) "Ads should be enabled for $SessionId."
    Assert-True ($null -ne $adRequest.Json.ad) "Ad request should return a sponsor card for $SessionId."

    $impression = Invoke-JsonRequest -Method Post -Url "$baseUrl/ads/impression" -Headers $authHeaders -Body @{
      adId = $adRequest.Json.ad.adId
      campaignId = $adRequest.Json.ad.campaignId
      providerName = $adRequest.Json.ad.providerName
      sessionId = $SessionId
    }
    Assert-True ($impression.StatusCode -eq 200) "Impression tracking failed for $SessionId."
    Assert-True ($impression.Json.status -eq "PENDING") "Expected pending impression for $SessionId."

    $click = Invoke-JsonRequest -Method Post -Url "$baseUrl/ads/click" -Headers $authHeaders -Body @{
      adId = $adRequest.Json.ad.adId
      campaignId = $adRequest.Json.ad.campaignId
      providerName = $adRequest.Json.ad.providerName
      href = $adRequest.Json.ad.href
    }
    Assert-True ($click.StatusCode -eq 200) "Ad click tracking failed for $SessionId."

    if ($LogOfficial) {
      $officialLog = Invoke-JsonRequest -Method Post -Url "$baseUrl/ai/official-log" -Headers $authHeaders -Body @{
        prompt = "Official flow request for $SessionId"
        responseText = "Official mode stayed local for $SessionId"
        model = "local-official-demo"
        estimate = $estimate.Json
      }
      Assert-True ($officialLog.StatusCode -eq 200) "Official log failed for $SessionId."
    }

    return [pscustomobject]@{
      Estimate = $estimate.Json
      Ad = $adRequest.Json.ad
    }
  }

  $cycle1 = Start-RechargeCycle -SessionId "smoke-cycle-1" -LogOfficial $true
  Assert-True ($cycle1.Estimate.route -eq "official") "First cycle should stay in official mode."

  $earlyValidation = Invoke-JsonRequest -Method Post -Url "$baseUrl/credits/validate" -Headers $authHeaders
  Assert-True ($earlyValidation.StatusCode -eq 200) "Early validation failed."
  Assert-True ($earlyValidation.Json.processed -eq 0) "Early validation should not settle fresh impressions."
  Assert-True ($earlyValidation.Json.wallet.pendingCreditsCents -gt 0) "Pending credits should remain after early validation."

  Start-Sleep -Seconds 4
  $lateValidation = Invoke-JsonRequest -Method Post -Url "$baseUrl/credits/validate" -Headers $authHeaders
  Assert-True ($lateValidation.StatusCode -eq 200) "Late validation failed."
  Assert-True ($lateValidation.Json.confirmed -ge 1) "Expected at least one confirmed credit."

  $wallet = Invoke-JsonRequest -Method Get -Url "$baseUrl/wallet" -Headers $authHeaders
  while ($wallet.Json.availableCreditsCents -lt 50) {
    $nextSession = "smoke-cycle-$($wallet.Json.availableCreditsCents)"
    $cycle = Start-RechargeCycle -SessionId $nextSession -LogOfficial $false
    Assert-True ($cycle.Estimate.route -eq "official") "Recharge cycle should remain official before threshold."
    Start-Sleep -Seconds 4
    $validation = Invoke-JsonRequest -Method Post -Url "$baseUrl/credits/validate" -Headers $authHeaders
    Assert-True ($validation.StatusCode -eq 200) "Recharge validation failed."
    $wallet = Invoke-JsonRequest -Method Get -Url "$baseUrl/wallet" -Headers $authHeaders
  }

  $sponsoredEstimate = Invoke-JsonRequest -Method Post -Url "$baseUrl/ai/estimate" -Headers $authHeaders -Body @{
    prompt = "Use sponsored routing now that the balance covers the request."
    mode = "conservative"
  }
  Assert-True ($sponsoredEstimate.StatusCode -eq 200) "Sponsored estimate failed."
  Assert-True ($sponsoredEstimate.Json.route -eq "sponsored") "Expected sponsored route after balance threshold."

  $sponsoredRequest = Invoke-JsonRequest -Method Post -Url "$baseUrl/ai/sponsored-request" -Headers $authHeaders -Body @{
    prompt = "Use sponsored routing now that the balance covers the request."
    sessionId = "smoke-sponsored"
    mode = "conservative"
  }
  Assert-True ($sponsoredRequest.StatusCode -eq 200) "Sponsored request failed."
  Assert-True ($sponsoredRequest.Json.route -eq "sponsored") "Sponsored request returned wrong route."

  $requestHistory = Invoke-JsonRequest -Method Get -Url "$baseUrl/history/requests" -Headers $authHeaders
  $adHistory = Invoke-JsonRequest -Method Get -Url "$baseUrl/history/ads" -Headers $authHeaders

  Assert-True (($requestHistory.Json.items | Measure-Object).Count -ge 2) "Expected request history entries."
  Assert-True ($requestHistory.Json.items[0].promptPreview -eq "Prompt hidden by privacy default.") "Prompt preview should stay privacy-safe."
  Assert-True (($requestHistory.Json.items | Where-Object route -eq "official" | Measure-Object).Count -ge 1) "Expected at least one official history entry."
  Assert-True (($requestHistory.Json.items | Where-Object route -eq "sponsored" | Measure-Object).Count -ge 1) "Expected at least one sponsored history entry."
  Assert-True (($adHistory.Json.items | Where-Object status -eq "CONFIRMED" | Measure-Object).Count -ge 1) "Expected confirmed ad history entries."

  [pscustomobject]@{
    ok = $true
    smokePort = $smokePort
    availableCreditsUsd = $sponsoredRequest.Json.wallet.availableCreditsUsd
    pendingCreditsUsd = $sponsoredRequest.Json.wallet.pendingCreditsUsd
    finalRoute = $sponsoredRequest.Json.route
    requestHistoryCount = ($requestHistory.Json.items | Measure-Object).Count
    adHistoryCount = ($adHistory.Json.items | Measure-Object).Count
    verified = @(
      "auth",
      "wallet",
      "settings",
      "ad request",
      "ad impression",
      "ad click",
      "delayed validation",
      "official estimate",
      "official log",
      "insufficient sponsored refusal",
      "sponsored estimate",
      "sponsored request",
      "history privacy"
    )
  } | ConvertTo-Json -Depth 6
}
finally {
  if ($null -ne $backendProcess) {
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
  }

  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $previousDatabaseUrl
  }

  if ($null -eq $previousPort) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  } else {
    $env:PORT = $previousPort
  }

  if ($null -eq $previousCountry) {
    Remove-Item Env:ATA_CREDITS_DEFAULT_COUNTRY -ErrorAction SilentlyContinue
  } else {
    $env:ATA_CREDITS_DEFAULT_COUNTRY = $previousCountry
  }

  if ($null -eq $previousLegacyCountry) {
    Remove-Item Env:SPONSORCREDITS_DEFAULT_COUNTRY -ErrorAction SilentlyContinue
  } else {
    $env:SPONSORCREDITS_DEFAULT_COUNTRY = $previousLegacyCountry
  }

  if ($null -eq $previousModel) {
    Remove-Item Env:ATA_CREDITS_SPONSORED_GATEWAY_MODEL -ErrorAction SilentlyContinue
  } else {
    $env:ATA_CREDITS_SPONSORED_GATEWAY_MODEL = $previousModel
  }

  if ($null -eq $previousLegacyModel) {
    Remove-Item Env:SPONSORED_GATEWAY_MODEL -ErrorAction SilentlyContinue
  } else {
    $env:SPONSORED_GATEWAY_MODEL = $previousLegacyModel
  }
}
