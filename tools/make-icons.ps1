# Draws the extension icon (a height-adjustable desk with an up/down arrow) in all
# sizes Chrome needs and writes them to extension\icons.
#
#   powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\extension\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

$tileTop = [System.Drawing.ColorTranslator]::FromHtml('#2B2F77')
$tileBottom = [System.Drawing.ColorTranslator]::FromHtml('#14163A')
$deskColor = [System.Drawing.Color]::White
$arrowColor = [System.Drawing.ColorTranslator]::FromHtml('#5EEAD4')

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return , $path
}

# $size: edge length in px. $pad: transparent margin (the store wants 16 px on the 128 px icon).
# $bold: thicker strokes so the small sizes stay readable.
# All coordinates below are fractions (0..1) of the artwork inside the margin.
function New-Icon([int]$size, [float]$pad, [bool]$bold) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $a = $size - 2 * $pad

    function U([float]$v) { return $pad + $v * $a }

    # Boxes snap to whole pixels, which keeps the desk crisp at 16 and 32 px.
    function Edge([float]$v) { return [Math]::Round($pad + $v * $a) }
    function Fill-Box($brush, [float]$x0, [float]$y0, [float]$x1, [float]$y1, [float]$radius) {
        $left = Edge $x0
        $top = Edge $y0
        $width = (Edge $x1) - $left
        $height = (Edge $y1) - $top
        if ($radius * $a -lt 1) {
            $g.FillRectangle($brush, [float]$left, [float]$top, [float]$width, [float]$height)
        } else {
            $g.FillPath($brush, (New-RoundedRect $left $top $width $height ($radius * $a)))
        }
    }

    # Tile
    $rect = New-Object System.Drawing.RectangleF $pad, $pad, $a, $a
    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $tileTop, $tileBottom, 90.0
    $g.FillPath($gradient, (New-RoundedRect $pad $pad $a $a ($a * 0.23)))

    $desk = New-Object System.Drawing.SolidBrush $deskColor
    $arrow = New-Object System.Drawing.SolidBrush $arrowColor

    if ($bold) { $thick = 0.14; $leg = 0.11; $foot = 0.10 } else { $thick = 0.11; $leg = 0.08; $foot = 0.075 }
    $topY = 0.24
    $topBottom = $topY + $thick
    $floor = 0.80
    $footY = $floor - $foot

    # Table top, legs and feet
    Fill-Box $desk 0.13 $topY 0.87 $topBottom 0.035
    foreach ($cx in 0.27, 0.73) {
        Fill-Box $desk ($cx - $leg / 2) ($topBottom - 0.01) ($cx + $leg / 2) ($footY + 0.01) 0
        Fill-Box $desk ($cx - 0.115) $footY ($cx + 0.115) $floor 0.03
    }

    # Up/down arrow between the legs
    $y0 = $topBottom + 0.06
    $y1 = $floor
    if ($bold) { $head = 0.125; $half = 0.125; $stem = 0.085 } else { $head = 0.11; $half = 0.105; $stem = 0.06 }
    $up = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF (U 0.5), (U $y0)),
        (New-Object System.Drawing.PointF (U (0.5 - $half)), (U ($y0 + $head))),
        (New-Object System.Drawing.PointF (U (0.5 + $half)), (U ($y0 + $head)))
    )
    $down = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF (U 0.5), (U $y1)),
        (New-Object System.Drawing.PointF (U (0.5 - $half)), (U ($y1 - $head))),
        (New-Object System.Drawing.PointF (U (0.5 + $half)), (U ($y1 - $head)))
    )
    $g.FillPolygon($arrow, $up)
    $g.FillPolygon($arrow, $down)
    $g.FillRectangle($arrow, (U (0.5 - $stem / 2)), (U ($y0 + $head - 0.01)), ($a * $stem), ($a * ($y1 - $y0 - 2 * $head + 0.02)))

    $g.Dispose()
    return , $bitmap
}

$variants = @(
    @{ Size = 16; Pad = 0; Bold = $true },
    @{ Size = 32; Pad = 1; Bold = $true },
    @{ Size = 48; Pad = 2; Bold = $false },
    @{ Size = 128; Pad = 16; Bold = $false }
)

foreach ($v in $variants) {
    $icon = New-Icon $v.Size $v.Pad $v.Bold
    $file = Join-Path $outDir ("icon{0}.png" -f $v.Size)
    $icon.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon.Dispose()
    Write-Output "wrote $file"
}
