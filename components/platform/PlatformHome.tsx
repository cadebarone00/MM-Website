import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Flag, Plus } from "lucide-react";
import { maroonCategories } from "@/lib/data/theMaroon";
import styles from "./PlatformEntry.module.css";

export function PlatformHome() {
  return <main className={styles.home}>
    <h1 className={styles.intro}>The digital home for competitive golf trips.</h1>
    <Link href="/login" className={styles.login}>Log In <ArrowUpRight size={20} aria-hidden="true" /></Link>
    <section className={styles.actions} aria-label="Your tournament">
      <p className={styles.eyebrow}>Your next tradition starts here</p>
      <Link href="/tournaments/new" className={styles.primary}><Plus size={18} aria-hidden="true" />Create Tournament</Link>
      <Link href="/tournaments/join" className={styles.joinLink}><Flag size={18} aria-hidden="true" />Join Tournament</Link>
    </section>
    <section aria-labelledby="feed-heading" className={styles.feed}>
      <div className={styles.sectionHeading}><h2 id="feed-heading">Feed</h2><span>From The Maroon</span></div>
      <p className={styles.feedNote}>Tournament activity is coming later. In the meantime, explore The Maroon.</p>
      {maroonCategories.slice(0, 2).map(category => <article key={category.slug} className={styles.story}>
        <Link href={`/the-maroon/${category.slug}`}>
          <div className={styles.storyImage}><Image src={category.image} alt="" fill sizes="(max-width: 640px) 100vw, 680px" className="object-cover" /></div>
          <div className={styles.storyCopy}><p className={styles.eyebrow}>Explore · {category.label}</p><h3>{category.headline}<ArrowUpRight size={20} aria-hidden="true" /></h3><p>{category.description}</p></div>
        </Link>
      </article>)}
    </section>
    <footer className={styles.footer}><Link href="/tournaments">My Tournaments</Link><Link href="/contact">Contact Us</Link><Link href="/website">The Maroon Tournament</Link></footer>
  </main>;
}
