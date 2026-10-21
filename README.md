# Weltrade analysis saver

Save your drawings and analysis on the Weltrade TradingView chart, and get them back later, the way you would on MT5 or
TradingView.

- **Auto-save:** about 2 seconds after you draw, move or delete anything, the drawings are saved for that symbol.
- **Save button:** type an optional name and click **Save** to keep a permanent version, with a screenshot.
- **History / Load:** pick any past version of the current symbol and click **Load** to put it back on the chart.
- **Auto-load:** after a page reload or in a new window, each symbol's latest analysis is redrawn automatically.
- **Catches up:** drawings already on a chart when the saver starts (e.g. drawn while it wasn't running) are saved right away.

Every drawing type is kept: lines, levels, zones, Fibonacci, text, long/short positions, and so on. Each one keeps its
exact time/price points and style. Indicators on the chart are saved too.

## Requirements
- Windows (tested), macOS or Linux, with Microsoft Edge
- [Node.js](https://nodejs.org) 22 or newer and Git (`install.ps1` / `install.sh` install or update both for you)

## Installation
### Quick install (checks and updates Git and Node.js for you)
`install.ps1` (Windows) and `install.sh` (macOS and Linux) do everything in one go and are safe to run again:

- install **Git** if it's missing,
- install **Node.js** if it's missing, or **upgrade it if it's older than 22**,
- clone the project (or `git pull` it if it's already there), then run `npm install` and `npm run build`.

If you already have Git or Node.js, they're left alone as long as they are recent enough.

**Windows (PowerShell)**: uses `winget`, which comes with Windows 10/11.
```powershell
Invoke-WebRequest https://raw.githubusercontent.com/Mjg-tech/weltrade-analysis-saver/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1            # add -Start to launch it right after
```

**macOS and Linux (Terminal)**: uses Homebrew on macOS, and apt, dnf or pacman on Linux.
```bash
curl -fsSL https://raw.githubusercontent.com/Mjg-tech/weltrade-analysis-saver/main/install.sh -o install.sh
bash install.sh
```

Already cloned the project? Just run `.\install.ps1` / `bash install.sh` from inside it: it updates the tools and the project.
Pass a folder to install somewhere else: `-Dir D:\saver` on Windows, `bash install.sh ~/saver` on macOS and Linux.

`start.bat` and `create-shortcut.bat` are Windows-only. On macOS and Linux, start the browser with the debug port and then
the saver (next time you only need these two commands, no reinstall):

```bash
# macOS
"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.weltrade-analysis-saver/browser-profile" \
  https://secure.weltrade.com/trading/analytichub/tradingview &
# Linux: same, but start it with  microsoft-edge  (or google-chrome / chromium) instead of the path above

cd ~/weltrade-analysis-saver && node dist/saver.js
```

The saver itself has no Windows-specific code, but the macOS and Linux paths haven't been tested.

### Manual install
Install [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 22 or newer yourself, then:

```bash
git clone https://github.com/Mjg-tech/weltrade-analysis-saver.git
cd weltrade-analysis-saver
npm install && npm run build
```
Then start it with `start.bat` (Windows) or the commands above (macOS and Linux).

## Open Weltrade in a debug browser (PowerShell)
The saver needs a browser started with the debug port (9222). `start.bat` (Edge) and `start-chrome.bat` (Chrome) do this
and start the saver too; or paste one of these into PowerShell to open just the browser. Log in to Weltrade the first time: the login is kept in a separate profile (not your everyday one), so you
only do it once per browser.

**Edge**
```powershell
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
Start-Process $edge -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$env:LOCALAPPDATA\weltrade-analysis-saver\browser-profile`"", "https://secure.weltrade.com/trading/analytichub/tradingview"
```

**Chrome**
```powershell
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
Start-Process $chrome -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$env:LOCALAPPDATA\weltrade-analysis-saver\browser-profile-chrome`"", "https://secure.weltrade.com/trading/analytichub/tradingview"
```

Then start the saver (`node dist\saver.js` from the project folder). It finds the debug browser on its own.

- Use **one** debug browser at a time: both commands use port 9222. To use another port, change `9222` here and set
  `WELTRADE_CDP_HTTP=http://localhost:<port>` before starting the saver.
- Chrome needs its own `--user-data-dir` for the debug port to work, which is why the profile folder is part of the command.
- Check it worked by opening <http://localhost:9222/json/version> in another tab. It should show the browser's name and version.
- The first launch can take a few seconds.

## Use
1. Double-click **`start.bat`** (opens Edge) or **`start-chrome.bat`** (opens Chrome). On the first run it installs and
   builds the program, which takes a minute.
2. The browser opens on Weltrade's Analytic Hub. Log in and open **TradingView**. You only need to log in the first time.
   Edge and Chrome each keep their own login.
3. A small panel appears at the bottom-left of the chart: `name | Save | history ▾ | Load | status`.
4. Keep the black saver window open while you work. Closing it, or pressing Ctrl+C, stops saving.

The saver handles every Weltrade chart tab you open in that browser. It leaves alone windows whose title starts with
`[` (for example `[test-session] Weltrade`). Those are opened by trading agents through the Weltrade MCP, and their
drawings never mix with yours.

## Desktop and taskbar shortcut
Double-click **`create-shortcut.bat`** to put a **Weltrade Charts** shortcut on your desktop. It opens Edge on Weltrade
and starts the saver in one click. To pin it, right-click the shortcut and choose **Pin to taskbar**. Windows doesn't
let programs pin to the taskbar themselves.

If you already have an Edge debug profile that's logged in to Weltrade, pass its folder so you don't have to log in
again: `create-shortcut.bat "D:\Weltrade\edge-profile"`. If you move this folder, run `create-shortcut.bat` again.

## Where your analyses are saved
In the `analyses` folder next to this README, one folder per symbol:

```
analyses/
  FX-VOL-60/
    FX-VOL-60_5_20260926T131714Z.json   a version you saved with the button
    FX-VOL-60_5_20260926T131714Z.png    its screenshot
    autosave.json                       the auto-saved state (updated as you draw)
    latest.json                         the newest of the above (used for auto-load)
```

To move your analyses to another computer, copy the `analyses` folder. It isn't uploaded to GitHub.

## Options
- `start.bat --no-panel`: auto-save and auto-load only, no panel on the chart.
- `start.bat --no-autoload`: don't redraw saved analyses automatically.
- `WELTRADE_ANALYSIS_DIR`: save analyses somewhere else.
- `WELTRADE_PROFILE`: which browser profile to use. The default is `%LOCALAPPDATA%\weltrade-analysis-saver\browser-profile`
  for `start.bat` (Edge) and `...\browser-profile-chrome` for `start-chrome.bat` (Chrome).
- `WELTRADE_CDP_HTTP`: the browser's debug address. The default is `http://localhost:9222`.

## Sign-in and privacy
**Nobody is logged in for you.** The browser opens on Weltrade's own **Authorization | Weltrade** sign-in page (email and
password, or Google, Facebook or Line). Only someone with a Weltrade account can get past it, and everyone signs in with
**their own** account. A brand-new browser profile lands on the sign-in page, not on an account.
This repository holds no Weltrade login, token, cookie or account details, and your saved analyses and browser profile are
kept out of it (`.gitignore`).

- The program only talks to the browser on your own computer. It doesn't read or store your Weltrade login.
- The browser profile that holds your login is kept in your user folder, outside this folder, and is never uploaded.
  The first launch always starts signed out; after you sign in once, that profile remembers you on **that computer only**.
- Only pass `create-shortcut.bat` a profile that is already logged in (see above) if you are the only person who uses it:
  it opens straight into that account with no sign-in step.
- To go back to the sign-in screen, sign out in Weltrade, or close the browser and delete the saver's profile (this also
  removes the remembered login, but not your saved analyses):
  ```powershell
  Remove-Item -Recurse -Force "$env:LOCALAPPDATA\weltrade-analysis-saver\browser-profile"         # Edge
  Remove-Item -Recurse -Force "$env:LOCALAPPDATA\weltrade-analysis-saver\browser-profile-chrome"  # Chrome
  ```
- The debug port lets any program on this computer control that browser profile, so only use it for Weltrade.
