import styles from "./MarketingWebsite.module.css";

/** V1's text wordmark, restyled locally without its global utility classes. */
export function WebsiteBrand() {
  return <a className={styles.brand} href="#top" aria-label="The Maroon home">
    <span className={styles.wordmark}>The Maroon</span>
    <span className={styles.brandSub}>FOR THE LOVE OF THE GAME</span>
  </a>;
}
