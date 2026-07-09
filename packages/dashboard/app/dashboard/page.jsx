'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import useStore from '../../lib/store';
import { supabase } from '../../lib/supabase';
import EnhancedAnalysis from '../../components/EnhancedAnalysis';
import Sidebar from '../../components/Sidebar';
import { FileCode2, AlertTriangle, ShieldAlert, CheckCircle2, Info, Cpu, Wifi, WifiOff, Eye } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://overseer-main.onrender.com';
const WS_URL  = process.env.NEXT_PUBLIC_WS_URL || API_URL.replace(/^http/, 'ws');

const SEVERITY = {
  critical:      { label:'Critical',      bg:'bg-[#2a0d0d]',       border:'border-[#f44336]/40', badge:'bg-[#f44336] text-white',                   dot:'bg-[#f44336]', icon:<ShieldAlert   className="w-3.5 h-3.5"/> },
  warning:       { label:'Warning',       bg:'bg-[#2a1d00]',       border:'border-[#FFB300]/40', badge:'bg-[#FFB300] text-[#121212] font-semibold', dot:'bg-[#FFB300]',  icon:<AlertTriangle className="w-3.5 h-3.5"/> },
  hallucination: { label:'Hallucination', bg:'bg-purple-950/60',   border:'border-purple-500/40',badge:'bg-purple-600 text-white',                  dot:'bg-purple-500', icon:<Cpu           className="w-3.5 h-3.5"/> },
  good:          { label:'Good',          bg:'bg-[#0a2010]',       border:'border-[#4CAF50]/40', badge:'bg-[#4CAF50] text-[#121212] font-semibold', dot:'bg-[#4CAF50]',  icon:<CheckCircle2  className="w-3.5 h-3.5"/> },
  info:          { label:'Info',          bg:'bg-surface-l1',      border:'border-outline-variant/50',badge:'bg-surface-l3 text-on-surface-variant', dot:'bg-on-surface-variant', icon:<Info className="w-3.5 h-3.5"/> },
  context:       { label:'Context',       bg:'bg-surface-l1',      border:'border-outline-variant/30',badge:'bg-surface-l2 text-on-surface-variant', dot:'bg-outline-variant', icon:<Info className="w-3.5 h-3.5"/> },
};

async function callMarkReviewed(id) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${API_URL}/api/sessions/${id}/mark-reviewed`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
  return res.json();
}

function FeedCard({ item, onMarkReviewed, isReviewed }) {
  const s = SEVERITY[item.severity] || SEVERITY.info;
  const [marking, setMarking] = useState(false);
  const handleMark = async (e) => {
    e.stopPropagation(); setMarking(true);
    try { await onMarkReviewed(item.id); } catch { setMarking(false); }
  };
  return (
    <div className={`rounded-lg border ${s.bg} ${s.border} p-4 mb-3 transition-all duration-500 ${isReviewed ? 'opacity-0 h-0 overflow-hidden mb-0 scale-95 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>{s.icon}{s.label}</span>
        <span className="flex items-center gap-1 text-[11px] text-on-surface-variant font-mono truncate max-w-xs"><FileCode2 className="w-3 h-3 flex-shrink-0"/>{item.filePath||'—'}</span>
        <span className="text-[10px] text-on-surface-variant/60 ml-auto font-mono">{new Date(item.timestamp).toLocaleTimeString()}</span>
        {onMarkReviewed && (
          <label className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer text-on-surface-variant hover:text-stable transition-colors">
            <input type="checkbox" className="w-3.5 h-3.5 cursor-pointer accent-stable rounded" checked={isReviewed} disabled={marking||isReviewed} onChange={handleMark}/>
            {marking?'…':isReviewed?'Reviewed':'Mark Reviewed'}
          </label>
        )}
      </div>
      <p className="text-sm font-semibold text-on-surface mb-1 leading-snug">{item.title}</p>
      <p className="text-sm text-on-surface-variant leading-relaxed">{item.body}</p>
      {item.fix && (
        <div className="mt-3 p-2.5 rounded-md bg-surface-l2 border border-outline-variant/40">
          <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">🔧 Suggested fix</p>
          <p className="text-xs text-on-surface font-mono leading-relaxed whitespace-pre-wrap">{item.fix}</p>
        </div>
      )}
      {item.fileRelevance && item.fileRelevance !== 'Unknown' && (
        <p className="text-[11px] text-on-surface-variant/60 mt-2 italic">{item.fileRelevance}</p>
      )}
    </div>
  );
}

function StatBadge({ label, count, dotColor, borderColor }) {
  return (
    <div className={`rounded-lg p-3 bg-surface-l2 border ${borderColor} flex flex-col items-center gap-1`}>
      <div className={`w-2 h-2 rounded-full ${dotColor} mb-0.5`}/>
      <span className="text-xl font-bold text-on-surface font-mono">{count}</span>
      <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ViewToggle({ viewMode, setViewMode, liveCount, allCount }) {
  return (
    <div className="flex bg-surface-l2 rounded-lg border border-outline-variant/40 p-0.5 gap-0.5">
      {[{key:'live',label:`Live (${liveCount})`},{key:'all',label:`All (${allCount})`}].map(({key,label})=>(
        <button key={key} onClick={()=>setViewMode(key)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${viewMode===key?'bg-accent-primary text-surface-l0 shadow-sm':'text-on-surface-variant hover:text-on-surface'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { feedItems, sessionStats, wsConnected, sessionId, addFeedItem, setWsConnected, setSessionId, reviewedIds, viewMode, markReviewed, setViewMode } = useStore();
  const wsRef = useRef(null); const feedRef = useRef(null); const router = useRouter();
  const liveItems = feedItems.filter(i=>!reviewedIds.has(i.id));
  const displayItems = viewMode==='live'?liveItems:feedItems;

  const handleMarkReviewed = useCallback(async(id)=>{
    try { await callMarkReviewed(id); markReviewed(id); }
    catch(err){ if(err.message.includes('404')) markReviewed(id); else throw err; }
  },[markReviewed]);

  useEffect(()=>{
    const check=async()=>{const{data:{session}}=await supabase.auth.getSession();if(!session)router.push('/auth/login');};
    check();
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>{if(!s)router.push('/auth/login');});
    return()=>subscription.unsubscribe();
  },[router]);

  useEffect(()=>{
    const e=sessionStorage.getItem('overseer_session_id');
    if(e){setSessionId(e);}else{const n=crypto.randomUUID();sessionStorage.setItem('overseer_session_id',n);setSessionId(n);}
  },[setSessionId]);

  useEffect(()=>{
    if(!sessionId)return; let a=true;
    const ws=new WebSocket(`${WS_URL}/?session=${sessionId}`); wsRef.current=ws;
    ws.onopen=()=>{if(a)setWsConnected(true);}; ws.onclose=()=>{if(a)setWsConnected(false);}; ws.onerror=()=>{if(a)setWsConnected(false);};
    ws.onmessage=(ev)=>{if(!a)return;try{const m=JSON.parse(ev.data);if(m.type==='analysis_complete'&&m.result){const r=m.result;addFeedItem({id:r.id||crypto.randomUUID(),severity:r.severity,title:r.title,body:r.body,fix:r.fix||null,fileRelevance:r.file_relevance,filePath:m.filePath||'',timestamp:Date.now(),enhanced:m.enhanced||false,suggestion:r.suggestion||null,betterApproach:r.betterApproach||null,changeAnalysis:r.changeAnalysis||[],explanations:r.explanations||'',alignment:r.alignment||null,decisions:r.decisions||null,usedFallback:r.usedFallback||false});}}catch{}};
    return()=>{a=false;ws.close();};
  },[sessionId,addFeedItem,setWsConnected]);

  useEffect(()=>{if(feedRef.current)feedRef.current.scrollTo({top:0,behavior:'smooth'});},[feedItems.length]);

  return (
    <div className="min-h-screen flex bg-surface-l0 text-on-surface">
      <Sidebar />

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar */}
        <div className="h-14 border-b border-outline-variant/40 bg-surface-l1 flex items-center px-5 gap-4 flex-shrink-0">
          <h1 className="text-sm font-semibold text-on-surface">Live Analysis</h1>
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} liveCount={liveItems.length} allCount={feedItems.length}/>
          <div className="ml-auto flex items-center gap-2 bg-surface-l2 px-2.5 py-1 rounded border border-outline-variant/30">
            {wsConnected?<Wifi className="w-3.5 h-3.5 text-stable"/>:<WifiOff className="w-3.5 h-3.5 text-critical"/>}
            <span className={`text-[11px] font-mono ${wsConnected?'text-stable':'text-critical'}`}>{wsConnected?'Live':'Disconnected'}</span>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Feed */}
          <main className="flex-1 overflow-y-auto p-6" ref={feedRef}>
            {displayItems.length===0?(
              <div className="flex flex-col items-center justify-center h-96 text-on-surface-variant/40">
                <div className="w-16 h-16 rounded-full bg-surface-l2 border border-outline-variant/30 flex items-center justify-center mb-5">
                  <Eye className="w-7 h-7 text-on-surface-variant/30"/>
                </div>
                {feedItems.length>0&&viewMode==='live'?(
                  <><p className="text-base font-semibold text-on-surface-variant">All caught up!</p>
                  <p className="text-sm mt-1">All {feedItems.length} reviewed. <button onClick={()=>setViewMode('all')} className="text-accent-primary underline">View all</button></p></>
                ):(
                  <><p className="text-base font-semibold text-on-surface-variant">Watching for file changes…</p>
                  <p className="text-sm mt-1">Run <code className="bg-surface-l2 border border-outline-variant/40 px-2 py-0.5 rounded text-on-surface font-mono text-xs mx-1">overseer watch</code> to start.</p></>
                )}
              </div>
            ):(
              displayItems.map(item=>item.enhanced
                ?<EnhancedAnalysis key={item.id} item={item} onMarkReviewed={handleMarkReviewed} isReviewed={reviewedIds.has(item.id)}/>
                :<FeedCard key={item.id} item={item} onMarkReviewed={handleMarkReviewed} isReviewed={reviewedIds.has(item.id)}/>
              )
            )}
          </main>

          {/* Sidebar stats */}
          <aside className="w-72 border-l border-outline-variant/40 bg-surface-l1 p-5 flex flex-col gap-5 overflow-y-auto flex-shrink-0">
            <div>
              <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Session Stats</h2>
              <div className="grid grid-cols-2 gap-2">
                <StatBadge label="Critical" count={sessionStats.criticalCount} dotColor="bg-critical" borderColor="border-critical/20"/>
                <StatBadge label="Warnings" count={sessionStats.warningCount} dotColor="bg-warning" borderColor="border-warning/20"/>
                <StatBadge label="Good" count={sessionStats.goodCount} dotColor="bg-stable" borderColor="border-stable/20"/>
                <StatBadge label="Total" count={sessionStats.analysisCount} dotColor="bg-accent-primary" borderColor="border-outline-variant/40"/>
              </div>
            </div>
            <div>
              <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Review Progress</h2>
              <div className="bg-surface-l2 rounded-lg p-3 border border-outline-variant/30">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-on-surface-variant">Reviewed</span>
                  <span className="text-xs font-mono text-on-surface">{reviewedIds.size} / {feedItems.length}</span>
                </div>
                <div className="w-full bg-surface-l0 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-stable transition-all duration-500" style={{width:feedItems.length>0?`${(reviewedIds.size/feedItems.length)*100}%`:'0%'}}/>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Files Touched ({sessionStats.filesTouched.length})</h2>
              <div className="space-y-1.5">
                {sessionStats.filesTouched.length===0?<p className="text-xs text-on-surface-variant/40">None yet</p>:
                  sessionStats.filesTouched.map(f=>(
                    <div key={f} className="flex items-center gap-1.5 group">
                      <FileCode2 className="w-3 h-3 text-on-surface-variant/40 flex-shrink-0"/>
                      <p className="text-[11px] font-mono text-on-surface-variant truncate group-hover:text-on-surface transition-colors" title={f}>{f}</p>
                    </div>
                  ))
                }
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
