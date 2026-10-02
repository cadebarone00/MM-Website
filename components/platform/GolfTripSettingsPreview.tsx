import Link from "next/link";
import styles from "./GolfTripSettingsPreview.module.css";

/** Static screenshot-inspired surface for the dev preview's settings wheel. */
export function GolfTripSettingsPreview() {
  return <main className={styles.page} aria-label="Settings preview">
    <div className={styles.tabs}><span className={styles.current}>Current</span><span>Sessions</span><span>Issues</span><span>Pull requests</span><span>Gists</span></div>
    <section className={styles.intro}>
      <div className={styles.identity}>
        <div className={styles.robot} aria-hidden><div><i /><i /></div><b>▮▮▮</b></div>
        <p>Copilot v1.0.91 uses AI.<br />Check for mistakes.</p>
      </div>
      <div className={styles.gettingStarted}><strong>Getting started</strong><br />Use the tabs above to explore your sessions and pull requests<br />
        <b>/init</b> – Initialize Copilot instructions for this repository<br /><b>/model</b> – Switch models across providers, or use Auto</div>
    </section>
    <div className={styles.messages}>
      <p><span className={styles.bullet}>●</span> Tip: /app<br /><span className={styles.indent}>└ Prefer a visual workspace? Try out the GitHub Copilot desktop app<br />
        <span className={styles.url}>https://github.com/features/ai/github-app</span></span></p>
      <p><span className={styles.bullet}>●</span> MCP Servers reloaded: 1 server connected</p>
    </div>
    <div className={styles.bottom}>
      <div className={styles.session}><span>~\Documents\GitHub\MM-Website [⎇main*]</span><span>Session: 0 AIC used</span></div>
      <div className={styles.prompt} aria-hidden><span /></div>
      <footer><div><Link href="/dev/tournament">← open sidebar</Link> · <b>Interactive</b> · <b>Manual Approval</b> · / commands · ? help · tab next tab</div><span>Auto</span></footer>
    </div>
  </main>;
}
