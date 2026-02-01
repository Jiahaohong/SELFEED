<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1-JADmVHHYgZd5XtjjG8EtNIPWDh8ksaR

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run as an Electron desktop app

1. Install dependencies:
   `npm install`
2. Start the Vite dev server in one terminal:
   `npm run dev`
3. Launch Electron in another terminal:
   `npm run electron:dev`

### Build for Electron (local preview)

1. Build the renderer bundle:
   `npm run electron:build`
2. Preview the built Electron app:
   `npm run electron:preview`

## Backend (MVP)

The backend runs on `http://localhost:8787` and provides keyword + news APIs.
RSS sources are configured in `backend/sources.json`.

Start backend only:
`npm run backend:dev`

Start desktop app (backend + Vite + Electron):
`npm run dev`
