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
      recordCurrentOnNext: true,
      panelMessage: null,
      panelUpdater: null,
    };

    player.on(AudioPlayerStatus.Idle, () => {
      console.log("Audio player state: idle");
      playNext(guildId).catch(console.error);
    });

    player.on("stateChange", (oldState, newState) => {
      console.log(`Audio player state: ${oldState.status} -> ${newState.status}`);
    });

    player.on("error", (err) => {
      console.error("Audio player error:", err);
      playNext(guildId).catch(console.error);
    });

    guildPlayers.set(guildId, state);
  }

  return guildPlayers.get(guildId);
}

export function setPanelMessage(guildId, message) {
  getGuildState(guildId).panelMessage = message;
}

export function setPanelUpdater(guildId, fn) {
  getGuildState(guildId).panelUpdater = fn;
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
  const guild = interaction.guild;

  if (!guild) {
    throw new Error("This only works inside a Discord server.");
  }

  const member = await guild.members.fetch(interaction.user.id);
  const voiceChannel = member?.voice?.channel;

  console.log("Join requested by:", interaction.user.tag);
  console.log("Detected voice channel:", voiceChannel ? `${voiceChannel.name} (${voiceChannel.id})` : "none");

  if (!voiceChannel) {
    throw new Error("You must be in a server voice channel before clicking Join/Play.");
  }

  const state = getGuildState(interaction.guildId);

  if (!state.connection) {
    console.log("Creating new voice connection...");

    state.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    state.connection.on("stateChange", (oldState, newState) => {
      console.log(`Voice connection state: ${oldState.status} -> ${newState.status}`);
    });

    state.connection.on("error", (err) => {
      console.error("Voice connection error:", err);
    });

    state.connection.subscribe(state.player);

    try {
      console.log("Waiting for voice connection READY...");
      await entersState(state.connection, VoiceConnectionStatus.Ready, 30000);
      console.log("Voice connection READY.");
    } catch (e) {
      console.error("Voice connection failed:", e);

      try {
        state.connection.destroy();
      } catch {}

      state.connection = null;

      throw new Error(
        "Could not connect to the voice channel. Check bot permissions or VM outbound UDP/network."
      );
    }
  } else {
    console.log("Reusing existing voice connection:", state.connection.state.status);
  }

  return state;
}

export function setQueue(guildId, items) {
  const state = getGuildState(guildId);
  state.queue = items.slice();
  state.history = [];
  state.now = null;
  state.recordCurrentOnNext = true;
  console.log(`Queue loaded: ${state.queue.length} tracks`);
  refreshPanel(guildId).catch(console.error);
}

export function play(guildId) {
  const state = getGuildState(guildId);
  state.recordCurrentOnNext = true;
  console.log("Play requested");
  state.player.stop(true);
}

export function skip(guildId) {
  const state = getGuildState(guildId);
  state.recordCurrentOnNext = true;
  console.log("Skip requested");
  state.player.stop(true);
  refreshPanel(guildId).catch(console.error);
}

export function previous(guildId) {
  const state = getGuildState(guildId);

  if (!state.history.length) {
    console.log("Previous requested but history is empty");
    return false;
  }

  if (state.now) {
    state.queue.unshift(state.now);
  }

  const prev = state.history.pop();
  state.queue.unshift(prev);
  state.recordCurrentOnNext = false;
  console.log("Previous requested");
  state.player.stop(true);
  refreshPanel(guildId).catch(console.error);

  return true;
}

export function replay(guildId) {
  const state = getGuildState(guildId);

  if (!state.now) {
    console.log("Replay requested but nothing is playing");
    return false;
  }

  state.queue.unshift({ ...state.now });
  state.recordCurrentOnNext = false;
  console.log("Replay requested");
  state.player.stop(true);
  refreshPanel(guildId).catch(console.error);

  return true;
}

export function togglePause(guildId) {
  const state = getGuildState(guildId);
  const status = state.player.state.status;

  console.log("Pause/resume requested. Current state:", status);

  if (status === AudioPlayerStatus.Playing) {
    state.player.pause();
    refreshPanel(guildId).catch(console.error);
    return "paused";
  }

  if (status !== AudioPlayerStatus.Paused) {
    refreshPanel(guildId).catch(console.error);
    return "idle";
  }

  state.player.unpause();
  refreshPanel(guildId).catch(console.error);
  return "resumed";
}

export function leave(guildId) {
  const state = getGuildState(guildId);

  console.log("Leave requested");

  state.queue = [];
  state.history = [];
  state.now = null;
  state.recordCurrentOnNext = true;

  if (state.killPipeline) {
    try {
      state.killPipeline();
    } catch {}
    state.killPipeline = null;
  }

  if (state.connection) {
    try {
      state.connection.destroy();
    } catch {}
    state.connection = null;
  }

  refreshPanel(guildId).catch(console.error);
}

async function playNext(guildId) {
  const state = getGuildState(guildId);

  if (state.killPipeline) {
    try {
      state.killPipeline();
    } catch {}
    state.killPipeline = null;
  }

  if (state.now && state.recordCurrentOnNext !== false) {
    state.history.push(state.now);
  }

  state.recordCurrentOnNext = true;

  const next = state.queue.shift();
  state.now = next || null;

  if (!next) {
    console.log("Queue empty");
    await refreshPanel(guildId);
    return;
  }

  console.log("Starting track:", next.title || next.url);

  try {
    const { resource, kill } = createYouTubeAudioResource(next.url);
    state.killPipeline = kill;
    state.player.play(resource);
  } catch (e) {
    console.error("Failed to create audio resource:", e);
    state.now = null;
    state.recordCurrentOnNext = false;
    await refreshPanel(guildId);
    return playNext(guildId);
  }

  await refreshPanel(guildId);
}