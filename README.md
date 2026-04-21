# Nexus Analytics

A local web dashboard for scanning Rise of Agon PVP gank data. Runs on your machine so the site doesn't block requests like browser-based proxies do.

---

## What it does

Crawls through the Agon Metrics gank pages, pulls all kill data for the date range you pick, and displays everything in a live dashboard. Click on any player or clan name after a scan to see their full stats.

---

## Requirements

Node.js - https://nodejs.org

That's it. No npm install, no dependencies, nothing else.

---

## How to run

**Windows** - double-click `START Windows.bat`

**Mac** - double-click `START Mac.command`

Your browser will open automatically at http://localhost:3337. Close the terminal window to stop the server.

---

## Features

**Scanning**
- Pick a single day or a date range
- Watches the console stream page by page in real time
- Stops automatically when it runs past your target dates so you're not sitting there waiting
- Player/clan name filter to narrow results before or after scanning

**Player profiles**
- Click any player name in the results table
- Shows kills, deaths, K/D ratio, active days
- Ranked list of who they killed and who killed them
- Click any name inside the profile to jump to that player

**Clan profiles**
- Click any clan name in the results table
- Shows total kills, deaths, K/D, member count, active days
- Breaks down top killers in the clan, which enemy clans they hit the most, and which clans hit them back

**Everything is cross-navigable** - player to clan, clan to player, as deep as you want to go

**CSV export** - download everything as a spreadsheet once the scan finishes

---

## Notes

- Data comes from https://www.riseofagon.com/agonmetrics/pvp/global/ganks/
- Agon Metrics has a notice on the site that their data may not be fully up to date
- Default scan range is pages 1 to 3000, you can narrow this if you know roughly where the dates you want are
- Tested on Windows and Mac
