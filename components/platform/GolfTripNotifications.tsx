"use client";
import { TripMomentumPars } from "./TripMomentumPars";

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { TripAlertScope } from './useTripMomentum';
import toggleStyles from './GolfTripCompetition.module.css';
import styles from './GolfTripNotifications.module.css';
const subscribeCapabilities=()=>()=>{};
const pushCapabilities=()=>window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const serverCapabilities=()=>false;
type Preferences={scores:boolean;milestones:boolean};
export function GolfTripNotifications({scope}:{scope?:TripAlertScope}) {
 const [prefs,setPrefs]=useState<Preferences|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[ready,setReady]=useState(false);
 const supported=useSyncExternalStore(subscribeCapabilities,pushCapabilities,serverCapabilities);
 const tripId=scope?.tripId,profileId=scope?.profileId;
 const [publicKey,setPublicKey]=useState('');
 useEffect(()=>{
  let cancelled=false;
  if(!tripId||!supported) return;
  void (async()=>{try{
   const worker=await navigator.serviceWorker.getRegistration('/');const sub=await worker?.pushManager.getSubscription();
   const res=await fetch('/api/golf-trips/'+tripId+'/push?endpoint='+encodeURIComponent(sub?.endpoint??''),{cache:'no-store'});const body=await res.json();
   if(!res.ok) throw new Error(body.error);
   if(!cancelled){setReady(body.configured);setPublicKey(body.publicKey??'');setPrefs(Notification.permission==='granted'?body.preferences:null);if(!body.configured)setMessage('Push alerts are not available yet.');}
  }catch{if(!cancelled)setMessage('Could not load alert settings. Try reopening this panel.');}})();
  return()=>{cancelled=true;};
 },[tripId,profileId,supported]);
 async function save(next:Preferences|null){
  if(!scope||busy)return;setBusy(true);setMessage('');
  let created:PushSubscription|null=null;
  try{
   if(!next){
    const worker=await navigator.serviceWorker.getRegistration('/');const sub=await worker?.pushManager.getSubscription();
    if(sub){const res=await fetch('/api/golf-trips/'+scope.tripId+'/push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})});if(!res.ok)throw new Error('Could not turn alerts off. Try again.');}
    setPrefs(null);setMessage('Alerts for this trip are off on this device.');return;
   }
   // Permission is requested only in response to this button press.
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw new Error(permission==='denied'?'Notifications are blocked. Allow them in your device or browser settings.':'Notifications were not enabled.');
   const worker=await navigator.serviceWorker.register('/trip-push-sw.js',{scope:'/'});
   if(!worker.active)await new Promise<void>((resolve,reject)=>{const active=worker.installing??worker.waiting;if(!active){reject(new Error('Could not start notifications.'));return;}const timer=window.setTimeout(()=>reject(new Error('Notifications took too long to start. Try again.')),15000);active.addEventListener('statechange',()=>{if(active.state==='activated'){window.clearTimeout(timer);resolve();}if(active.state==='redundant'){window.clearTimeout(timer);reject(new Error('Could not start notifications.'));}});});
   let sub=await worker.pushManager.getSubscription();
   if(!sub){const binary=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(binary,c=>c.charCodeAt(0));sub=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});created=sub;}
   const res=await fetch('/api/golf-trips/'+scope.tripId+'/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:sub.toJSON(),...next})});const body=await res.json();
   if(!res.ok)throw new Error(body.error??'Could not enable alerts.');setPrefs(next);setMessage('Alert preferences saved for this device.');
  }catch(e){if(created)await created.unsubscribe().catch(()=>false);setMessage(e instanceof Error?e.message:'Could not save alerts. Try again.');}
  finally{setBusy(false);}
 }
 return <div className={styles.notifications}><h2 className={styles.title}>Round alerts</h2>
  <p>Keep up with your round, even when the app is closed. Alerts open the momentum feed.</p>
  <p>Big-play alerts show the golfer’s name and the cause on your lock screen.</p>
  <button type="button" className={styles.action} disabled={!scope||!supported||!ready||busy} onClick={()=>void save(prefs?null:{scores:false,milestones:true})}>{busy?'Saving…':prefs?'Turn off push alerts':'Enable push alerts'}</button>
  {prefs && <section className={styles.category} aria-label="Round alert preferences">{([{key:'milestones',label:'Big moments'},{key:'scores',label:'Every score update'}] as const).map(item=><div className={styles.row} key={item.key}><span className={styles.label}>{item.label}</span><button type="button" role="switch" disabled={busy} aria-checked={prefs[item.key]} aria-label={item.label} className={toggleStyles.toggle} onClick={()=>void save({...prefs,[item.key]:!prefs[item.key]})}><span className={toggleStyles.track} data-on={prefs[item.key]}><span className={toggleStyles.thumb}/></span><span>{prefs[item.key]?'On':'Off'}</span></button></div>)}</section>}
  {scope?.isOrganizer && <TripMomentumPars scope={scope} />}
  <p role="status">{message || (scope&&!supported?'To receive alerts on iPhone or iPad, add The Maroon to your Home Screen and open it there. Use a supported browser on other devices.':!scope?'Open a saved trip to set up round alerts.':'Big moments: attested holes in one, 2–4 consecutive birdies and matches won before hole 16. Score updates include corrections.')}</p>
 </div>;
}
