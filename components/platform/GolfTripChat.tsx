"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, MessageCircle, Pin, Search, Send, Users, X } from "lucide-react";
import styles from "./GolfTripChat.module.css";

type Message = { id: number; text: string; createdAt: number; incoming?: boolean; author?: string };
type Thread = { id: string; name: string; messages: Message[] };
const TRIP = "trip";
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]).join("");

/** Memory-only trip messaging layout. No delivery, storage or read-receipt service. */
export function GolfTripChat({ open, onClose, members, tripName }: {
  open: boolean; onClose: () => void; members: string[]; tripName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<Thread[]>([{ id: TRIP, name: "Trip Chat", messages: [] }]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const active = threads.find(thread => thread.id === selected);
  const draft = selected ? drafts[selected] ?? "" : "";

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [active?.messages.length, selected, open]);

  function close() { setSelected(null); setQuery(""); onClose(); }
  function start(name: string) {
    const id = `member:${name}`;
    setThreads(previous => previous.some(thread => thread.id === id) ? previous : [...previous, { id, name, messages: [] }]);
    setSelected(id); setQuery("");
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selected) return;
    const now = Date.now();
    setThreads(previous => previous.map(thread => thread.id === selected
      ? { ...thread, messages: [...thread.messages, { id: now, text, createdAt: now }] } : thread));
    setDrafts(previous => ({ ...previous, [selected]: "" }));
  }
  const searchMembers = [...new Set(members)].filter(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  // Empty direct conversations are only shown after searching, until there is a message.
  const inbox = [threads[0], ...threads.slice(1).filter(thread => thread.messages.length > 0)
    .sort((a, b) => b.messages.at(-1)!.createdAt - a.messages.at(-1)!.createdAt)];

  return <dialog ref={dialog} className={styles.dialog} aria-label="Trip messages" onCancel={close}>
    <div className={styles.layout}>
      <header className={styles.header}>
        {active && <button type="button" className={styles.iconButton} aria-label="Back to chats" onClick={() => setSelected(null)}><ArrowLeft size={22} /></button>}
        <div className={styles.heading}><h2>{tripName}</h2></div>
        <button type="button" className={styles.iconButton} aria-label="Close chats" onClick={close}><X size={22} /></button>
      </header>
      <div className={styles.chatHeading}>
        {active && <span className={`${styles.avatar} ${active.id === TRIP ? styles.groupAvatar : ""}`}>{active.id === TRIP ? <Users size={22} /> : initials(active.name)}</span>}
        <h3>{active?.name ?? "Chats"}</h3>
      </div>
      {active ? <>
        <div className={styles.messages} role="log" aria-label={`${active.name} messages`} aria-live="polite">
          {active.messages.length === 0 && <div className={styles.welcome}><span className={styles.welcomeIcon}><MessageCircle size={28} /></span><h3>{active.id === TRIP ? "Everyone. One conversation." : `Say hello to ${active.name.split(" ")[0]}.`}</h3><p>{active.id === TRIP ? "Tee times, dinner plans, and everything in between." : "Start your conversation with a message below."}</p></div>}
          {active.messages.map((message, index) => {
            const day = new Date(message.createdAt).toLocaleDateString();
            const previousDay = index ? new Date(active.messages[index - 1].createdAt).toLocaleDateString() : "";
            return <div key={`${message.id}-${index}`}>
              {day !== previousDay && <div className={styles.date}><span>{day === new Date().toLocaleDateString() ? "Today" : day}</span></div>}
              <div className={`${styles.messageRow} ${message.incoming ? styles.incoming : styles.outgoing}`}><div className={styles.bubble}>
                {message.incoming && message.author && <strong className={styles.author}>{message.author}</strong>}
                <span>{message.text}</span><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
              </div></div>
            </div>;
          })}
          <div ref={end} />
        </div>
        <form className={styles.composer} onSubmit={send}>
          <input aria-label="Message" placeholder="Message" maxLength={4000} value={draft} onChange={event => setDrafts(previous => ({ ...previous, [active.id]: event.target.value }))} autoComplete="off" />
          <button type="submit" className={styles.send} aria-label="Send message" disabled={!draft.trim()}><Send size={20} /></button>
        </form>
      </> : <div className={styles.inbox}>
        <label className={styles.search}><Search size={18} aria-hidden /><input type="search" aria-label="Find someone in your group" placeholder="Find someone in your group" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className={styles.columnLabels}><span>Conversation</span><span>Messages</span></div>
        {inbox.map((thread, index) => <button type="button" key={thread.id} className={`${styles.thread} ${thread.id === TRIP ? styles.pinned : ""}`} onClick={() => setSelected(thread.id)}>
          <span className={styles.rank}>{thread.id === TRIP ? <Pin size={16} aria-label="Pinned" /> : String(index).padStart(2, "0")}</span>
          <span className={`${styles.avatar} ${thread.id === TRIP ? styles.groupAvatar : ""}`}>{thread.id === TRIP ? <Users size={20} /> : initials(thread.name)}</span>
          <span className={styles.threadText}><strong>{thread.name}</strong><span>{thread.messages.at(-1)?.text ?? "Your whole group, together"}</span></span>
          <ChevronRight size={18} aria-hidden />
        </button>)}
        {query.trim() ? <section className={styles.results} aria-label="Group members"><h3>In your group</h3>{searchMembers.map(name => <button type="button" className={styles.thread} key={name} onClick={() => start(name)}><span className={styles.avatar}>{initials(name)}</span><span className={styles.threadText}><strong>{name}</strong><span>Start a conversation</span></span><MessageCircle size={18} aria-hidden /></button>)}{!searchMembers.length && <p className={styles.empty}>No group members match “{query}”.</p>}</section>
          : inbox.length === 1 && <div className={styles.empty}><MessageCircle size={25} aria-hidden /><p>Your conversations will appear here.</p><span>Find someone in your group to start a chat.</span></div>}
      </div>}
    </div>
  </dialog>;
}
