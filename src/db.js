import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DB_PATH || "./data/bot.sqlite";
const dir = path.dirname(dbPath);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id, name)
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, position)
);

CREATE TABLE IF NOT EXISTS guild_panels (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

export function createPlaylist(ownerId, name) {
  db.prepare(
    `INSERT INTO playlists(owner_id, name, created_at) VALUES (?,?,?)`
  ).run(ownerId, name, Date.now());

  return getPlaylist(ownerId, name);
}

export function getPlaylist(ownerId, name) {
  return db.prepare(
    `SELECT * FROM playlists WHERE owner_id=? AND name=?`
  ).get(ownerId, name);
}

export function listPlaylists(ownerId) {
  return db.prepare(
    `SELECT name FROM playlists WHERE owner_id=? ORDER BY created_at DESC`
  ).all(ownerId);
}

export function addTrack(ownerId, playlistName, url, title = null) {
  const pl = getPlaylist(ownerId, playlistName);
  if (!pl) throw new Error("PLAYLIST_NOT_FOUND");

  const maxPos = db.prepare(
    `SELECT COALESCE(MAX(position),0) AS m FROM playlist_items WHERE playlist_id=?`
  ).get(pl.id).m;

  db.prepare(`
    INSERT INTO playlist_items(playlist_id, position, url, title, created_at)
    VALUES (?,?,?,?,?)
  `).run(pl.id, maxPos + 1, url, title, Date.now());

  return true;
}

export function listTracksByPlaylistId(playlistId) {
  return db.prepare(`
    SELECT position, url, title
    FROM playlist_items
    WHERE playlist_id=?
    ORDER BY position ASC
  `).all(playlistId);
}

export function listTracks(ownerId, playlistName) {
  const pl = getPlaylist(ownerId, playlistName);
  if (!pl) return null;
  return listTracksByPlaylistId(pl.id);
}

export function upsertGuildPanel(guildId, channelId, messageId) {
  db.prepare(`
    INSERT INTO guild_panels(guild_id, channel_id, message_id, created_at)
    VALUES (?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id=excluded.channel_id,
      message_id=excluded.message_id
  `).run(guildId, channelId, messageId, Date.now());
}

export function getGuildPanel(guildId) {
  return db.prepare(`SELECT * FROM guild_panels WHERE guild_id=?`).get(guildId);
}

export function listGuildPanels() {
  return db.prepare(`SELECT * FROM guild_panels`).all();
}
