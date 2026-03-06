import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  createAudioPlayer,
  AudioPlayerStatus,
} from "@discordjs/voice";
import { createYouTubeAudioResource } from "./youtube.js";

const guildPlayers = new Map();

export function getGuildState(guildId) {
  if (!guildPlayers.has(guildId)) {
    const player = createAudioPlayer();

    const state = {
      connection: null,
      player,
      queue: [],
      history: [],
      now: null,
      killPipeline: null,
      panelMessage: null,
      panelUpdater: null,
    };

    player.on(AudioPlayerStatus.Idle, () => {
      playNext(guildId).catch(console.error);
    });

    player.on("error", (err) => {
      console.error("Audio error:", err);
      playNext(guildId).catch(console.error);
    });

    guildPlayers.set(guildId, state);
  }

  return guildPlayers.get(guildId);
}

export function setPanelMessage(guildId, message) {
  const state = getGuildState(guildId);
  state.panelMessage = message;
}

export function setPanelUpdater(guildId, fn) {
  const state = getGuildState(guildId);
  state.panelUpdater = fn;
}

export async function refreshPanel(guildId) {
  const state = getGuildState(guildId);
  if (typeof state.panelUpdater === "function") {
    try {
      await state.panelUpdater();
    } catch (e) {
      console.error("Failed to refresh panel:", e);
    }
  }
}

export async function ensureConnectionFromInteraction(interaction) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    throw new Error("You must be in a voice channel.");
  }

  const state = getGuildState(interaction.guildId);

  if (!state.connection) {
    state.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    state.connection.subscribe(state.player);
    await entersState(state.connection, VoiceConnectionStatus.Ready, 15000);
  }

  return state;
}

export function setQueue(guildId, items) {
  const state = getGuildState(guildId);
  state.queue = items.slice();
  state.history = [];
  state.now = null;
  refreshPanel(guildId).catch(console.error);
}

export function play(guildId) {
  const state = getGuildState(guildId);
  state.player.stop(true);
}

export function skip(guildId) {
  const state = getGuildState(guildId);
  if (state.now) state.history.push(state.now);
  state.player.stop(true);
  refreshPanel(guildId).catch(console.error);
}

export function previous(guildId) {
  const state = getGuildState(guildId);
  if (!state.history.length) return false;

  if (state.now) state.queue.unshift(state.now);

  const prev = state.history.pop();
  state.queue.unshift(prev);
  state.player.stop(true);
  refreshPanel(guildId).catch(console.error);
  return true;
}

export function replay(guildId) {
  const state = getGuildState(guildId);
  if (!state.now) return false;

  state.queue.unshift({ ...state.now });
  state.player.stop(true);
  refreshPanel(guildId).catch(console.error);
  return true;
}

export function togglePause(guildId) {
  const state = getGuildState(guildId);
  const status = state.player.state.status;

  if (status === "playing") {
    state.player.pause();
    refreshPanel(guildId).catch(console.error);
    return "paused";
  }

  state.player.unpause();
  refreshPanel(guildId).catch(console.error);
  return "resumed";
}

export function leave(guildId) {
  const state = getGuildState(guildId);

  state.queue = [];
  state.history = [];
  state.now = null;

  if (state.killPipeline) {
    try { state.killPipeline(); } catch {}
    state.killPipeline = null;
  }

  if (state.connection) {
    try { state.connection.destroy(); } catch {}
    state.connection = null;
  }

  refreshPanel(guildId).catch(console.error);
}

async function playNext(guildId) {
  const state = getGuildState(guildId);

  if (state.killPipeline) {
    try { state.killPipeline(); } catch {}
    state.killPipeline = null;
  }

  const next = state.queue.shift();
  state.now = next || null;

  if (!next) {
    await refreshPanel(guildId);
    return;
  }

  const { resource, kill } = createYouTubeAudioResource(next.url);
  state.killPipeline = kill;
  state.player.play(resource);

  await refreshPanel(guildId);
}