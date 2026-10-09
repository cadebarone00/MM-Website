"use client";
import {useEffect,useState} from 'react';
import type {TripAlertScope} from './useTripMomentum';
import styles from './GolfTripNotifications.module.css';
interface Round {id:string;round_number:number;course_name:string|null;momentum_pars:number[]|null}
export function TripMomentumPars({scope}:{scope:TripAlertScope}){
 const [rounds,setRounds]=useState<Round[]>([]),[selected,setSelected]=useState(0),[pars,setPars]=useState<string[]>(Array(18).fill('')),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let cancelled=false;void fetch('/api/golf-trips/'+scope.tripId+'/momentum/pars',{cache:'no-store'}).then(async res=>{const body=await res.json();if(!cancelled&&res.ok)setRounds(body.rounds);}).catch(()=>{});return()=>{cancelled=true;};},[scope.tripId]);
 if(!rounds.length)return null;
 return <details className={styles.category}><summary>Set round pars for birdie alerts</summary><p>Use the course scorecard. Pars lock when scoring starts.</p>
 <select aria-label="Round for birdie alerts" value={selected} onChange={e=>{const i=Number(e.target.value);setSelected(i);setPars(rounds[i-1]?.momentum_pars?.map(String)??Array(18).fill(''));setMessage('');}}><option value={0}>Choose round</option>{rounds.map((r,i)=><option key={r.id} value={i+1}>Round {r.round_number} · {r.course_name??'Course'}</option>)}</select>
 {selected>0&&<><div className={styles.parGrid}>{pars.map((p,i)=><label key={i}>Hole {i+1}<input aria-label={'Par for hole '+(i+1)} type="number" min={3} max={6} inputMode="numeric" value={p} onChange={e=>setPars(current=>current.map((v,h)=>h===i?e.target.value:v))}/></label>)}</div><button className={styles.action} type="button" disabled={busy} onClick={()=>{setBusy(true);void fetch('/api/golf-trips/'+scope.tripId+'/momentum/pars',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({round:rounds[selected-1].round_number,pars:pars.map(Number)})}).then(async res=>{const body=await res.json();setMessage(res.ok?'Round pars saved.':body.error);}).catch(()=>setMessage('Could not save pars.')).finally(()=>setBusy(false));}}>Save round pars</button></>}
 <p role="status">{message}</p></details>;
}
