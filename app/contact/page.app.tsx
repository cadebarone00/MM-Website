import styles from "@/components/app/App.module.css";

/** App → Contact: the website's support (the website's /contact goes to its support section). */
export default function AppContact() {
  return <main className={styles.center}>
    <h1 className={styles.title}>Support</h1>
    <p className={styles.text}>Questions or problems? We&apos;re happy to help.</p>
    <a className={styles.primary} href="mailto:themaroonadmin@gmail.com">Email themaroonadmin@gmail.com</a>
    <a className={styles.secondary} href="https://themaroon.site/website#support" target="_blank" rel="noreferrer">Open support on the website</a>
  </main>;
}
