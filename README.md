# Discord Music Bot

A Discord music bot with per-user playlists, shared playback controls, persistent panels, and YouTube audio streaming through `yt-dlp` and `ffmpeg`.

## Features

- Per-user playlists
- Shared server playback queue
- Buttons and dropdown controls
- Join, play, pause, resume, skip, previous, replay, and leave
- Persistent music panel
- YouTube title fetching
- YouTube audio playback using `yt-dlp` and `ffmpeg`

## Requirements

- Node.js 22.12.0 or newer
- npm
- ffmpeg
- yt-dlp
- A Discord bot token
- A Discord server where you can invite and manage the bot
- Outbound HTTPS/TCP access to Discord
- Outbound UDP access for Discord voice

The bot uses `@discordjs/voice` `^0.19.2`. Older versions can fail to reach the Discord voice `Ready` state on newer Node.js versions.

## Discord Bot Setup

Create an application in the Discord Developer Portal, then create a bot for that application.

Enable these bot settings:

- Server Members Intent is not required
- Message Content Intent is not required
- The bot must be invited with `applications.commands`
- The bot must be invited with `bot`

Recommended bot permissions:

- View Channels
- Send Messages
- Embed Links
- Use Slash Commands
- Connect
- Speak

The bot also needs channel-specific access to the voice channel you want it to join.

## Environment

Copy the example file:

```bash
cp .env.example .env
```

Then fill in:

```env
DISCORD_TOKEN=YOUR_BOT_TOKEN
CLIENT_ID=YOUR_APPLICATION_ID
GUILD_ID=YOUR_TEST_SERVER_ID
DB_PATH=./data/bot.sqlite
```

`GUILD_ID` is used when registering slash commands for one server.

## Install

Install Node dependencies:

```bash
npm install
```

Install system dependencies.

On AlmaLinux/RHEL-style systems:

```bash
sudo dnf install -y git curl ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod 0755 /usr/local/bin/yt-dlp
```

On Debian/Ubuntu-style systems:

```bash
sudo apt update
sudo apt install -y git curl ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod 0755 /usr/local/bin/yt-dlp
```

Verify:

```bash
node -v
ffmpeg -version
yt-dlp --version
```

## Register Commands

Register the slash commands:

```bash
npm run register
```

Run this again after changing command definitions.

## Run

Start the bot:

```bash
npm start
```

For a server deployment, run it with systemd, pm2, Docker, or another process manager so it restarts automatically.

## Usage

1. Run `/panel` once in your Discord server.
2. Join a voice channel.
3. Click `Join`.
4. Create a playlist.
5. Add a YouTube track.
6. Select a playlist.
7. Click `Play`.

## VM And Network Notes

Discord voice requires UDP. The bot can appear in a voice channel but disconnect after a timeout if the VM or network blocks outbound UDP.

Check these if voice join fails:

- Guest firewall, such as `firewalld`, `nftables`, or `iptables`
- Proxmox VM firewall
- Proxmox host firewall
- Router or upstream firewall rules
- Broken IPv6 routing
- DNS resolution
- Discord voice channel permissions

Useful checks on Linux:

```bash
systemctl status firewalld --no-pager
ip route
resolvectl status || cat /etc/resolv.conf
curl -I https://discord.com/api/v10/gateway
```

If the bot logs show `Voice connection state: connecting -> ready`, voice networking is working.

If it stays around `signalling` or `connecting` and then times out, check outbound UDP and Discord voice permissions.

## Troubleshooting

### Could not connect to the voice channel

This usually means the bot did not reach the Discord voice `Ready` state.

Check:

- The bot has `Connect` and `Speak` permission in the voice channel.
- The VM has outbound UDP access.
- The bot is using `@discordjs/voice` `^0.19.2`.
- Node.js is 22.12.0 or newer.
- The bot is actually in the same voice channel as the user pressing `Join` or `Play`.

### Bot joins but does not start playing

Make sure `src/player.js` starts playback when the audio player is idle. The `play()` function should call `playNext()` when `AudioPlayerStatus.Idle`.

### yt-dlp or ffmpeg errors

Check both tools are installed and available:

```bash
which ffmpeg
which yt-dlp
yt-dlp --version
```

This project expects `yt-dlp` at `/usr/local/bin/yt-dlp`.

### Unknown interaction

Discord interactions must be replied to quickly. Slow voice joins, slow network, or a busy VM can cause Discord to expire an interaction before the bot replies.

## Updating

After pulling code changes:

```bash
npm install
npm run register
npm start
```

For systemd deployments:

```bash
sudo systemctl restart discord-music-bot
sudo journalctl -u discord-music-bot -n 100 --no-pager
```
