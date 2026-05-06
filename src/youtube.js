import { spawn } from "node:child_process";
import { createAudioResource } from "@discordjs/voice";

function stopProcess(proc) {
  if (!proc.killed) {
    proc.kill("SIGKILL");
  }
}

function isAllowedYouTubeUrl(raw) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return false;

    const host = url.hostname.toLowerCase();
    return (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

export function createYouTubeAudioResource(url, volume = 0.6) {
  if (!isAllowedYouTubeUrl(url)) {
    throw new Error("Only YouTube URLs are supported.");
  }

  const ytdlp = spawn("yt-dlp", ["--no-playlist", "-f", "bestaudio/best", "-o", "-", url], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-i", "pipe:0",
      "-analyzeduration", "0",
      "-loglevel", "0",
      "-f", "opus",
      "-ar", "48000",
      "-ac", "2",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] }
  );

  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.stdout.on("error", (err) => {
    console.error("[yt-dlp stdout]", err);
  });

  ffmpeg.stdin.on("error", (err) => {
    if (err.code !== "EPIPE") {
      console.error("[ffmpeg stdin]", err);
    }
  });

  ffmpeg.stdout.on("error", (err) => {
    console.error("[ffmpeg stdout]", err);
  });

  ytdlp.on("error", (err) => {
    console.error("[yt-dlp] failed to start:", err);
    try { ffmpeg.stdin.destroy(err); } catch {}
    stopProcess(ffmpeg);
  });

  ffmpeg.on("error", (err) => {
    console.error("[ffmpeg] failed to start:", err);
    stopProcess(ytdlp);
  });

  ytdlp.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[yt-dlp] exited with code ${code}`);
      try { ffmpeg.stdin.destroy(); } catch {}
    }
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[ffmpeg] exited with code ${code}`);
    }
  });

  ytdlp.stderr.on("data", (d) => console.error("[yt-dlp]", d.toString()));
  ffmpeg.stderr.on("data", (d) => console.error("[ffmpeg]", d.toString()));

  const resource = createAudioResource(ffmpeg.stdout, { inlineVolume: true });
  resource.volume?.setVolume(volume);

  const kill = () => {
    try { stopProcess(ytdlp); } catch {}
    try { stopProcess(ffmpeg); } catch {}
  };

  return { resource, kill };
}

export async function fetchYouTubeTitle(url) {
  if (!isAllowedYouTubeUrl(url)) {
    return null;
  }

  return await new Promise((resolve) => {
    const proc = spawn("yt-dlp", ["--get-title", "--no-playlist", url], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };

    const timeout = setTimeout(() => {
      try { stopProcess(proc); } catch {}
      finish(null);
    }, 30000);

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    proc.stdout.on("error", () => finish(null));

    proc.on("close", (code) => {
      if (code === 0) {
        const title = stdout.trim();
        finish(title || null);
      } else {
        finish(null);
      }
    });

    proc.on("error", () => finish(null));
  });
}
