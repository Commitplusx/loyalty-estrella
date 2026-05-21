# fix_encoding.ps1 - Corrige simbolos garbled (double-encoded UTF-8) en archivos del bot
$path = 'C:\Users\asus_\Desktop\loyalty-estrella\supabase\functions\whatsapp-bot'
$files = Get-ChildItem "$path\*.ts"

$fixes = [ordered]@{
  # Vocales con acento (minusculas)
  'Ã©' = 'e' + [char]0x301  # no, usar directo
}

# Usar tabla directa con caracteres correctos
$table = New-Object 'System.Collections.Generic.Dictionary[string,string]'
$table['Ã©']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0xA9))   # é
$table['Ã³']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0xB3))   # ó
$table['Ã¡']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0xA1))   # á
$table['Ã­']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0xAD))   # í
$table['Ãº']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0xBA))   # ú
$table['Ã±']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0xB1))   # ñ
$table['Ã"']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0x93))   # Ó
$table['Ã‰']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0x89))   # É
$table['Ãš']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0x9A))   # Ú
$table['Ã']   = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC3,0x81))   # Á (in context like GEOGRÁFICA)
$table['Â¿']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC2,0xBF))   # ¿
$table['Â¡']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xC2,0xA1))   # ¡
$table['Â ']  = ' '

# Puntuacion
$table['â€"']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xE2,0x80,0x94))  # —
$table['â€¢']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xE2,0x80,0xA2))  # •
$table['â€™']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xE2,0x80,0x99))  # '
$table['â€œ']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xE2,0x80,0x9C))  # "
$table['â†'']  = [System.Text.Encoding]::UTF8.GetString([byte[]](0xE2,0x86,0x92))  # →

foreach ($file in $files) {
  $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
  $original = $content
  foreach ($key in $table.Keys) {
    $content = $content.Replace($key, $table[$key])
  }
  if ($content -ne $original) {
    [System.IO.File]::WriteAllText($file.FullName, $content, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Fixed: $($file.Name)"
  } else {
    Write-Host "Clean:  $($file.Name)"
  }
}
Write-Host "Done."
