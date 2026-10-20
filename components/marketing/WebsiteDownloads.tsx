import { Smartphone } from "lucide-react";
import styles from "./MarketingWebsite.module.css";

export function WebsiteDownloads() {
  return <div className={styles.storeRow}>{["iOS", "Android"].map(platform =>
    <div className={styles.store} key={platform}>
      <Smartphone size={23} aria-hidden="true" />
      <span><small>COMING SOON</small><strong>{platform}</strong></span>
    </div>,
  )}</div>;
}
