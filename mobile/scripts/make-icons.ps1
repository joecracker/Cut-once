# Regenerates the Android launcher icons from the master artwork.
#
#   master : mobile/resources/app-icon-source.jpg
#   output : mobile/android/app/src/main/res/mipmap-*/   (GENERATED - never hand-edit)
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File mobile/scripts/make-icons.ps1
#
# Two shapes are emitted per density:
#   ic_launcher(_round).png     - legacy icon for API < 26, art inset a little
#   ic_launcher_foreground.png  - adaptive-icon foreground (API 26+), art shrunk
#                                 into the 108dp canvas' safe zone so no mask clips it
# The adaptive background colour lives in res/drawable/ic_launcher_background.xml.

param(
    [string]$Source = (Join-Path $PSScriptRoot '..\resources\app-icon-source.jpg'),
    [string]$ResDir = (Join-Path $PSScriptRoot '..\android\app\src\main\res')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing | Out-Null

# Art size as a fraction of the canvas. Adaptive math: the blade is ~98% of the
# source, and only the middle 66dp of the 108dp canvas is guaranteed visible.
$legacyArtRatio = 0.88
$adaptiveArtRatio = 0.64

# density -> @(legacy px, adaptive px)
$densities = [ordered]@{
    'mdpi'    = @(48, 108)
    'hdpi'    = @(72, 162)
    'xhdpi'   = @(96, 216)
    'xxhdpi'  = @(144, 324)
    'xxxhdpi' = @(192, 432)
}

$src = [System.Drawing.Bitmap]::new((Resolve-Path $Source).Path)

# Centred square crop of the master, so a non-square source is never squashed.
$cropSide = [Math]::Min($src.Width, $src.Height)
$cropX = [int](($src.Width - $cropSide) / 2)
$cropY = [int](($src.Height - $cropSide) / 2)

# Background = mean of the four corners, so the padding blends into the art.
function Get-CornerMean([System.Drawing.Bitmap]$b) {
    $pts = @(
        @(1, 1),
        @(($b.Width - 2), 1),
        @(1, ($b.Height - 2)),
        @(($b.Width - 2), ($b.Height - 2))
    )
    $r = 0; $g = 0; $bl = 0
    foreach ($p in $pts) {
        $c = $b.GetPixel($p[0], $p[1])
        $r += $c.R; $g += $c.G; $bl += $c.B
    }
    [System.Drawing.Color]::FromArgb(255, [int]($r / 4), [int]($g / 4), [int]($bl / 4))
}

$bg = Get-CornerMean $src

function Write-Icon([int]$size, [double]$ratio, [string]$outPath) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $attrs = [System.Drawing.Imaging.ImageAttributes]::new()
    try {
        $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $gfx.Clear($bg)

        # TileFlipXY stops the edges bleeding a dark fringe when downscaling.
        $attrs.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)

        $art = [int][Math]::Round($size * $ratio)
        $off = [int](($size - $art) / 2)
        $dest = [System.Drawing.Rectangle]::new($off, $off, $art, $art)
        $gfx.DrawImage($src, $dest, $cropX, $cropY, $cropSide, $cropSide,
            [System.Drawing.GraphicsUnit]::Pixel, $attrs)
    }
    finally {
        $gfx.Dispose()
        $attrs.Dispose()
    }
    $dir = Split-Path $outPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    "  {0,-46} {1,4}px  {2,6} bytes" -f ($outPath.Replace($ResDir, 'res')), $size, (Get-Item $outPath).Length
}

"source: $((Resolve-Path $Source).Path)  ($($src.Width)x$($src.Height))"
"crop:   ${cropSide}x${cropSide} at ($cropX,$cropY)"
"background: #{0:x2}{1:x2}{2:x2}" -f $bg.R, $bg.G, $bg.B

foreach ($name in $densities.Keys) {
    $legacy = $densities[$name][0]
    $adaptive = $densities[$name][1]
    $dir = Join-Path $ResDir "mipmap-$name"
    Write-Icon $legacy $legacyArtRatio (Join-Path $dir 'ic_launcher.png')
    Write-Icon $legacy $legacyArtRatio (Join-Path $dir 'ic_launcher_round.png')
    Write-Icon $adaptive $adaptiveArtRatio (Join-Path $dir 'ic_launcher_foreground.png')
}

$src.Dispose()
"done."
