import { readMinutes, videoSource, type RibbonPost } from "@/lib/content/ribbon";

/** On The Range labels (website RibbonPostCard): a Story is read, a Quick video is watched, a Quick photo is viewed. */
export const cardAction = (post: RibbonPost) => post.format === "story" ? `Read · ${readMinutes(post)} min` : post.coverVideo ? "Watch" : "View";

/** Where a video plays: YouTube opens its page; a file opens as is. null = not a usable video link. */
export function videoLink(url: string): string | null {
  const video = videoSource(url);
  if (!video) return null;
  if (video.kind === "file") return video.src;
  const id = /\/embed\/([^?&/]+)/.exec(video.src)?.[1];
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}
