import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import {
  createPlaylist,
  listPlaylists,
  addTrack,
  getPlaylist,
  listTracksByPlaylistId,
  upsertGuildPanel,
} from "./db.js";
import {
  ensureConnectionFromInteraction,
  getGuildState,
  setQueue,
  play,
  skip,
  togglePause,
  leave,
  previous,
  replay,
  setPanelMessage,
  setPanelUpdater,
} from "./player.js";
import { fetchYouTubeTitle } from "./youtube.js";

const IDS = {
  SELECT_ROOT: "music_select_root",
  SELECT_MY_PLAYLIST: "music_select_my_playlist",
  SELECT_OTHER_PLAYLIST: "music_select_other_playlist",

  JOIN: "music_join",
  PREVIOUS: "music_previous",
  PLAY: "music_play",
  REPLAY: "music_replay",
  PAUSE: "music_pause",
  SKIP: "music_skip",
  LEAVE: "music_leave",
  CREATE_PL: "music_create_playlist",
  ADD_TRACK: "music_add_track",

  MODAL_CREATE: "music_modal_create",
  MODAL_ADD: "music_modal_add",
  MODAL_PICK_OWNER: "music_modal_pick_owner",
};

function buildStatusEmbed(guildId) {
  const state = getGuildState(guildId);

  const now = state.now
    ? `**${state.now.title || state.now.label || state.now.url}**`
    : "_Nothing playing_";

  const owner = state.now?.ownerTag
    ? `\nOwner: **${state.now.ownerTag}**`
    : "";

  const playlist = state.now?.playlistName
    ? `\nPlaylist: **${state.now.playlistName}**`
    : "";

  const nextTracks = state.queue.length
    ? state.queue
        .slice(0, 5)
        .map((item, idx) => `${idx + 1}. ${item.title || item.label || item.url}`)
        .join("\n")
    : "_Queue empty_";

  return new EmbedBuilder()
    .setTitle("🎵 Music Panel")
    .setDescription(
      [
        "1) Join a voice channel",
        "2) Click Join",
        "3) Select a playlist",
        "4) Click Play",
        "",
        "**Now Playing**",
        now + owner + playlist,
        "",
        "**Up Next**",
        nextTracks,
        "",
        `Queue length: **${state.queue.length}**`,
      ].join("\n")
    );
}

function buildPanelComponents() {
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(IDS.SELECT_ROOT)
      .setPlaceholder("Choose playlist source…")
      .addOptions(
        { label: "My playlists", value: "MY" },
        { label: "Other user playlists", value: "OTHER" }
      )
  );

  const controlsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.JOIN).setLabel("Join").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(IDS.PREVIOUS).setLabel("Previous").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.PLAY).setLabel("Play").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IDS.REPLAY).setLabel("Replay").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.PAUSE).setLabel("Pause/Resume").setStyle(ButtonStyle.Secondary),
  );

  const controlsRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.SKIP).setLabel("Skip").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.LEAVE).setLabel("Leave").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(IDS.CREATE_PL).setLabel("Create playlist").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.ADD_TRACK).setLabel("Add track").setStyle(ButtonStyle.Secondary),
  );

  return [selectRow, controlsRow, controlsRow2];
}

async function updatePanelMessage(guildId) {
  const state = getGuildState(guildId);
  if (!state.panelMessage) return;

  await state.panelMessage.edit({
    embeds: [buildStatusEmbed(guildId)],
    components: buildPanelComponents(),
  });
}

export async function handlePanelCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: "You need Manage Server permission to post the panel.",
      ephemeral: true,
    });
  }

  await interaction.reply({ content: "Posting panel…", ephemeral: true });

  const msg = await interaction.channel.send({
    embeds: [buildStatusEmbed(interaction.guildId)],
    components: buildPanelComponents(),
  });

  upsertGuildPanel(interaction.guildId, msg.channelId, msg.id);
  setPanelMessage(interaction.guildId, msg);
  setPanelUpdater(interaction.guildId, () => updatePanelMessage(interaction.guildId));

  return interaction.editReply({ content: "✅ Panel posted.", ephemeral: true });
}

function createModalCreatePlaylist() {
  const modal = new ModalBuilder()
    .setCustomId(IDS.MODAL_CREATE)
    .setTitle("Create playlist");

  const name = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Playlist name")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(50)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(name));
  return modal;
}

function createModalAddTrack() {
  const modal = new ModalBuilder()
    .setCustomId(IDS.MODAL_ADD)
    .setTitle("Add track");

  const playlist = new TextInputBuilder()
    .setCustomId("playlist")
    .setLabel("Playlist name (must be yours)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(50)
    .setRequired(true);

  const url = new TextInputBuilder()
    .setCustomId("url")
    .setLabel("YouTube URL")
    .setStyle(TextInputStyle.Short)
    .setMinLength(5)
    .setMaxLength(200)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(playlist),
    new ActionRowBuilder().addComponents(url)
  );

  return modal;
}

function toPlaylistQueueItems(ownerTag, ownerId, playlistName, tracks) {
  return tracks.map((t) => ({
    url: t.url,
    title: t.title || null,
    label: `${ownerTag} / ${playlistName} #${t.position}`,
    ownerId,
    ownerTag,
    playlistName,
  }));
}

async function replyEphemeral(interaction, content, components = []) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({ content, ephemeral: true, components });
  }
  return interaction.reply({ content, ephemeral: true, components });
}

export async function handleInteractions(interaction) {
  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === IDS.JOIN) {
      await ensureConnectionFromInteraction(interaction);
      return replyEphemeral(interaction, "✅ Joined your voice channel.");
    }

    if (id === IDS.PREVIOUS) {
      const ok = previous(interaction.guildId);
      return replyEphemeral(interaction, ok ? "⏮️ Going back." : "No previous track.");
    }

    if (id === IDS.PLAY) {
      const state = getGuildState(interaction.guildId);
      if (!state.queue.length && !state.now) {
        return replyEphemeral(interaction, "Pick a playlist first.");
      }

      await ensureConnectionFromInteraction(interaction);
      play(interaction.guildId);
      return replyEphemeral(interaction, "▶️ Playing.");
    }

    if (id === IDS.REPLAY) {
      const ok = replay(interaction.guildId);
      return replyEphemeral(interaction, ok ? "🔁 Replaying current track." : "Nothing to replay.");
    }

    if (id === IDS.PAUSE) {
      const mode = togglePause(interaction.guildId);
      return replyEphemeral(interaction, mode === "paused" ? "⏸️ Paused." : "▶️ Resumed.");
    }

    if (id === IDS.SKIP) {
      skip(interaction.guildId);
      return replyEphemeral(interaction, "⏭️ Skipped.");
    }

    if (id === IDS.LEAVE) {
      leave(interaction.guildId);
      return replyEphemeral(interaction, "👋 Left the voice channel.");
    }

    if (id === IDS.CREATE_PL) {
      return interaction.showModal(createModalCreatePlaylist());
    }

    if (id === IDS.ADD_TRACK) {
      return interaction.showModal(createModalAddTrack());
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === IDS.SELECT_ROOT) {
    const choice = interaction.values[0];

    if (choice === "MY") {
      const pls = listPlaylists(interaction.user.id);

      if (!pls.length) {
        return replyEphemeral(interaction, "You have no playlists yet. Click Create playlist.");
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(IDS.SELECT_MY_PLAYLIST)
        .setPlaceholder("Select one of your playlists…")
        .addOptions(pls.slice(0, 25).map((p) => ({ label: p.name, value: p.name })));

      return replyEphemeral(interaction, "Select one of your playlists:", [
        new ActionRowBuilder().addComponents(menu),
      ]);
    }

    if (choice === "OTHER") {
      const modal = new ModalBuilder()
        .setCustomId(IDS.MODAL_PICK_OWNER)
        .setTitle("Other user playlists");

      const field = new TextInputBuilder()
        .setCustomId("owner")
        .setLabel("Paste @mention or user ID")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(64)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(field));
      return interaction.showModal(modal);
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === IDS.SELECT_MY_PLAYLIST) {
    const playlistName = interaction.values[0];
    const pl = getPlaylist(interaction.user.id, playlistName);

    if (!pl) return replyEphemeral(interaction, "Playlist not found.");

    const tracks = listTracksByPlaylistId(pl.id);
    if (!tracks.length) return replyEphemeral(interaction, "That playlist is empty.");

    const items = toPlaylistQueueItems(interaction.user.tag, interaction.user.id, playlistName, tracks);
    setQueue(interaction.guildId, items);

    return replyEphemeral(interaction, `✅ Loaded **${playlistName}** (${tracks.length} tracks). Click Play.`);
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === IDS.MODAL_CREATE) {
      const name = interaction.fields.getTextInputValue("name").trim();

      if (!name) {
        return replyEphemeral(interaction, "Playlist name can't be empty.");
      }

      try {
        createPlaylist(interaction.user.id, name);
        return interaction.reply({ content: `✅ Created playlist **${name}**.`, ephemeral: true });
      } catch {
        return interaction.reply({ content: "That playlist already exists.", ephemeral: true });
      }
    }

    if (interaction.customId === IDS.MODAL_ADD) {
      const playlist = interaction.fields.getTextInputValue("playlist").trim();
      const url = interaction.fields.getTextInputValue("url").trim();

      if (!/^https?:\/\//i.test(url)) {
        return interaction.reply({ content: "Please paste a valid URL.", ephemeral: true });
      }

      try {
        const title = await fetchYouTubeTitle(url);
        addTrack(interaction.user.id, playlist, url, title);
        return interaction.reply({
          content: `✅ Added track to **${playlist}**${title ? `: **${title}**` : ""}.`,
          ephemeral: true,
        });
      } catch (e) {
        if (e?.message === "PLAYLIST_NOT_FOUND") {
          return interaction.reply({ content: "Playlist not found (must be yours).", ephemeral: true });
        }
        return interaction.reply({ content: "Failed to add track.", ephemeral: true });
      }
    }

    if (interaction.customId === IDS.MODAL_PICK_OWNER) {
      const raw = interaction.fields.getTextInputValue("owner").trim();
      const m = raw.match(/^<@!?(\d+)>$/);
      const ownerId = m ? m[1] : raw;

      if (!/^\d{15,25}$/.test(ownerId)) {
        return interaction.reply({
          content: "Couldn’t parse that user. Paste an @mention or numeric user ID.",
          ephemeral: true,
        });
      }

      const pls = listPlaylists(ownerId);
      if (!pls.length) {
        return interaction.reply({ content: "That user has no playlists.", ephemeral: true });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`${IDS.SELECT_OTHER_PLAYLIST}:${ownerId}`)
        .setPlaceholder("Select a playlist…")
        .addOptions(pls.slice(0, 25).map((p) => ({ label: p.name, value: p.name })));

      return interaction.reply({
        content: "Select a playlist from that user:",
        ephemeral: true,
        components: [new ActionRowBuilder().addComponents(menu)],
      });
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${IDS.SELECT_OTHER_PLAYLIST}:`)) {
    const ownerId = interaction.customId.split(":")[1];
    const playlistName = interaction.values[0];

    const pl = getPlaylist(ownerId, playlistName);
    if (!pl) return replyEphemeral(interaction, "Playlist not found.");

    const tracks = listTracksByPlaylistId(pl.id);
    if (!tracks.length) return replyEphemeral(interaction, "That playlist is empty.");

    let ownerTag = `User ${ownerId}`;
    try {
      const u = await interaction.client.users.fetch(ownerId);
      ownerTag = u.tag;
    } catch {}

    const items = toPlaylistQueueItems(ownerTag, ownerId, playlistName, tracks);
    setQueue(interaction.guildId, items);

    return replyEphemeral(
      interaction,
      `✅ Loaded **${ownerTag} / ${playlistName}** (${tracks.length} tracks). Click Play.`
    );
  }
}