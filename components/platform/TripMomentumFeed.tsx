"use client";
import { useState } from 'react';
import { Bell, Flag, TrendingUp } from 'lucide-react';
import type { MomentumEvent } from '@/lib/platform/tripPush';
import styles from './TripMomentumFeed.module.css';
export function TripMomentumFeed({events,loading,error,onAlerts}:{events:MomentumEvent[];loading:boolean;error:string;onAlerts:()=>void}) {
 const [filter,setFilter]=useState<'all'|'milestone'>('all');
 const shown=filter==='all'?events:events.filter(e=>e.kind==='milestone');
 return <section id="momentum" className={styles.feed} aria-label="Round momentum">
  <div className={styles.heading}><div><p className={styles.eyebrow}>Around the round</p><h2><TrendingUp size={20} aria-hidden />Momentum</h2></div>
   <button type="button" onClick={onAlerts} aria-label="Set up round push alerts"><Bell size={18} aria-hidden />Alerts</button></div>
  <div className={styles.filters} aria-label="Momentum filters">{(['all','milestone'] as const).map(value=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==='all'?'All updates':'Big moments'}</button>)}</div>
  <p className={styles.status} role="status">{error || (loading?'Loading round updates…':events.length?'Latest saved round updates':'The round starts here. Scores and big moments will land as they happen.')}</p>
  <ol className={styles.list}>{shown.map(event=><li key={event.id}><span className={styles.symbol} aria-hidden>{event.kind==='milestone'?<Flag size={18}/>:<TrendingUp size={18}/>}</span><div><h3>{event.title}</h3><p>{event.detail}</p><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div></li>)}</ol>
  {!loading && !error && filter==='milestone' && events.length>0 && !shown.length && <p className={styles.status}>No big moments yet. Keep an eye on the round.</p>}
 </section>;
}
