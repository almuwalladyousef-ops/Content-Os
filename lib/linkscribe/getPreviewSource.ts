export type PreviewSource =
  | {
      kind: "embed";
      src: string;
      label: string;
      aspect: "landscape" | "portrait";
    }
  | {
      kind: "video";
      src: string;
      label: string;
      aspect: "landscape" | "portrait";
    }
  | {
      kind: "unavailable";
      label: string;
    };

const directVideoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);

export function getPreviewSource(value: string): PreviewSource {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return unavailablePreview();
  }

  const youtubeId = getYouTubeId(url);
  if (youtubeId) {
    return {
      kind: "embed",
      src: `https://www.youtube.com/embed/${youtubeId}`,
      label: "YouTube preview",
      aspect: "landscape",
    };
  }

  const instagramPath = getInstagramEmbedPath(url);
  if (instagramPath) {
    return {
      kind: "embed",
      src: `https://www.instagram.com${instagramPath}/embed`,
      label: "Instagram preview",
      aspect: "portrait",
    };
  }

  const tiktokId = getTikTokId(url);
  if (tiktokId) {
    return {
      kind: "embed",
      src: `https://www.tiktok.com/embed/v2/${tiktokId}`,
      label: "TikTok preview",
      aspect: "portrait",
    };
  }

  if (isDirectVideoUrl(url)) {
    return {
      kind: "video",
      src: url.toString(),
      label: "Direct video preview",
      aspect: "landscape",
    };
  }

  return unavailablePreview();
}

function getYouTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      return url.searchParams.get("v");
    }

    const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) {
      return shortsMatch[1];
    }

    const embedMatch = url.pathname.match(/^\/embed\/([^/?#]+)/);
    if (embedMatch) {
      return embedMatch[1];
    }
  }

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id || null;
  }

  return null;
}

function getInstagramEmbedPath(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "instagram.com") {
    return null;
  }

  const match = url.pathname.match(/^\/(p|reel|tv)\/([^/?#]+)/);
  if (!match) {
    return null;
  }

  return `/${match[1]}/${match[2]}`;
}

function getTikTokId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "tiktok.com" && host !== "vm.tiktok.com") {
    return null;
  }

  const match = url.pathname.match(/\/video\/(\d+)/);
  return match?.[1] ?? null;
}

function isDirectVideoUrl(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  return Array.from(directVideoExtensions).some((extension) => pathname.endsWith(extension));
}

function unavailablePreview(): PreviewSource {
  return {
    kind: "unavailable",
    label: "Preview unavailable",
  };
}
