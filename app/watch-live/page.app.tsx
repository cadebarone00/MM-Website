import styles from "@/components/app/App.module.css";

/** App → Watch live: the live broadcast is on the website's Tap In screen (built for TVs), so it opens in the browser. */
export default function AppWatchLive() {
  return <main className={styles.center}>
    <h1 className={styles.title}>Watch live</h1>
    <p className={styles.text}>The live broadcast is made for a big screen. Open it in your browser, or cast it to your TV.</p>
    <a className={styles.primary} href="https://themaroon.site/tap-in" target="_blank" rel="noreferrer">Open the broadcast</a>
  </main>;
}
