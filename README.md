# Nexus Analytics

![Nexus Analytics]([https://i.imgur.com/5dIhiT9.png](https://github.com/dtmajors/RiseofAgonScanner/blob/main/screenshot.png))

A tool for scanning and analyzing PvP gank history on [Rise of Agon](https://www.riseofagon.com). Runs locally on your computer and opens in your browser — no account or internet hosting needed.

---

## What You'll Need

- **Node.js** installed on your computer (it's free)
  - Download it here: https://nodejs.org — click the big **LTS** button and install it like any normal program
  - If you're not sure whether you already have it, skip to the next step and come back here if something doesn't work

---

## How to Download This Tool

1. On this GitHub page, click the green **Code** button near the top right
2. Click **Download ZIP**
3. Find the downloaded ZIP in your Downloads folder and extract it (right-click → "Extract All" on Windows, or double-click on Mac)

---

## How to Run It

### Windows
1. Open the extracted folder
2. Double-click **`START — Windows.bat`**
3. A black terminal window will appear — leave it open
4. Your browser should open automatically at `http://localhost:3337`

### Mac
1. Open the extracted folder
2. Double-click **`START — Mac.command`**
3. If you get a security warning saying it "can't be opened because it's from an unidentified developer":
   - Go to **System Settings → Privacy & Security**
   - Scroll down and click **Open Anyway**
4. A terminal window will appear — leave it open
5. Your browser should open automatically at `http://localhost:3337`

> **Browser didn't open?** Just open it yourself and go to: `http://localhost:3337`

---

## How to Use It

1. **Pick a date** — select the day you want to look up gank history for
2. **Hit Scan** — the tool will automatically scan through pages of gank data and stop once it's past your selected date
3. **View results** — ganks will appear in the table as they're found. You can filter by player or clan name using the filter box
4. **Export** — once the scan is complete, click **Export Summary (CSV)** to save the results as a spreadsheet you can open in Excel or Google Sheets

---

## Stopping the Tool

Just close the terminal/command window that opened when you started it. That's it.

---

## Troubleshooting

**"Node.js is not recognized" or nothing happens when I double-click the start file**
→ Install Node.js from https://nodejs.org (download the LTS version), then try again. You may need to restart your computer after installing.

**The browser opens but shows an error**
→ Make sure the terminal window is still open — the tool stops working if you close it.

**It says "port already in use"**
→ The tool is probably already running. Check if there's already a terminal window open with it, or restart your computer and try again.

**Mac: "This app is damaged and can't be opened"**
→ Open Terminal (search for it in Spotlight) and run this command, replacing the path with wherever your file actually is:
```
chmod +x "/path/to/START — Mac.command"
```

---

## Notes

- This tool runs **entirely on your own computer** — nothing is uploaded or stored anywhere online
- It fetches data directly from the Rise of Agon website, so you need an internet connection
- Scanning large date ranges may take a while since it checks one page at a time to avoid overloading the site
