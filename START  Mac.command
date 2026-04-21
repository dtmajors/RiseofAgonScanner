#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
  osascript -e 'display alert "Node.js not found" message "Please install Node.js from https://nodejs.org then try again." buttons {"OK"} default button "OK"'
  exit 1
fi

node nexus-analytics.js
