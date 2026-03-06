# Discord Music Bot

Discord music bot with:
- per-user playlists
- shared playback
- buttons and dropdowns
- previous / replay / skip / pause
- persistent panel
- YouTube streaming via yt-dlp + ffmpeg
- optional YouTube title fetching

## Requirements
- Node.js 20+
- ffmpeg
- yt-dlp

## Setup
1. Copy `.env.example` to `.env`
2. Fill in token / client ID / guild ID
3. Run:
   npm install
   npm run register
   npm start

## Usage
- Run `/panel` once in your server
- Join a voice channel
- Click Join
- Create playlist
- Add track
- Select playlist
- Click Play