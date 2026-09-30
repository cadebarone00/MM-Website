import "@/components/platform/tournament-site/tournament-site.css";

/** Customer tournament sites use the public UI kit's own header, nav and footer (no Maroon chrome). */
export default function PublicTournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
