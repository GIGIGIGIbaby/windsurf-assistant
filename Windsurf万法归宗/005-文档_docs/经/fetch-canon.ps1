# fetch-canon.ps1 - Dao Canon Fetcher v3
# Pure ASCII strings. No encoding issues. Robust rate-limited WikiSource downloader.
# Usage: .\fetch-canon.ps1 [-Id <id>] [-Status] [-Index] [-Force]

param([string]$Id="",[switch]$Status,[switch]$Index,[switch]$Force)
$ErrorActionPreference="Stop"
$ProgressPreference="SilentlyContinue"
$DIR=Split-Path -Parent $MyInvocation.MyCommand.Path

# === HTTP LAYER ===
function wiki-get([string]$title,[string]$lang="zh"){
  Start-Sleep -Milliseconds 2000
  $url="https://$lang.wikisource.org/w/api.php?action=query&titles=$([uri]::EscapeDataString($title))&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2"
  try{
    $j=(Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 25 `
      -Headers @{"User-Agent"="DaoCanon/3.0 (scholarly-research)"}).Content|ConvertFrom-Json
    $p=$j.query.pages[0]
    if($p.PSObject.Properties["missing"]){return $null}
    $c=$p.revisions[0].slots.main.content
    return if($c.Length -gt 150){$c}else{$null}
  }catch{return $null}
}

function gut-get([string]$id){
  Start-Sleep -Milliseconds 1000
  $url="https://www.gutenberg.org/cache/epub/$id/pg$id.txt"
  try{
    $raw=(Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 30 `
      -Headers @{"User-Agent"="DaoCanon/3.0"}).Content
    if($raw -match "\*\*\* START OF"){$raw=$raw.Substring($raw.IndexOf("`n",$raw.IndexOf("*** START OF"))+1)}
    if($raw -match "\*\*\* END OF"){$raw=$raw.Substring(0,$raw.IndexOf("*** END OF"))}
    return $raw.Trim()
  }catch{return $null}
}

function clean([string]$t){
  $t=$t -replace "\{\{[^}]*\}\}","" -replace "\[\[(?:[^\]|]*\|)?([^\]]*)\]\]","`$1"
  $t=$t -replace "'{2,3}","" -replace "(?s)<ref[^>]*>.*?</ref>","" -replace "<[^>]+>",""
  ($t -replace "\n{3,}","`n`n").Trim()
}

function save-text([string]$path,[string]$name,[string]$body){
  $full=$name+"`n"+"="*50+"`n`n"+$body
  [System.IO.File]::WriteAllBytes($path,[System.Text.Encoding]::UTF8.GetBytes($full))
  $kb=[math]::Round((Get-Item $path).Length/1024,1)
  Write-Host "  SAVED: $(Split-Path $path -Leaf) (${kb}KB)" -ForegroundColor Green
  return $true
}

# === CANON REGISTRY ===
# Each entry: id, name, file, sources (ordered by preference), note
$CANON=@(
  # --- ALREADY ACQUIRED (skip unless -Force) ---
  @{id="guodian";       name="Guodian Laozi";        file="_郭店楚简老子.txt";    skip=$true},
  @{id="yinfu";         name="Yinfu Jing";            file="_阴符经_道藏本.txt";       skip=$true},
  @{id="guiguzi";       name="Guiguzi";               file="_鬼谷子.txt";          skip=$true},
  @{id="hanfeizi";      name="Hanfeizi";              file="_韩非子.txt";         skip=$true},
  @{id="shangjunshu";   name="Shangjunshu";           file="_商君书.txt";      skip=$true},
  @{id="heraclitus";    name="Heraclitus";            file="_赫拉克利特残篇_DK.txt";       skip=$true},
  @{id="liberAL";       name="Liber AL vel Legis";    file="_律法之书_三章.txt";         skip=$true},

  # --- ACTIVE TARGETS ---
  @{id="sunzi";      name="Sun Tzu Art of War";    file="_sunzi.txt"
    sources=@(@{type="wiki";lang="zh";title="Sun Zi Bing Fa"},@{type="wiki";lang="zh";title="孫子兵法"})},

  @{id="zhuangzi";   name="Zhuangzi";              file="_zhuangzi.txt"
    sources=@(
      @{type="wiki-multi";lang="zh";titles=@("莊子/逍遙遊","莊子/齊物論","莊子/養生主","莊子/人間世","莊子/德充符","莊子/大宗師","莊子/應帝王","莊子/駢拇","莊子/馬蹄","莊子/胠篋","莊子/在宥","莊子/天地","莊子/天道","莊子/刻意","莊子/繕性")})},

  @{id="daodejing";  name="Daodejing Wang Bi";     file="_daodejing_wangbi.txt"
    sources=@(@{type="wiki";lang="zh";title="道德經 (王弼本)"})},

  @{id="diamond";    name="Diamond Sutra Kumarajiva"; file="_diamond_sutra.txt"
    sources=@(@{type="wiki";lang="zh";title="金剛般若波羅蜜經_(鳩摩羅什)"})},

  @{id="heart";      name="Heart Sutra Xuanzang";  file="_heart_sutra.txt"
    sources=@(@{type="wiki";lang="zh";title="般若波羅蜜多心經 (玄奘譯)"})},

  @{id="liuzu";      name="Platform Sutra";        file="_liuzu.txt"
    sources=@(@{type="wiki";lang="zh";title="六祖大師法寶壇經"})},

  @{id="daxue";      name="Great Learning";        file="_daxue.txt"
    sources=@(@{type="wiki";lang="zh";title="大學章句"},@{type="wiki";lang="zh";title="大學"})},

  @{id="zhongyong";  name="Doctrine of Mean";      file="_zhongyong.txt"
    sources=@(@{type="wiki";lang="zh";title="禮記/中庸"},@{type="wiki";lang="zh";title="中庸 (子思)"})},

  @{id="yijing";     name="I Ching Xici Zhuan";    file="_yijing.txt"
    sources=@(@{type="wiki-multi";lang="zh";titles=@("周易/繫辭上傳","周易/繫辭下傳","周易/說卦傳")})},

  @{id="bhagavad";   name="Bhagavad Gita";         file="_bhagavad_gita.txt"
    sources=@(@{type="gut";gutid="2388"})},

  @{id="genesis";    name="Genesis Exodus KJV";    file="_genesis.txt"
    sources=@(@{type="gut";gutid="10";slice_start="1:1 In the beginning";slice_len=350000})},

  # --- TIER 2: PENDING ---
  @{id="analects";   name="Analects Lunyu";        file="_lunyu.txt"
    sources=@(@{type="wiki";lang="zh";title="論語"})},

  @{id="mengzi";     name="Mengzi";                file="_mengzi.txt"
    sources=@(@{type="wiki";lang="zh";title="孟子"})},

  @{id="liezi";      name="Liezi";                 file="_liezi.txt"
    sources=@(@{type="wiki";lang="zh";title="列子"})},

  @{id="mozi";       name="Mozi";                  file="_mozi.txt"
    sources=@(@{type="wiki";lang="zh";title="墨子"})},

  @{id="wuzi";       name="Wuzi Art of War";       file="_wuzi.txt"
    sources=@(@{type="wiki";lang="zh";title="吳子"})},

  @{id="plato_republic"; name="Plato Republic";    file="_plato_republic.txt"
    sources=@(@{type="gut";gutid="1497"})},

  @{id="marcus";     name="Marcus Aurelius Meditations"; file="_meditations.txt"
    sources=@(@{type="gut";gutid="2680"})},

  @{id="nicomachean";name="Nicomachean Ethics Aristotle"; file="_nicomachean.txt"
    sources=@(@{type="gut";gutid="8438"})},

  @{id="upanishads"; name="Upanishads Muller";     file="_upanishads.txt"
    sources=@(@{type="gut";gutid="3283"})},

  @{id="quran_sale"; name="Quran Sale Translation"; file="_quran.txt"
    sources=@(@{type="gut";gutid="7440"})}
)

# === FETCH ENGINE ===
function fetch-one($entry){
  $fp=Join-Path $DIR $entry.file
  if((Test-Path $fp) -and (Get-Item $fp).Length -gt 1000 -and -not $Force){
    Write-Host "  SKIP: $($entry.name) (exists)" -ForegroundColor DarkGray
    return $true
  }

  Write-Host "`n>>> $($entry.name)" -ForegroundColor Cyan
  foreach($src in $entry.sources){
    $body=$null
    try{
      switch($src.type){
        "wiki" {
          $raw=wiki-get $src.title $src.lang
          if($raw){$body=clean $raw}
        }
        "wiki-multi" {
          $parts=@()
          foreach($t in $src.titles){
            $raw=wiki-get $t $src.lang
            if($raw -and $raw.Length -gt 100){
              $section=$t -replace '^[^/]+/',""
              $parts+="=== $section ===`n`n"+(clean $raw)
            }
          }
          if($parts.Count -gt 0){$body=$parts -join "`n`n"}
        }
        "gut" {
          $raw=gut-get $src.gutid
          if($raw){
            if($src.slice_start){
              $si=$raw.IndexOf($src.slice_start)
              if($si -ge 0){$raw=$raw.Substring($si,[math]::Min($src.slice_len,$raw.Length-$si))}
            }
            $body=$raw
          }
        }
      }
    }catch{ Write-Warning "  ERR $($src.type): $_"; continue }

    if($body -and $body.Length -gt 200){
      return save-text $fp $entry.name $body
    }
    Write-Host "  FAIL src=$($src.type) len=$(if($body){$body.Length}else{0})" -ForegroundColor Red
  }
  return $false
}

# === STATUS ===
if($Status){
  Write-Host "`n=== DAO CANON STATUS ===" -ForegroundColor Yellow
  $CANON | ForEach-Object {
    $fp=Join-Path $DIR $_.file
    $exists=Test-Path $fp
    $sz=if($exists){[math]::Round((Get-Item $fp).Length/1024,1)}else{0}
    $mark=if($exists -and $sz -gt 1){"[OK $sz`KB]"}elseif($exists){"[STUB]"}else{"[MISS]"}
    Write-Host "  $mark $($_.id.PadRight(16)) $($_.name)"
  }
  exit 0
}

# === INDEX REBUILD ===
function rebuild-index(){
  $txts=Get-ChildItem "$DIR\*.txt" | Sort-Object Length -Descending
  $total=($txts|Measure-Object Length -Sum).Sum
  $lines=@(
    "# Dao Canon - Classical Texts Library",
    "",
    "> Dao De Jing: wu wei er wu bu wei (act without acting, nothing left undone)",
    "> Acquire all, waste nothing. One command to rule them all.",
    "",
    "## Acquired: $($txts.Count) texts / $([math]::Round($total/1024,0))KB",
    "",
    "| # | File | KB | Contents |",
    "|---|---|---|---|"
  )
  $labels=@{
    "_genesis.txt"="Genesis + Exodus (KJV 1611)"; "_bhagavad_gita.txt"="Bhagavad Gita (Gutenberg)";
    "_zhuangzi.txt"="Zhuangzi - 15 chapters"; "_liuzu.txt"="Platform Sutra (Liuzu Tanjing)";
    "_sunzi.txt"="Art of War - 13 chapters"; "_daodejing_wangbi.txt"="Daodejing (Wang Bi, 81 chapters)";
    "_diamond_sutra.txt"="Diamond Sutra (Kumarajiva)"; "_鬼谷子.txt"="Guiguzi - 12 chapters";
    "_律法之书_三章.txt"="Liber AL vel Legis (Crowley)"; "_郭店楚简老子.txt"="Guodian Bamboo Laozi";
    "_赫拉克利特残篇_DK.txt"="Heraclitus Fragments (DK)"; "_商君书.txt"="Book of Lord Shang";
    "_daxue.txt"="Great Learning (Daxue)"; "_斯宾诺莎_伦理学第一部.txt"="Spinoza Ethics Part I";
    "_韩非子.txt"="Han Feizi (Wudu chapter)"; "_无有歌_梨俱吠陀10.129.txt"="Rig Veda Nasadiya 10.129";
    "_庄子_齐物论.txt"="Zhuangzi - Qiwulun"; "_庄子_逍遥游.txt"="Zhuangzi - Xiaoyaoyou";
    "_龙树_中论_核心品.txt"="Nagarjuna Mulamadhyamakakarika"; "_庄子_大宗师.txt"="Zhuangzi - Dazongshi";
    "_阴符经_道藏本.txt"="Yinfu Jing (Daozang edition)"; "_heart_sutra.txt"="Heart Sutra (Xuanzang)";
    "_周易_系辞传.txt"="I Ching Xici Zhuan"; "_管子_水地篇.txt"="Guanzi - Shuidi chapter";
    "_孙子兵法_虚实篇.txt"="Art of War - Xushi chapter"; "_太一生水_郭店楚简.txt"="Taiyi Sheng Shui";
    "_yijing.txt"="I Ching Xici (merged)"; "_zhongyong.txt"="Zhongyong (Doctrine of Mean)"
  }
  $i=1
  $txts | ForEach-Object {
    $kb=[math]::Round($_.Length/1024,1)
    $lbl=if($labels.ContainsKey($_.Name)){$labels[$_.Name]}else{$_.Name}
    $lines+="| $i | ``$($_.Name)`` | $kb | $lbl |"
    $i++
  }
  $lines+=@(
    "","## Quick Start","",
    '```powershell',
    "# Acquire all pending texts",
    ".\fetch-canon.ps1",
    "",
    "# Acquire specific text",
    ".\fetch-canon.ps1 -Id sunzi",
    "",
    "# Force re-acquire (overwrite existing)",
    ".\fetch-canon.ps1 -Id zhuangzi -Force",
    "",
    "# Status overview",
    ".\fetch-canon.ps1 -Status",
    "",
    "# Rebuild this index only",
    ".\fetch-canon.ps1 -Index",
    '```',
    "","## Sources","",
    "| Source | Status | Notes |",
    "|---|---|---|",
    "| zh.wikisource.org | OK | Chinese classics - primary source |",
    "| en.wikisource.org | OK | English translations |",
    "| gutenberg.org | OK | Western classics, Sanskrit translations |",
    "| ctext.org | CAPTCHA | Requires API subscription |",
    "| sacred-texts.com | 403 | Blocked |",
    "","---","",
    "> Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')","")
  $lines -join "`n" | Set-Content (Join-Path $DIR "INDEX.md") -Encoding UTF8
  Write-Host "INDEX.md rebuilt: $($txts.Count) files / $([math]::Round($total/1024,0))KB" -ForegroundColor Cyan
}

if($Index){ rebuild-index; exit 0 }

# === MAIN: FETCH ===
Write-Host "`nDao Canon Fetcher v3 - wu wei er wu bu wei" -ForegroundColor Yellow
$targets=if($Id){ $CANON|Where-Object{$_.id -eq $Id} }
         else{ $CANON|Where-Object{-not $_.skip} }
if(-not $targets){ Write-Host "No targets (id=$Id)"; exit 1 }
Write-Host "Targets: $(@($targets).Count)" -ForegroundColor Cyan
$ok=0; $fail=0
foreach($t in @($targets)){ if(fetch-one $t){$ok++}else{$fail++} }
Write-Host "`nDone: OK=$ok FAIL=$fail" -ForegroundColor Yellow
rebuild-index