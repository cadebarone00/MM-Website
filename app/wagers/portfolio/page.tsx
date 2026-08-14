import { MyWagersList } from "@/components/wagers/MyWagersList";
import { MMCoinsLeaderboard } from "@/components/wagers/MMCoinsLeaderboard";

export default function PortfolioPage() {
  return (
    <div className="flex flex-col gap-8 px-4 pt-5 sm:px-7">
      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">My Wagers</h2>
        <div className="mt-4">
          <MyWagersList />
        </div>
      </section>
      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Standings</h2>
        <div className="mt-4">
          <MMCoinsLeaderboard />
        </div>
      </section>
    </div>
  );
}
