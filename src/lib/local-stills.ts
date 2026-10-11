import { saveThumb } from "./folder-handles";
import { useCinevo } from "./cinevo-store";

function fileToDataUrl(file: File) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function sidecarImage(file: File, files: File[]) {
  const rel = file.webkitRelativePath || file.name;
  const dir = rel.split("/").slice(0, -1).join("/");
  const stem = file.name.replace(/\.[^.]+$/, "").toLowerCase();
  return files.find((candidate) => {
    if (!/\.(jpe?g|png|webp)$/i.test(candidate.name)) return false;
    const other = candidate.webkitRelativePath || candidate.name;
    if (other.split("/").slice(0, -1).join("/") !== dir) return false;
    const name = candidate.name.toLowerCase();
    return name.startsWith(stem) || /^(poster|cover|folder|thumb|landscape|backdrop)/.test(name);
  });
}

export function captureFileStill(file: File) {
  return new Promise<string | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const finish = (value: string | null) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 5000);
    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      const duration = video.duration;
      video.currentTime = Number.isFinite(duration) && duration > 1 ? Math.min(12, duration * 0.12) : 0.1;
    };
    video.onseeked = () => {
      if (!video.videoWidth) return finish(null);
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 640));
      const ctx = canvas.getContext("2d");
      if (!ctx) return finish(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      finish(canvas.toDataURL("image/jpeg", 0.72));
    };
    video.src = url;
  });
}

export async function enrichLocalStills(titles: { id: string; path?: string }[], files: File[]) {
  const queue = titles;
  let cursor = 0;
  let captures = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const title = queue[cursor];
      cursor += 1;
      const file = files.find((item) => (item.webkitRelativePath || item.name) === title.path);
      if (!file) continue;
      const sidecar = sidecarImage(file, files);
      if (!sidecar && captures >= 80) continue;
      if (!sidecar) captures += 1;
      const url = sidecar ? await fileToDataUrl(sidecar) : await captureFileStill(file);
      if (!url) continue;
      await saveThumb(title.id, url);
      useCinevo.getState().patchArtwork([{ id: title.id, poster: url, still: url }]);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
