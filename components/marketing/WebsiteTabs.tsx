import Link from "next/link";
import type { ReactNode } from "react";
import { FAQ, FEATURES, GAME_RULES, SIDE_GAMES, TUTORIALS } from "./websiteContent";
import { GetTheApp, PageIntro, SectionHeading, WebsiteShell } from "./WebsiteShell";
import styles from "./MarketingWebsite.module.css";

/** Features: each part of the app, what it does. */
export function WebsiteFeatures({ accountActions }: { accountActions?: ReactNode }) {
  return <WebsiteShell active="Features" accountActions={accountActions}>
    <PageIntro label="FEATURES" title={<>Everything your crew needs.<br /><em>All in one app.</em></>} copy="Plan the trip, play the round, follow it live and keep it for good." />
    <section className={styles.section}>
      <div className={styles.featureList}>{FEATURES.map((f, i) => <article key={f.id} id={f.id} className={styles.featureRow}>
        <span className={styles.stepNumber}>0{i + 1}</span>
        <div><h2>{f.title}</h2><p className={styles.lead}>{f.lead}</p></div>
        <ul className={styles.checkList}>{f.points.map((point) => <li key={point}>{point}</li>)}</ul>
      </article>)}</div>
    </section>
    <GetTheApp />
  </WebsiteShell>;
}

/** Tutorials: how to do each thing in the app, step by step. */
export function WebsiteTutorials({ accountActions }: { accountActions?: ReactNode }) {
  return <WebsiteShell active="Tutorials" accountActions={accountActions}>
    <PageIntro label="TUTORIALS" title={<>Learn it once.<br /><em>Use it every trip.</em></>} copy="Short, step-by-step guides for the things you'll do in The Maroon." />
    <section className={styles.section}>
      <nav className={styles.chipNav} aria-label="Tutorials">{TUTORIALS.map((t) => <a key={t.id} href={`#${t.id}`}>{t.title}</a>)}</nav>
      <div className={styles.tutorialGrid}>{TUTORIALS.map((t) => <article key={t.id} id={t.id} className={styles.tutorial}>
        <p className={styles.eyebrow}>{t.time} · IN THE APP</p>
        <h2>{t.title}</h2>
        <ol>{t.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      </article>)}</div>
    </section>
    <GetTheApp copy="Try it on your next round." />
  </WebsiteShell>;
}

/** Games: the rule book for every game in Play a round, plus side games. */
export function WebsiteGames({ accountActions }: { accountActions?: ReactNode }) {
  const kinds = ["Points", "Match & stroke", "Team format"] as const;
  return <WebsiteShell active="Games" accountActions={accountActions}>
    <PageIntro label="THE RULE BOOK" title={<>17 games.<br /><em>One for every group.</em></>} copy="How each game works, who it's for, and a quick example. The app keeps the score for you." />
    {kinds.map((kind) => <section key={kind} className={styles.section}>
      <SectionHeading label={kind === "Team format" ? "TEAM FORMATS · DON'T COUNT TOWARD HANDICAP" : kind.toUpperCase()} title={kind === "Points" ? "Points games" : kind === "Match & stroke" ? "Match & stroke play" : "Team formats"} />
      <div className={styles.featureGrid}>{GAME_RULES.filter((g) => g.kind === kind).map((g) => <article key={g.name} className={styles.feature}>
        <div className={styles.featureTop}><span>{g.players} PLAYERS</span></div>
        <h3>{g.name}</h3><p>{g.how}</p><p className={styles.example}>e.g. {g.example}</p>
      </article>)}</div>
    </section>)}
    <section className={styles.how}>
      <SectionHeading label="ON TOP OF ANY GAME" title="Side games" />
      <div className={styles.steps}>{SIDE_GAMES.map((g, i) => <article key={g.name}><span className={styles.stepNumber}>0{i + 1}</span><h3>{g.name}</h3><p>{g.how}</p></article>)}</div>
    </section>
    <GetTheApp copy="Pick a game for Saturday." />
  </WebsiteShell>;
}

/** Help: questions and answers, contact, legal. */
export function WebsiteHelp({ accountActions }: { accountActions?: ReactNode }) {
  return <WebsiteShell active="Help" accountActions={accountActions}>
    <PageIntro label="HELP" title={<>Here for the<br /><em>next round.</em></>} copy="Answers to the questions we hear most." />
    <section className={styles.section}>
      <SectionHeading label="FREQUENTLY ASKED" title="Questions & answers" />
      <div className={styles.faq}>{FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
    </section>
    <section className={styles.how}>
      <SectionHeading label="STILL STUCK?" title="Get in touch" />
      <div className={styles.steps}>
        <article><h3>Contact us</h3><p>Questions, feedback or a problem with your account.</p><p><Link className={styles.textLink} href="/contact">Send us a message →</Link></p></article>
        <article><h3>Learn the app</h3><p>Step-by-step guides for trips, rounds and games.</p><p><Link className={styles.textLink} href="/website/tutorials">See tutorials →</Link></p></article>
        <article><h3>Terms of Service</h3><p>Coming soon.</p></article>
        <article><h3>Privacy Policy</h3><p>Coming soon.</p></article>
      </div>
    </section>
  </WebsiteShell>;
}
