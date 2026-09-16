import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, FilePlus2, FileText, Hand,
  Highlighter, ImagePlus, Minus, MousePointer2, PenLine, Plus, Redo2, Search,
  Square, Trash2, Type, Undo2, ZoomIn, ZoomOut
} from 'lucide-react';
import { create } from 'zustand';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type Tool = 'select' | 'text' | 'highlight' | 'draw' | 'shape' | 'image';
type EditorObject = TextObject | HighlightObject | ShapeObject | ImageObject;
interface BaseObject { id: string; pageIndex: number; x: number; y: number; width: number; height: number; rotation: number; }
interface TextObject extends BaseObject { type: 'text'; text: string; fontSize: number; color: string; }
interface HighlightObject extends BaseObject { type: 'highlight'; color: string; opacity: number; }
interface ShapeObject extends BaseObject { type: 'shape'; stroke: string; fill: string; strokeWidth: number; }
interface ImageObject extends BaseObject { type: 'image'; dataUrl: string; }
interface PageState { index: number; width: number; height: number; rotation: number; }

interface Store {
  objects: EditorObject[];
  selectedId: string | null;
  tool: Tool;
  undo: EditorObject[][];
  redo: EditorObject[][];
  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  add: (obj: EditorObject) => void;
  update: (id: string, patch: Partial<EditorObject>) => void;
  remove: (id: string) => void;
  snapshot: () => void;
  undoAction: () => void;
  redoAction: () => void;
  clearHistory: () => void;
}
const clone = (v: EditorObject[]) => JSON.parse(JSON.stringify(v)) as EditorObject[];
const useEditor = create<Store>((set) => ({
  objects: [], selectedId: null, tool: 'select', undo: [], redo: [],
  setTool: (tool) => set({ tool, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  snapshot: () => set((s) => ({ undo: [...s.undo, clone(s.objects)].slice(-100), redo: [] })),
  add: (obj) => set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id })),
  update: (id, patch) => set((s) => ({ objects: s.objects.map(o => o.id === id ? { ...o, ...patch } as EditorObject : o) })),
  remove: (id) => set((s) => ({ objects: s.objects.filter(o => o.id !== id), selectedId: null })),
  undoAction: () => set((s) => {
    if (!s.undo.length) return s;
    const previous = s.undo[s.undo.length - 1];
    return { objects: clone(previous), undo: s.undo.slice(0, -1), redo: [...s.redo, clone(s.objects)].slice(-100), selectedId: null };
  }),
  redoAction: () => set((s) => {
    if (!s.redo.length) return s;
    const next = s.redo[s.redo.length - 1];
    return { objects: clone(next), redo: s.redo.slice(0, -1), undo: [...s.undo, clone(s.objects)].slice(-100), selectedId: null };
  }),
  clearHistory: () => set({ undo: [], redo: [] }),
}));

const id = () => crypto.randomUUID();

export default function App() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState('Untitled.pdf');
  const [pages, setPages] = useState<PageState[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState('Open a PDF to begin');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const objects = useEditor(s => s.objects);
  const tool = useEditor(s => s.tool);
  const selectedId = useEditor(s => s.selectedId);
  const selected = objects.find(o => o.id === selectedId);
  const setTool = useEditor(s => s.setTool);
  const select = useEditor(s => s.select);
  const add = useEditor(s => s.add);
  const update = useEditor(s => s.update);
  const remove = useEditor(s => s.remove);
  const snapshot = useEditor(s => s.snapshot);
  const undoAction = useEditor(s => s.undoAction);
  const redoAction = useEditor(s => s.redoAction);

  const openFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus('Please choose a PDF file.'); return;
    }
    try {
      setStatus('Loading PDF…');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const task = getDocument({ data: bytes });
      const loaded = await task.promise;
      const meta: PageState[] = [];
      for (let i = 0; i < loaded.numPages; i++) {
        const p = await loaded.getPage(i + 1);
        const view = p.getViewport({ scale: 1 });
        meta.push({ index: i, width: view.width, height: view.height, rotation: p.rotate });
      }
      setPdf(loaded); setPages(meta); setFileName(file.name); setCurrentPage(0); setZoom(1); setStatus(`${loaded.numPages} page${loaded.numPages === 1 ? '' : 's'} loaded`);
      useEditor.getState().clearHistory();
    } catch (e) { console.error(e); setStatus('Could not open this PDF. It may be malformed or encrypted.'); }
  }, []);

  const exportPdf = useCallback(async () => {
    if (!pdf) return;
    setStatus('Preparing PDF…');
    try {
      const source = await fetch(pdf.getMetadata ? (pdf as unknown as { _transport?: unknown }).toString() : '').catch(() => null);
      void source;
      // PDF.js does not expose original bytes as a public API. Re-read the opened file through the browser file handle in the normal workflow.
      // The app keeps a copy of the original bytes in a closure below via window.__pdfBytes.
      const bytes = (window as unknown as { __pdfBytes?: Uint8Array }).__pdfBytes;
      if (!bytes) { setStatus('Please reopen the PDF before exporting.'); return; }
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const o of objects) {
        const page = doc.getPage(o.pageIndex);
        const y = page.getHeight() - o.y - o.height;
        if (o.type === 'text') {
          page.drawText(o.text, { x: o.x, y, size: o.fontSize, font, color: hexToRgb(o.color) });
        } else if (o.type === 'highlight') {
          page.drawRectangle({ x: o.x, y, width: o.width, height: o.height, color: hexToRgb(o.color), opacity: o.opacity, borderWidth: 0 });
        } else if (o.type === 'shape') {
          page.drawRectangle({ x: o.x, y, width: o.width, height: o.height, color: hexToRgb(o.fill), borderColor: hexToRgb(o.stroke), borderWidth: o.strokeWidth, rotate: degrees(o.rotation) });
        } else if (o.type === 'image') {
          const img = o.dataUrl.startsWith('data:image/png') ? await doc.embedPng(o.dataUrl) : await doc.embedJpg(o.dataUrl);
          page.drawImage(img, { x: o.x, y, width: o.width, height: o.height, rotate: degrees(o.rotation) });
        }
      }
      const out = await doc.save({ useObjectStreams: true });
      const blob = new Blob([out as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName.replace(/\.pdf$/i, '') + '-edited.pdf'; a.click();
      URL.revokeObjectURL(url); setStatus('Saved locally');
    } catch (e) { console.error(e); setStatus('Export failed. The original document was not modified.'); }
  }, [pdf, objects, fileName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); fileRef.current?.click(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void exportPdf(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoAction() : undoAction(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoAction(); }
      if (e.key === 'Delete' && selectedId) { snapshot(); remove(selectedId); }
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [exportPdf, redoAction, undoAction, selectedId, snapshot, remove, select]);

  useEffect(() => {
    if (!pdf) return;
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setCurrentPage(Number((visible.target as HTMLElement).dataset.page));
    }, { root: scrollerRef.current, threshold: [0.25, 0.6, 0.9] });
    pageRefs.current.forEach(el => el && obs.observe(el)); return () => obs.disconnect();
  }, [pdf, pages.length, zoom]);

  const zoomBy = (delta: number) => setZoom(z => Math.min(4, Math.max(0.25, Math.round((z + delta) * 100) / 100)));

  return <div className={dark ? 'app dark' : 'app'}>
    <input ref={fileRef} hidden type="file" accept="application/pdf,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) { (window as unknown as { __pdfBytes?: Uint8Array }).__pdfBytes = undefined; f.arrayBuffer().then(b => (window as unknown as { __pdfBytes?: Uint8Array }).__pdfBytes = new Uint8Array(b)); void openFile(f); } }} />
    <header className="topbar">
      <div className="brand"><div className="brandMark"><FileText size={18}/></div><span>PDF Editor</span></div>
      <button className="menuBtn" onClick={() => fileRef.current?.click()}><FilePlus2 size={17}/> Open PDF</button>
      <div className="topActions">
        <IconButton label="Undo" onClick={undoAction}><Undo2/></IconButton>
        <IconButton label="Redo" onClick={redoAction}><Redo2/></IconButton>
        <div className="divider"/>
        <button className="saveBtn" onClick={() => void exportPdf()} disabled={!pdf}><Download size={16}/> Export PDF</button>
        <button className="themeBtn" onClick={() => setDark(v => !v)}>{dark ? 'Light' : 'Dark'}</button>
      </div>
    </header>

    <div className="toolbar">
      <ToolButton active={tool === 'select'} label="Select" onClick={() => setTool('select')}><MousePointer2/></ToolButton>
      <ToolButton active={tool === 'text'} label="Text" onClick={() => setTool('text')}><Type/></ToolButton>
      <ToolButton active={tool === 'highlight'} label="Highlight" onClick={() => setTool('highlight')}><Highlighter/></ToolButton>
      <ToolButton active={tool === 'draw'} label="Draw" onClick={() => setTool('draw')}><PenLine/></ToolButton>
      <ToolButton active={tool === 'shape'} label="Shape" onClick={() => setTool('shape')}><Square/></ToolButton>
      <ToolButton active={tool === 'image'} label="Image" onClick={() => setTool('image')}><ImagePlus/></ToolButton>
      <div className="toolbarSpacer"/>
      <button className="searchBtn" onClick={() => setSearchOpen(v => !v)}><Search size={17}/> Search</button>
    </div>

    <main className="workspace">
      <aside className="sidebar">
        <div className="sideTitle"><span>Pages</span><span className="count">{pages.length}</span></div>
        <div className="thumbs">{pages.map(p => <button key={p.index} className={p.index === currentPage ? 'thumb active' : 'thumb'} onClick={() => pageRefs.current[p.index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><PageThumb pdf={pdf} index={p.index} rotation={p.rotation}/><span>{p.index + 1}</span></button>)}</div>
      </aside>

      <section className="canvasArea" ref={scrollerRef} onClick={() => { if (!selectedId && tool === 'select') select(null); }}>
        {!pdf ? <EmptyState onOpen={() => fileRef.current?.click()}/> : <div className="pageStack">
          {pages.map(p => <PDFPage key={p.index} pdf={pdf} page={p} zoom={zoom} pageRef={el => { pageRefs.current[p.index] = el; }} tool={tool} objects={objects.filter(o => o.pageIndex === p.index)} selectedId={selectedId} onSelect={select} onAdd={o => { snapshot(); add(o); }} onUpdate={update}/>)}</div>}
      </section>

      <aside className="properties">
        <div className="sideTitle">Properties</div>
        {selected ? <Properties object={selected} onChange={(patch) => { snapshot(); update(selected.id, patch); }} /> : <div className="emptyProps"><MousePointer2 size={20}/><p>Select an object to edit its exact properties.</p><small>PDF coordinates are stored in document space, independent of zoom.</small></div>}
      </aside>
    </main>

    <footer className="statusbar">
      <span>{status}</span><span>Page {pdf ? currentPage + 1 : 0} / {pages.length}</span><div className="zoom"><button onClick={() => zoomBy(-0.1)}><ZoomOut size={15}/></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => zoomBy(0.1)}><ZoomIn size={15}/></button></div>
    </footer>
    {searchOpen && <SearchPanel query={query} setQuery={setQuery} pdf={pdf} onClose={() => setSearchOpen(false)} onJump={p => pageRefs.current[p]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}/>} 
  </div>;
}

function PDFPage({ pdf, page, zoom, pageRef, tool, objects, selectedId, onSelect, onAdd, onUpdate }: { pdf: PDFDocumentProxy; page: PageState; zoom: number; pageRef: (el: HTMLDivElement | null) => void; tool: Tool; objects: EditorObject[]; selectedId: string | null; onSelect: (id: string | null) => void; onAdd: (o: EditorObject) => void; onUpdate: (id: string, patch: Partial<EditorObject>) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  useEffect(() => { let cancelled = false; (async () => { const p = await pdf.getPage(page.index + 1); const viewport = p.getViewport({ scale: zoom * window.devicePixelRatio }); const canvas = canvasRef.current; if (!canvas || cancelled) return; canvas.width = viewport.width; canvas.height = viewport.height; canvas.style.width = `${viewport.width / window.devicePixelRatio}px`; canvas.style.height = `${viewport.height / window.devicePixelRatio}px`; await p.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise; if (!cancelled) setRendered(true); })(); return () => { cancelled = true; }; }, [pdf, page.index, zoom]);
  const cssW = page.width * zoom; const cssH = page.height * zoom;
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === 'select') return;
    const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / zoom; const y = (e.clientY - r.top) / zoom;
    if (tool === 'text') onAdd({ id: id(), type: 'text', pageIndex: page.index, x, y, width: 180, height: 24, rotation: 0, text: 'Type here', fontSize: 14, color: '#111111' });
    if (tool === 'highlight') onAdd({ id: id(), type: 'highlight', pageIndex: page.index, x, y, width: 160, height: 18, rotation: 0, color: '#facc15', opacity: .35 });
    if (tool === 'shape') onAdd({ id: id(), type: 'shape', pageIndex: page.index, x, y, width: 160, height: 90, rotation: 0, stroke: '#111827', fill: '#ffffff00', strokeWidth: 1.5 });
  };
  return <div className="pageShell" ref={pageRef} data-page={page.index}><div ref={wrapRef} className="pdfPage" style={{ width: cssW, height: cssH }} onClick={handlePageClick}>
    <canvas ref={canvasRef}/>{!rendered && <div className="pageLoading">Rendering…</div>}
    <div className="objectLayer">{objects.map(o => <EditorObjectView key={o.id} object={o} zoom={zoom} selected={o.id === selectedId} onSelect={onSelect} onUpdate={onUpdate}/>)}</div>
  </div></div>;
}

function EditorObjectView({ object: o, zoom, selected, onSelect, onUpdate }: { object: EditorObject; zoom: number; selected: boolean; onSelect: (id: string) => void; onUpdate: (id: string, patch: Partial<EditorObject>) => void }) {
  const [drag, setDrag] = useState<{sx:number; sy:number; ox:number; oy:number} | null>(null);
  useEffect(() => { if (!drag) return; const move = (e: MouseEvent) => onUpdate(o.id, { x: drag.ox + (e.clientX - drag.sx) / zoom, y: drag.oy + (e.clientY - drag.sy) / zoom }); const up = () => setDrag(null); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; }, [drag, o.id, o.x, o.y, onUpdate, zoom]);
  const style = { left: o.x * zoom, top: o.y * zoom, width: o.width * zoom, height: o.height * zoom, transform: `rotate(${o.rotation}deg)`, transformOrigin: 'center', position: 'absolute' as const };
  const common = { className: selected ? 'editorObject selected' : 'editorObject', style, onMouseDown: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(o.id); setDrag({ sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y }); } };
  if (o.type === 'text') return <div {...common}><textarea value={o.text} onChange={e => onUpdate(o.id, { text: e.target.value })} style={{ fontSize: o.fontSize * zoom, color: o.color }} onMouseDown={e => e.stopPropagation()}/><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
  if (o.type === 'highlight') return <div {...common} style={{ ...style, background: o.color, opacity: o.opacity }}><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
  if (o.type === 'shape') return <div {...common} style={{ ...style, border: `${o.strokeWidth * zoom}px solid ${o.stroke}`, background: o.fill }}><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
  return <div {...common}><img src={o.dataUrl} alt="Inserted" draggable={false}/><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
}
function ResizeHandle({ o, zoom, onUpdate }: { o: EditorObject; zoom: number; onUpdate: (id:string, patch:Partial<EditorObject>)=>void }) { const start = useRef<{x:number;y:number;w:number;h:number}|null>(null); return <span className="resizeHandle" onMouseDown={e => { e.stopPropagation(); start.current={x:e.clientX,y:e.clientY,w:o.width,h:o.height}; const move=(ev:MouseEvent)=>{if(!start.current)return; onUpdate(o.id,{width:Math.max(20,start.current.w+(ev.clientX-start.current.x)/zoom),height:Math.max(10,start.current.h+(ev.clientY-start.current.y)/zoom)});}; const up=()=>{start.current=null;window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)}; window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);}}/>; }

function Properties({ object: o, onChange }: { object: EditorObject; onChange: (p: Partial<EditorObject>) => void }) { return <div className="propsForm"><label>Type<input value={o.type} disabled/></label>{o.type === 'text' && <><label>Text<textarea value={o.text} onChange={e=>onChange({text:e.target.value})}/></label><label>Font size<input type="number" value={o.fontSize} onChange={e=>onChange({fontSize:Number(e.target.value)})}/></label><label>Color<input type="color" value={o.color} onChange={e=>onChange({color:e.target.value})}/></label></>}<div className="two"><label>X<input type="number" step="0.01" value={round(o.x)} onChange={e=>onChange({x:Number(e.target.value)})}/></label><label>Y<input type="number" step="0.01" value={round(o.y)} onChange={e=>onChange({y:Number(e.target.value)})}/></label></div><div className="two"><label>Width<input type="number" step="0.01" value={round(o.width)} onChange={e=>onChange({width:Number(e.target.value)})}/></label><label>Height<input type="number" step="0.01" value={round(o.height)} onChange={e=>onChange({height:Number(e.target.value)})}/></label></div><label>Rotation<input type="number" step="0.1" value={round(o.rotation)} onChange={e=>onChange({rotation:Number(e.target.value)})}/></label><div className="precisionNote">Coordinates are PDF points. Zoom does not change document coordinates.</div></div>; }
function SearchPanel({ query, setQuery, pdf, onClose, onJump }: { query:string; setQuery:(v:string)=>void; pdf:PDFDocumentProxy|null; onClose:()=>void; onJump:(p:number)=>void }) { const [hits,setHits]=useState<{page:number;text:string}[]>([]); useEffect(()=>{let live=true;(async()=>{if(!pdf||!query.trim()){setHits([]);return}const a:{page:number;text:string}[]=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();const text=c.items.map(x=>'str'in x?x.str:'').join(' ');if(text.toLowerCase().includes(query.toLowerCase()))a.push({page:i-1,text:text.slice(0,180)});}if(live)setHits(a)})();return()=>{live=false}},[pdf,query]);return <div className="searchPanel"><div className="searchHead"><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search document…"/><button onClick={onClose}>×</button></div>{hits.map(h=><button key={h.page} className="hit" onClick={()=>onJump(h.page)}><b>Page {h.page+1}</b><span>{h.text}</span></button>)}{query&&hits.length===0&&<div className="noHits">No matches</div>}</div>; }
function PageThumb({pdf,index,rotation}:{pdf:PDFDocumentProxy|null;index:number;rotation:number}){const ref=useRef<HTMLCanvasElement>(null);useEffect(()=>{if(!pdf)return;let dead=false;(async()=>{const p=await pdf.getPage(index+1);const v=p.getViewport({scale:.16});const c=ref.current;if(!c||dead)return;c.width=v.width*2;c.height=v.height*2;c.style.width=`${v.width}px`;c.style.height=`${v.height}px`;await p.render({canvasContext:c.getContext('2d')!,viewport:p.getViewport({scale:.32})}).promise})();return()=>{dead=true}},[pdf,index,rotation]);return <canvas ref={ref}/>}
function EmptyState({onOpen}:{onOpen:()=>void}){return <div className="empty"><div className="emptyIcon"><FileText size={34}/></div><h1>Edit PDFs locally</h1><p>Open a PDF and edit text overlays, images, highlights and shapes without uploading your document.</p><button className="primary" onClick={onOpen}><FilePlus2 size={18}/> Open PDF</button><span>Files stay in your browser.</span></div>}
function ToolButton({active,label,onClick,children}:{active:boolean;label:string;onClick:()=>void;children:React.ReactNode}){return <button className={active?'tool active':'tool'} onClick={onClick} title={label}>{children}<span>{label}</span></button>}
function IconButton({label,onClick,children}:{label:string;onClick:()=>void;children:React.ReactNode}){return <button className="iconBtn" title={label} onClick={onClick}>{children}</button>}
function round(v:number){return Math.round(v*100)/100}
function hexToRgb(hex:string){const h=hex.replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)}
