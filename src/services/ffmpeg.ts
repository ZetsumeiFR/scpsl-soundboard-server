import ffmpeg from "fluent-ffmpeg";
import { existsSync } from "fs";

// Try to import static binaries (may not be available in Docker with --ignore-scripts)
let ffmpegPath: string | null = null;
let ffprobePath: string | null = null;

try {
  const ffmpegStatic = await import("ffmpeg-static");
  const staticPath = ffmpegStatic.default as unknown as string;
  if (staticPath && existsSync(staticPath)) {
    ffmpegPath = staticPath;
  }
} catch {
  // ffmpeg-static not available, will use system ffmpeg
}

try {
  const ffprobeStatic = await import("ffprobe-static");
  if (ffprobeStatic.default?.path && existsSync(ffprobeStatic.default.path)) {
    ffprobePath = ffprobeStatic.default.path;
  }
} catch {
  // ffprobe-static not available, will use system ffprobe
}

// Configure ffmpeg paths (use static binaries if available, otherwise rely on system PATH)
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath) {
  ffmpeg.setFfprobePath(ffprobePath);
}

export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe audio file: ${err.message}`));
        return;
      }

      const duration = metadata.format.duration;
      if (typeof duration !== "number" || isNaN(duration)) {
        reject(new Error("Could not determine audio duration"));
        return;
      }

      resolve(duration);
    });
  });
}

export function convertToOggOpus(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libopus")
      .audioBitrate("64k")
      .audioChannels(2)
      .audioFrequency(48000)
      .format("ogg")
      .on("error", (err) => {
        reject(new Error(`FFmpeg conversion failed: ${err.message}`));
      })
      .on("end", () => {
        resolve();
      })
      .save(outputPath);
  });
}
