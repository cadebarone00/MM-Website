import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { FeaturedTrip } from "@/lib/content/ribbon";
import { photoProps } from "./RibbonPostCard";
import styles from "../TripPromos.module.css";

/** The Featured trip card exactly as Explore shows it, not tappable (editor preview and approval list). */
export function TripPromosPreview({ trip }: { trip: FeaturedTrip }) {
  return <div className={styles.card} role="img" aria-label={`Preview: featured trip ${trip.city || "untitled"}`} style={{ cursor: "default" }}>
    {trip.image && <Image {...photoProps(trip.image)} alt="" fill sizes="440px" />}
    <span className={styles.city}>{trip.city || "City"}</span>
    <span className={styles.open}>View trip <ArrowRight size={14} aria-hidden="true" /></span>
  </div>;
}
