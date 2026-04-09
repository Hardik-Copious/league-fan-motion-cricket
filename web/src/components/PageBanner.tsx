/** Decorative cricket-themed banner (images in /public/images). */
export type PageBannerVariant =
  | "matches"
  | "standings"
  | "stats"
  | "players"
  | "teams"
  | "games"
  | "auth"
  | "profile";

export default function PageBanner({ variant }: { variant: PageBannerVariant }) {
  return <div className={`page-banner page-banner--${variant}`} aria-hidden />;
}
