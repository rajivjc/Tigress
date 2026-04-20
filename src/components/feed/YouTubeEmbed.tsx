import { youTubeEmbedUrl } from "@/lib/youtube";

export function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
      <iframe
        src={youTubeEmbedUrl(videoId)}
        title="YouTube video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}
