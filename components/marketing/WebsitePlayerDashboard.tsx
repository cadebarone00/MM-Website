import { ArrowLeft, Flag, MapPin, Trophy } from "lucide-react";
import { playerDashboardFixture as data } from "./playerDashboardFixture";
import styles from "./WebsitePlayerDashboard.module.css";

const sections = [["overview", "Overview"], ["performance", "Performance"], ["rounds", "Round history"], ["trips", "Golf Trips"], ["tournaments", "Tournaments"], ["account", "Account settings"]] as const;

/** Website-specific development composition. Intentionally never reads the current session. */
export function WebsitePlayerDashboard() {
  return <div className={styles.dashboard}>
    <a href="#dashboard-main" className={styles.skip}>Skip to dashboard</a>
    <header className={styles.header}><a href="/dev-website" className={styles.brand}>The Maroon<span>FOR THE LOVE OF THE GAME</span></a><a className={styles.return} href="/dev-website"><ArrowLeft size={15} aria-hidden="true" /> Back to website</a></header>
    <div className={styles.workspace}>
      <aside className={styles.sidebar}><p className={styles.eyebrow}>YOUR CLUBHOUSE</p><nav aria-label="Player dashboard">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav><div className={styles.sidebarNote}><Flag size={20} aria-hidden="true" /><p>For the rounds.<br />And everything around them.</p></div></aside>
      <main id="dashboard-main" className={styles.main}>
        <section id="overview" className={styles.welcome} aria-labelledby="dashboard-title"><div><p className={styles.eyebrow}>PLAYER DASHBOARD</p><h1 id="dashboard-title">Your game.<br /><em>Your story.</em></h1><p className={styles.intro}>A home for the golf you play and the people you play it with.</p></div><div className={styles.member}><span className={styles.avatar}>{data.player.initials}</span><div><h2>{data.player.name}</h2><p>@{data.player.username}</p><span>MEMBER SINCE {data.player.since}</span></div></div></section>
        <section className={styles.profile} aria-labelledby="profile-summary"><div><h2 id="profile-summary">Profile summary</h2><p>{data.player.bio}</p></div><span><MapPin size={15} aria-hidden="true" />{data.player.home}</span></section>
        <section id="performance" className={styles.section} aria-labelledby="performance-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>THE LONG GAME</p><h2 id="performance-title">Handicap &amp; performance</h2></div><span>18-HOLE GOLF</span></div><dl className={styles.stats}>{data.stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd><p>{stat.detail}</p></div>)}</dl></section>
        <section id="rounds" className={styles.section} aria-labelledby="rounds-title"><div className={styles.sectionHeading}><h2 id="rounds-title">Round history</h2><span>RECENT ROUNDS</span></div><div className={styles.tableWrap}><table><caption className={styles.srOnly}>Recent rounds and gross scores</caption><thead><tr><th scope="col">Course / round</th><th scope="col">Date</th><th scope="col">Gross</th><th scope="col">To par</th></tr></thead><tbody>{data.rounds.map(round => <tr key={round.date}><th scope="row">{round.course}<small>{round.context}</small></th><td>{round.date}</td><td className={styles.score}>{round.score}</td><td>{round.par}</td></tr>)}</tbody></table></div></section>
        <section id="trips" className={styles.section} aria-labelledby="trips-title"><div className={styles.sectionHeading}><h2 id="trips-title">Your Golf Trips</h2><span>THE PEOPLE. THE PLACES.</span></div><div className={styles.tripGrid}>{data.trips.map(trip => <article className={styles.trip} key={trip.name}><div className={styles.tripTop}><Flag size={20} aria-hidden="true" /><span>{trip.status}</span></div><h3>{trip.name}</h3><p>{trip.destination}</p><div className={styles.tripMeta}><strong>{trip.date}</strong><span>{trip.detail}</span></div></article>)}</div></section>
        <section id="tournaments" className={styles.section} aria-labelledby="tournaments-title"><div className={styles.sectionHeading}><h2 id="tournaments-title">Tournament history &amp; results</h2><Trophy size={20} aria-hidden="true" /></div><div className={styles.tournaments}>{data.tournaments.map(event => <article key={event.name}><span className={styles.year}>{event.year}</span><div><h3>{event.name}</h3><p>{event.team} · {event.detail}</p></div><strong>{event.result}</strong></article>)}</div></section>
        <section id="account" className={styles.section} aria-labelledby="account-title"><div className={styles.sectionHeading}><h2 id="account-title">Account settings</h2><span>YOUR PREFERENCES</span></div><dl className={styles.settings}><div><dt>Profile &amp; rounds visibility</dt><dd>Private</dd></div><div><dt>Account method</dt><dd>Email &amp; password</dd></div><div><dt>Display name</dt><dd>{data.player.name}</dd></div></dl></section>
        <footer className={styles.footer}>THE MAROON <span>HERE&apos;S TO THE NEXT ROUND.</span></footer>
      </main>
    </div>
  </div>;
}
