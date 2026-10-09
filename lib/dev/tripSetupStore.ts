"use client";
import { useSyncExternalStore } from 'react';
import type { SimulatorConfig } from './simulator';
const PREFIX='maroon-dev-trip-setup-v1:';
const cache=new Map<string,Record<string,unknown>>();
const listeners=new Map<string,Set<()=>void>>();
const EMPTY:Record<string,unknown>={};
const encode=(_key:string,value:unknown)=>value instanceof Set?{$set:[...value]}:value;
const decode=(_key:string,value:unknown)=>value&&typeof value==='object'&&Array.isArray((value as {$set?:unknown}).$set)?new Set((value as {$set:unknown[]}).$set):value;
export function devTripScope(config:SimulatorConfig,variant='maroon') {
 return config.source==='maroon'?'dev-'+variant:'dev-'+config.source+':'+(config.state.seed??0)+':'+(config.state.playerCount??'default')+':'+(config.state.competitionSetup??'default');
}
export function readDevSetup(scope:string):Record<string,unknown> {
 if(typeof window==='undefined')return EMPTY;
 if(!cache.has(scope)){try{cache.set(scope,JSON.parse(localStorage.getItem(PREFIX+scope)??'{}',decode));}catch{cache.set(scope,{});}}
 return cache.get(scope)!;
}
export function writeDevSetup(scope:string,field:string,value:unknown) {
 const next={...readDevSetup(scope),[field]:value};cache.set(scope,next);
 try{localStorage.setItem(PREFIX+scope,JSON.stringify(next,encode));}catch{/* Keep this tab's state when storage is unavailable. */}
 // Subscribers read the new immutable snapshot after the current React event/update.
 queueMicrotask(()=>listeners.get(scope)?.forEach(listener=>listener()));
}
export function useDevSetup(scope:string) {
 return useSyncExternalStore(listener=>{
  const set=listeners.get(scope)??new Set();listeners.set(scope,set);set.add(listener);
  const changed=(event:StorageEvent)=>{if(event.key===PREFIX+scope||event.key===null){cache.delete(scope);listener();}};
  window.addEventListener('storage',changed);
  return()=>{set.delete(listener);window.removeEventListener('storage',changed);};
 },()=>readDevSetup(scope),()=>EMPTY);
}
