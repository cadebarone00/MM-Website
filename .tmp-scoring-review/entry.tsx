import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScoringPanel } from '../components/portal/ScoringPanel';
const matchBox={id:'preview',boxNumber:1,format:'Fourball' as const,teeTime:'2026-01-03',maroonPlayers:['cam-latto','pete-peabody'],whitePlayers:['cade-barone','kyle-schnabel'],state:'Live'};
const previewState={matchBox,holes:Array.from({length:18},(_,i)=>({number:i+1,par:4,yards:406})),scores:[],submittedPlayers:[]};
createRoot(document.getElementById('root')!).render(<><header className="h-16 bg-maroon-900 text-white text-center py-5">Official Scoring</header><nav className="h-12 bg-maroon-900 text-white flex items-center justify-around"><span>Website</span><span>Portal</span><span>Scoring</span></nav><main className="px-4 pb-8"><ScoringPanel playerSlug="cam-latto" playerFullName="Cam Latto" round={1} matchBox={matchBox} nameBySlug={{}} previewState={previewState}/></main></>);