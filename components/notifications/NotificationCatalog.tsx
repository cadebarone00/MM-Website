"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { NOTIFICATION_CATALOG, NOTIFICATION_SWITCHES, type CatalogEntry, type NotificationKind, type NotificationSwitch } from "@/lib/notifications/catalog";
import { sampleNotesForType, sampleSheetSource, sampleWordings, sheetCounts } from "@/lib/dev/sampleNotificationTypes";
import type { NotificationWording } from "@/lib/dev/sampleNotifications";
import { KindIcon, NotificationSurfaces } from "./NotificationPreviews";
import styles from "./NotificationCatalog.module.css";

const SURFACE_LABEL = { phone: "Phone", bell: "Bell", banner: "Banner" } as const;
/** Settings switches in Settings order, then "Always on". */
const GROUPS: { id: NotificationSwitch | null; label: string }[] = [...NOTIFICATION_SWITCHES.map(({ id, label }) => ({ id, label })), { id: null, label: "Always on" }];

/**
 * DEV ONLY: /dev/notifications/types — every notification type in the master list (lib/notifications/catalog.ts), grouped
 * by its Settings switch. Tap a type to see its three wordings and how it looks on each surface. The simulator's "Type"
 * opens that one first; "Wording" picks the version shown.
 */
export function NotificationCatalog() {
  const simulator = useSimulator();
  const chosen = simulator?.state.notificationType;
  const [open, setOpen] = useState<NotificationKind | null>(chosen && chosen !== "mixed" ? chosen : null);
  const approved = NOTIFICATION_CATALOG.filter(entry => entry.approved).length;
  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>Notifications</p>
      <h1>All types</h1>
      <p className={styles.summary}>{NOTIFICATION_CATALOG.length} types · {NOTIFICATION_SWITCHES.length} Settings switches · {approved} approved</p>
    </header>
    {GROUPS.map(group => {
      const entries = NOTIFICATION_CATALOG.filter(entry => entry.switch === group.id);
      if (!entries.length) return null;
      return <section key={group.label} className={styles.group} aria-label={group.label}>
        <h2 className={styles.groupTitle}>{group.label}</h2>
        {entries.map(entry => <TypeCard key={entry.kind} entry={entry} open={open === entry.kind} wording={simulator?.state.notificationWording ?? 1}
          onToggle={() => setOpen(current => current === entry.kind ? null : entry.kind)} />)}
      </section>;
    })}
  </main>;
}

function TypeCard({ entry, open, wording: initialWording, onToggle }: { entry: CatalogEntry; open: boolean; wording: NotificationWording; onToggle: () => void }) {
  const kind = entry.kind as NotificationKind;
  const [wording, setWording] = useState<NotificationWording>(initialWording);
  const versions = sampleWordings(kind);
  const sheet = entry.wording ? null : sheetCounts(kind);
  const note = sampleNotesForType(kind, wording)[0];
  return <article className={`${styles.card} ${open ? styles.cardOpen : ""}`}>
    <button type="button" className={styles.cardHead} aria-expanded={open} onClick={onToggle}>
      <span className={styles.icon}><KindIcon kind={kind} /></span>
      <span className={styles.name}>{entry.name}</span>
      <span className={entry.approved ? styles.approved : styles.notApproved}>{entry.approved ? "Approved" : "Not approved"}</span>
      <ChevronDown size={18} className={styles.chevron} aria-hidden />
    </button>
    {open && <div className={styles.body}>
      <dl className={styles.facts}>
        <dt>Who</dt><dd>{entry.audience}</dd>
        <dt>When</dt><dd>{entry.trigger}</dd>
        <dt>Opens</dt><dd><code>{entry.link}</code></dd>
        <dt>Shows on</dt><dd>{entry.surfaces.map(surface => SURFACE_LABEL[surface]).join(" · ")}</dd>
        {sheet && <><dt>Wording</dt><dd>Highlights sheet ({entry.sheetCategories?.join(", ")}): {sheet.rules} rules · {sheet.wordings} wordings. Shown: {sampleSheetSource(kind)}</dd></>}
      </dl>
      {entry.note && <p className={styles.note}>{entry.note}</p>}
      <p className={styles.note}>{entry.wording ? "Sent at random, never the same version twice in a row to the same person." : "Picked at random from the sheet's wordings for each rule."}</p>
      <div className={styles.versions} role="radiogroup" aria-label="Wording version">
        {versions.map((version, index) => {
          const number = (index + 1) as NotificationWording;
          return <button key={number} type="button" role="radio" aria-checked={wording === number} className={styles.version} onClick={() => setWording(number)}>
            <span className={styles.versionTag}>V{number}</span>
            <span><b>{version.title}</b><span>{version.body}</span></span>
          </button>;
        })}
      </div>
      {note && <NotificationSurfaces note={note} surfaces={entry.surfaces} />}
    </div>}
  </article>;
}
