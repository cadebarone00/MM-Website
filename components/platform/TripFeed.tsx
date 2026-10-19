"use client";
/* eslint-disable @next/next/no-img-element -- Device-selected blob URLs require native image previews. */
import {useEffect,useRef,useState} from "react";
import {Camera,PenLine,X} from "lucide-react";
import styles from "./TripFeed.module.css";
type Photo={url:string;name:string};
type Post={id:number;text:string;photos:Photo[]};
/** Local composition only; no shared upload or persistence service is connected. */
export function TripFeed(){
 const [open,setOpen]=useState(false),[text,setText]=useState("");
 const [photos,setPhotos]=useState<Photo[]>([]),[posts,setPosts]=useState<Post[]>([]);
 const [error,setError]=useState("");const picker=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null);
 const urls=useRef(new Set<string>());
 useEffect(()=>{const selectedUrls=urls.current;return ()=>{selectedUrls.forEach(url=>URL.revokeObjectURL(url));};},[]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 const discard=()=>{photos.forEach(photo=>{URL.revokeObjectURL(photo.url);urls.current.delete(photo.url)});setPhotos([]);setText("");setError("");setOpen(false)};
 return <div className={styles.feed}>
  <div className={styles.actions}><button type="button" onClick={()=>picker.current?.click()}><Camera size={17}/>Upload pictures</button><button type="button" onClick={()=>setOpen(true)}><PenLine size={17}/>Make a post</button></div>
  <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="Choose trip pictures" onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value="";if(!files.length)return;setOpen(true);if(files.length+photos.length>6||files.some(file=>!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10*1024*1024)){setError("Choose up to 6 JPG, PNG or WebP pictures, 10 MB each.");return}setError("");setPhotos(previous=>[...previous,...files.map(file=>{const url=URL.createObjectURL(file);urls.current.add(url);return {url,name:file.name}})])}}/>
  <dialog ref={dialog} className={styles.dialog} aria-labelledby="trip-post-title" onCancel={event=>{event.preventDefault();discard()}}><header><h2 id="trip-post-title">Make a post</h2><button type="button" aria-label="Close post" onClick={discard}><X size={20}/></button></header><form onSubmit={event=>{event.preventDefault();if(!text.trim()&&!photos.length)return;setPosts(previous=>[{id:Date.now(),text:text.trim(),photos},...previous]);setPhotos([]);setText("");setOpen(false)}}><label htmlFor="trip-post-text">What is happening on the course?</label><textarea id="trip-post-text" value={text} maxLength={2000} onChange={event=>setText(event.target.value)} rows={4}/><div className={styles.photos}>{photos.map(photo=><img key={photo.url} src={photo.url} alt={photo.name}/>)}</div>{error&&<p role="alert">{error}</p>}<footer><button type="button" onClick={()=>picker.current?.click()}>Add pictures</button><button type="submit" disabled={!text.trim()&&!photos.length}>Post</button></footer></form></dialog>
  <div className={styles.posts} aria-live="polite">{posts.map(post=><article key={post.id}><strong>You</strong>{post.text&&<p>{post.text}</p>}<div className={styles.photos}>{post.photos.map(photo=><img key={photo.url} src={photo.url} alt={photo.name}/>)}</div><button type="button" onClick={()=>{post.photos.forEach(photo=>{URL.revokeObjectURL(photo.url);urls.current.delete(photo.url)});setPosts(previous=>previous.filter(item=>item.id!==post.id))}}>Delete post</button></article>)}</div>
 </div>;
}
