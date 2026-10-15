"use client";
import { useEffect, useState } from "react";

type Idea = { id: number; problem: string; solution: string; audience: string; difficulty: string; votes: number };
const seed: Idea[] = [
  { id: 1, problem: "Hair clippings all over the sink", solution: "Razor or trimmer with a miniature vacuum and removable collection chamber", audience: "Anyone who shaves or trims", difficulty: "Prototype", votes: 1 },
  { id: 2, problem: "No comfortable private place to rest between shifts", solution: "Packable indoor sleep cocoon", audience: "Shift workers and travelers", difficulty: "Research", votes: 0 },
  { id: 3, problem: "Reusable cleanup cloths are awkward to carry and wash", solution: "Discreet washable cloth with a ventilated travel case", audience: "Everyday personal care", difficulty: "Concept", votes: 0 },
];
const storageKey = "3dvr-everyday-inventions-v1";
export default function EverydayInventions() {
  const [ideas, setIdeas] = useState<Idea[]>(seed);
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [filter, setFilter] = useState("");
  useEffect(() => { try { const raw = localStorage.getItem(storageKey); if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setIdeas(parsed); } } catch {} }, []);
  function save(next: Idea[]) { setIdeas(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {} }
  function add(e: React.FormEvent) { e.preventDefault(); if (!problem.trim() || !solution.trim()) return; save([{id:Date.now(),problem:problem.trim(),solution:solution.trim(),audience:"To discover",difficulty:"Concept",votes:0},...ideas]); setProblem("");setSolution(""); }
  const visible = ideas.filter(x => (x.problem+" "+x.solution+" "+x.audience).toLowerCase().includes(filter.toLowerCase()));
  return <main className="min-h-screen bg-zinc-950 text-zinc-100 px-5 py-12"><div className="mx-auto max-w-4xl space-y-9">
    <header className="space-y-3"><p className="text-emerald-400 text-sm tracking-widest uppercase">3DVR · Open invention studio</p><h1 className="text-4xl md:text-6xl font-bold">Make everyday life better.</h1><p className="text-zinc-400 max-w-2xl">Spot tiny frustrations. Invent practical fixes. Test with real people. Share what works.</p></header>
    <form onSubmit={add} className="bg-zinc-900 rounded-2xl p-5 space-y-3 border border-zinc-800"><h2 className="text-xl font-semibold">Capture an invention</h2><label className="block text-sm">What's annoying?<input required maxLength={240} value={problem} onChange={e=>setProblem(e.target.value)} placeholder="The sink fills with hair after shaving…" className="mt-1 w-full rounded-lg bg-zinc-800 p-3 outline-none focus:ring-2 focus:ring-emerald-500"/></label><label className="block text-sm">What's the simple fix?<textarea required maxLength={800} value={solution} onChange={e=>setSolution(e.target.value)} placeholder="A razor with a tiny vacuum…" className="mt-1 w-full rounded-lg bg-zinc-800 p-3 min-h-24 outline-none focus:ring-2 focus:ring-emerald-500"/></label><button className="rounded-xl bg-emerald-400 text-zinc-950 font-bold px-5 py-3">Save idea</button><p className="text-xs text-zinc-500">Ideas are stored on this device for now. No account or cloud sync yet.</p></form>
    <section className="space-y-4"><div className="flex flex-wrap gap-3 items-center justify-between"><h2 className="text-2xl font-bold">Invention board</h2><input aria-label="Search inventions" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search ideas…" className="rounded-lg bg-zinc-900 border border-zinc-800 p-3"/></div><div className="grid md:grid-cols-2 gap-4">{visible.map(idea=><article key={idea.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3"><span className="text-xs text-emerald-400 uppercase tracking-wider">{idea.difficulty}</span><h3 className="font-bold text-xl">{idea.problem}</h3><p className="text-zinc-300">{idea.solution}</p><p className="text-sm text-zinc-500">For: {idea.audience}</p><button onClick={()=>save(ideas.map(x=>x.id===idea.id?{...x,votes:x.votes+1}:x))} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800" aria-label={"Support "+idea.problem}>♡ Useful · {idea.votes}</button></article>)}</div>{visible.length===0&&<p className="text-zinc-400">No matching inventions yet.</p>}</section>
    <footer className="border-t border-zinc-800 pt-6 text-sm text-zinc-500">Find a problem → Sketch a fix → Prototype → Test → Share openly. · 3DVR</footer>
  </div></main>;
}
