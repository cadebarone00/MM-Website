"use client";
import { useEffect, useRef, useState } from 'react';
import { tripTitleLines } from '@/lib/platform/tripTitle';
import styles from './GolfTripHome.module.css';
export function GolfTripTitle({name}:{name:string}) {
 const title=useRef<HTMLHeadingElement>(null);
 const [layout,setLayout]=useState<{name:string;lines:string[]|null}>({name:'',lines:null});
 useEffect(()=>{
  const element=title.current;if(!element)return;
  let stopped=false;
  const measure=document.createElement('span');
  Object.assign(measure.style,{position:'fixed',visibility:'hidden',whiteSpace:'pre',pointerEvents:'none'});
  document.body.appendChild(measure);
  function update(){
   if(stopped)return;
   const font=getComputedStyle(element!);measure.style.font=font.font;measure.style.letterSpacing=font.letterSpacing;
   const lines=tripTitleLines(name,element!.clientWidth,text=>{measure.textContent=text;return measure.getBoundingClientRect().width;});
   setLayout(previous=>previous.name===name && JSON.stringify(previous.lines)===JSON.stringify(lines)?previous:{name,lines});
  }
  const observer=new ResizeObserver(update);observer.observe(element);
  void document.fonts.ready.then(update);
  return()=>{stopped=true;observer.disconnect();measure.remove();};
 },[name]);
 const lines=layout.name===name?layout.lines:null;
 return <h1 ref={title} className={styles.title} aria-label={name}>{lines?lines.map((line,index)=><span className={styles.titleLine} key={index}>{line}</span>):name}</h1>;
}
