import { spawn } from "node:child_process";
import { createAudioResource } from "@discordjs/voice";

export function createYouTubeAudioResource(url, volume = 0.6) {
  const ytdlp = spawn("yt-dlp", ["-f", "bestaudio/best", "-o", "-", url], {
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

  ytdlp.stderr.on("data", (d) => console.error("[yt-dlp]", d.toString()));
  ffmpeg.stderr.on("data", (d) => console.error("[ffmpeg]", d.toString()));

  const resource = createAudioResource(ffmpeg.stdout, { inlineVolume: true });
  resource.volume?.setVolume(volume);

  const kill = () => {
    try { ytdlp.kill("SIGKILL"); } catch {}
    try { ffmpeg.kill("SIGKILL"); } catch {}
  };

  return { resource, kill };
}

export async function fetchYouTubeTitle(url) {
  return await new Promise((resolve) => {
    const proc = spawn("yt-dlp", ["--get-title", "--no-playlist", url], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const title = stdout.trim();
        resolve(title || null);
      } else {
        resolve(null);
      }
    });

    proc.on("error", () => resolve(null));
  });
}