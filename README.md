# UPS — Canvas Notes

A canvas-based note-taking and dataops visualization tool. Paste text to create draggable note cards, draw arrows between them, and organize your thoughts visually.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The dev server runs on **port 3000** (configured in `vite.config.js`).

## Features

- **Paste** text to create note cards (one card per line for multi-line pastes)
- **Drag** cards anywhere on the 4000px wide canvas
- **Arrows** — click the `⟶` button on a card, then click a target to connect them. Shift-click multiple cards first to draw arrows from all of them at once. Click an arrow to delete it.
- **Edit** note text via the `✎` button; saves on blur
- **Subnotes** — expandable details on each card, editable by clicking the text
- **Color status** — green / yellow / red dot buttons tint the card or subnote background
- **Auto Arrange** — lays out connected cards in BFS layers; isolated cards are placed to the right
- **Save / Load** — exports and imports canvas state as a JSON file
