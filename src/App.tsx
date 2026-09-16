import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy } from 'pdfjs-dist';
import { Download, FilePlus2, FileText, Highlighter, ImagePlus, MousePointer2, PenLine, Redo2, Search, Square, Type, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { create } from 'zustand';
import { inspectTextSpans, replaceTextSpans, type TextReplacementEdit, type TextSpan } from './services/pdfApi';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type Tool = 'select' | 'text' | 'highlight' | 'draw' | 'shape' | 'image';
type EditorObject = TextObject | HighlightObject | ShapeObject | ImageObject;
interface BaseObject { id:string; pageIndex:number; x:number; y:number; width:number; height:number; rotation:number }
interface TextObject extends BaseObject { type:'text'; text:string; fontSize:number; color:string; sourceSpanId?:string; originalText?:string; sourceFont?:string; sourceFontSize?:number; sourceColor?:string; sourceBBox?:[number,number,number,number] }
interface HighlightObject extends BaseObject { type:'highlight'; color:string; opacity:number }
interface ShapeObject extends BaseObject { type:'shape'; stroke:string; fill:string; strokeWidth:number }
interface ImageObject extends BaseObject { type:'image'; dataUrl:string }
interface PageState { index:number; width:number; height:number; rotation:number }

interface Store { objects:EditorObject[]; selectedId:string|null; tool:Tool; undo:EditorObject[][]; redo:EditorObject[][]; setTool:(t:Tool)=>void; select:(id:string|null)=>void; add:(o:EditorObject)=>void; update:(id:string,p:Partial<EditorObject>)=>void; remove:(id:string)=>void; snapshot:()=>void; undoAction:()=>void; redoAction:()=>void; clearHistory:()=>void }
const clone=(v:EditorObject[])=>JSON.parse(JSON.stringify(v)) as EditorObject[];
const useEditor=create<Store>((set)=>({
  objects:[],selectedId:null,tool:'select',undo:[],redo:[],
  setTool:(tool)=>set({tool,selectedId:null}),select:(selectedId)=>set({selectedId}),
  snapshot:()=>set(s=>({undo:[...s.undo,clone(s.objects)].slice(-100),redo:[]})),
  add:(o)=>set(s=>({objects:[...s.objects,o],selectedId:o.id})),
  update:(id,p)=>set(s=>({objects:s.objects.map(o=>o.id===id?({...o,...p} as EditorObject):o)})),
  remove:(id)=>set(s=>({objects:s.objects.filter(o=>o.id!==id),selectedId:null})),
  undoAction:()=>set(s=>{if(!s.undo.length)return s;const previous=s.undo.at(-1)!;return{objects:clone(previous),undo:s.undo.slice(0,-1),redo:[...s.redo,clone(s.objects)].slice(-100),selectedId:null}}),
  redoAction:()=>set(s=>{if(!s.redo.length)return s;const next=s.redo.at(-1)!;return{objects:clone(next),redo:s.redo.slice(0,-1),undo:[...s.undo,clone(s.objects)].slice(-100),selectedId:null}}),
  clearHistory:()=>set({undo:[],redo:[]})
}));
const makeId=()=>crypto.randomUUID();
type WindowPdf=Window&{__pdfBytes?:Uint8Array};

export default function App(){
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[fileName,setFileName]=useState('Untitled.pdf'),[pages,setPages]=useState<PageState[]>([]),[currentPage,setCurrentPage]=useState(0),[zoom,setZoom]=useState(1),[status,setStatus]=useState('Open a PDF to begin'),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState(''),[dark,setDark]=useState(false),[textSpans,setTextSpans]=useState<TextSpan[]>([]),[backendReady,setBackendReady]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null),imageRef=useRef<HTMLInputElement>(null),scrollerRef=useRef<HTMLDivElement>(null),pageRefs=useRef<(HTMLDivElement|null)[]>([]);
  const objects=useEditor(s=>s.objects),tool=useEditor(s=>s.tool),selectedId=useEditor(s=>s.selectedId),selected=objects.find(o=>o.id===selectedId);
  const setTool=useEditor(s=>s.setTool),select=useEditor(s=>s.select),add=useEditor(s=>s.add),update=useEditor(s=>s.update),remove=useEditor(s=>s.remove),snapshot=useEditor(s=>s.snapshot),undoAction=useEditor(s=>s.undoAction),redoAction=useEditor(s=>s.redoAction);

  const openFile=useCallback(async(file:File)=>{
    if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){setStatus('Please choose a PDF file.');return}
    try{
      setStatus('Loading PDF…');const bytes=new Uint8Array(await file.arrayBuffer());(window as WindowPdf).__pdfBytes=bytes;
      const loaded=await getDocument({data:bytes}).promise,meta:PageState[]=[];
      for(let i=0;i<loaded.numPages;i++){const p=await loaded.getPage(i+1),v=p.getViewport({scale:1});meta.push({index:i,width:v.width,height:v.height,rotation:p.rotate})}
      setPdf(loaded);setPages(meta);setFileName(file.name);setCurrentPage(0);setZoom(1);setTextSpans([]);setBackendReady(false);useEditor.getState().clearHistory();setStatus(`${loaded.numPages} page${loaded.numPages===1?'':'s'} loaded`);
      try{const spans=await inspectTextSpans(file);setTextSpans(spans);setBackendReady(true);setStatus(`${loaded.numPages} page${loaded.numPages===1?'':'s'} loaded · high-fidelity text editing ready`)}catch(e){console.warn(e);setBackendReady(false);setStatus(`${loaded.numPages} page${loaded.numPages===1?'':'s'} loaded · local text backend unavailable`)}
    }catch(e){console.error(e);setStatus('Could not open this PDF. It may be malformed or encrypted.')}
  },[]);

  const exportPdf=useCallback(async()=>{
    if(!pdf)return;
    setStatus('Preparing PDF…');
    try{
      const bytes=(window as WindowPdf).__pdfBytes;if(!bytes){setStatus('Please reopen the PDF before exporting.');return}
      const sourceTextEdits=objects.filter((o):o is TextObject=>o.type==='text'&&!!o.sourceSpanId&&!!o.sourceBBox&&(
        o.originalText!==o.text ||
        o.x!==o.sourceBBox[0] || o.y!==o.sourceBBox[1] ||
        o.width!==(o.sourceBBox[2]-o.sourceBBox[0]) || o.height!==(o.sourceBBox[3]-o.sourceBBox[1]) ||
        o.fontSize!==(o.sourceFontSize??o.fontSize) || o.color!==(o.sourceColor??o.color)
      ));
      let workingBytes=bytes;
      if(sourceTextEdits.length){
        if(!backendReady){setStatus('Start the local PDF backend to export existing-text edits accurately.');return}
        setStatus(`Applying ${sourceTextEdits.length} text edit${sourceTextEdits.length===1?'':'s'}…`);
        const edits:TextReplacementEdit[]=sourceTextEdits.map(o=>({pageIndex:o.pageIndex,sourceBBox:o.sourceBBox!,targetBBox:[o.x,o.y,o.x+o.width,o.y+o.height],text:o.text,font:o.sourceFont||'',size:o.fontSize,color:hexToInt(o.color)}));
        const result=await replaceTextSpans(new Blob([bytes],{type:'application/pdf'}),edits);workingBytes=new Uint8Array(await result.arrayBuffer());
      }
      const doc=await PDFDocument.load(workingBytes);const font=await doc.embedFont(StandardFonts.Helvetica);
      for(const o of objects){
        const page=doc.getPage(o.pageIndex);const y=page.getHeight()-o.y-o.height;
        if(o.type==='text'){
          if(o.sourceSpanId)continue;
          page.drawText(o.text,{x:o.x,y,size:o.fontSize,font,color:hexToRgb(o.color),maxWidth:o.width});
        }else if(o.type==='highlight')page.drawRectangle({x:o.x,y,width:o.width,height:o.height,color:hexToRgb(o.color),opacity:o.opacity,borderWidth:0});
        else if(o.type==='shape')page.drawRectangle({x:o.x,y,width:o.width,height:o.height,color:hexToRgb(o.fill),borderColor:hexToRgb(o.stroke),borderWidth:o.strokeWidth,rotate:degrees(o.rotation)});
        else{const img=o.dataUrl.startsWith('data:image/png')?await doc.embedPng(o.dataUrl):await doc.embedJpg(o.dataUrl);page.drawImage(img,{x:o.x,y,width:o.width,height:o.height,rotate:degrees(o.rotation)})}
      }
      const out=await doc.save({useObjectStreams:true});const url=URL.createObjectURL(new Blob([out as BlobPart],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=fileName.replace(/\.pdf$/i,'')+'-edited.pdf';a.click();URL.revokeObjectURL(url);setStatus(sourceTextEdits.length?'High-fidelity PDF exported':'PDF exported locally');
    }catch(e){console.error(e);setStatus(e instanceof Error?`Export failed: ${e.message}`:'Export failed. The original document was not modified.')}
  },[pdf,objects,fileName,backendReady]);

  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();fileRef.current?.click()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void exportPdf()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoAction():undoAction()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoAction()}if(e.key==='Delete'&&selectedId){snapshot();remove(selectedId)}if(e.key==='Escape')select(null)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[exportPdf,redoAction,undoAction,selectedId,snapshot,remove,select]);
  useEffect(()=>{if(!pdf)return;const obs=new IntersectionObserver(es=>{const v=es.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(v)setCurrentPage(Number((v.target as HTMLElement).dataset.page))},{root:scrollerRef.current,threshold:[.25,.6,.9]});pageRefs.current.forEach(e=>e&&obs.observe(e));return()=>obs.disconnect()},[pdf,pages.length,zoom]);

  const addImage=(file:File)=>{const reader=new FileReader();reader.onload=()=>{snapshot();add({id:makeId(),type:'image',pageIndex:currentPage,x:50,y:50,width:220,height:160,rotation:0,dataUrl:String(reader.result)})};reader.readAsDataURL(file)};
  const addExistingText=(span:TextSpan)=>{const existing=objects.find(o=>o.type==='text'&&o.sourceSpanId===span.id);if(existing){select(existing.id);return}snapshot();add({id:makeId(),type:'text',pageIndex:span.pageIndex,x:span.bbox[0],y:span.bbox[1],width:Math.max(12,span.bbox[2]-span.bbox[0]),height:Math.max(12,span.bbox[3]-span.bbox[1]),rotation:0,text:span.text,fontSize:span.size||11,color:intColorToHex(span.color),sourceSpanId:span.id,originalText:span.text,sourceFont:span.font,sourceFontSize:span.size||11,sourceColor:intColorToHex(span.color),sourceBBox:span.bbox})};
  const zoomBy=(d:number)=>setZoom(z=>Math.min(4,Math.max(.25,Math.round((z+d)*100)/100)));

  return <div className={dark?'app dark':'app'}>
    <input ref={fileRef} hidden type="file" accept="application/pdf,.pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void openFile(f);e.currentTarget.value=''}}/>
    <input ref={imageRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)addImage(f);e.currentTarget.value=''}}/>
    <header className="topbar"><div className="brand"><div className="brandMark"><FileText size={18}/></div><span>PDF Editor</span>{backendReady&&<span className="engineBadge">LOCAL ENGINE</span>}</div><button className="menuBtn" onClick={()=>fileRef.current?.click()}><FilePlus2 size={17}/> Open PDF</button><div className="topActions"><IconButton label="Undo" onClick={undoAction}><Undo2/></IconButton><IconButton label="Redo" onClick={redoAction}><Redo2/></IconButton><div className="divider"/><button className="saveBtn" onClick={()=>void exportPdf()} disabled={!pdf}><Download size={16}/> Export PDF</button><button className="themeBtn" onClick={()=>setDark(v=>!v)}>{dark?'Light':'Dark'}</button></div></header>
    <div className="toolbar"><ToolButton active={tool==='select'} label="Select" onClick={()=>setTool('select')}><MousePointer2/></ToolButton><ToolButton active={tool==='text'} label="Text" onClick={()=>setTool('text')}><Type/></ToolButton><ToolButton active={tool==='highlight'} label="Highlight" onClick={()=>setTool('highlight')}><Highlighter/></ToolButton><ToolButton active={tool==='draw'} label="Draw" onClick={()=>setTool('draw')}><PenLine/></ToolButton><ToolButton active={tool==='shape'} label="Shape" onClick={()=>setTool('shape')}><Square/></ToolButton><ToolButton active={tool==='image'} label="Image" onClick={()=>imageRef.current?.click()}><ImagePlus/></ToolButton><div className="toolbarSpacer"/><button className="searchBtn" onClick={()=>setSearchOpen(v=>!v)}><Search size={17}/> Search</button></div>
    <main className="workspace"><aside className="sidebar"><div className="sideTitle"><span>Pages</span><span className="count">{pages.length}</span></div><div className="thumbs">{pages.map(p=><button key={p.index} className={p.index===currentPage?'thumb active':'thumb'} onClick={()=>pageRefs.current[p.index]?.scrollIntoView({behavior:'smooth',block:'center'})}><PageThumb pdf={pdf} index={p.index}/><span>{p.index+1}</span></button>)}</div></aside>
      <section className="canvasArea" ref={scrollerRef}>{!pdf?<EmptyState onOpen={()=>fileRef.current?.click()}/>:<div className="pageStack">{pages.map(p=><PDFPage key={p.index} pdf={pdf} page={p} zoom={zoom} pageRef={el=>{pageRefs.current[p.index]=el}} tool={tool} objects={objects.filter(o=>o.pageIndex===p.index)} textSpans={textSpans.filter(s=>s.pageIndex===p.index)} selectedId={selectedId} onSelect={select} onExistingText={addExistingText} onAdd={o=>{snapshot();add(o)}} onUpdate={update}/>)}</div>}</section>
      <aside className="properties"><div className="sideTitle">Properties</div>{selected?<Properties object={selected} onChange={p=>{snapshot();update(selected.id,p)}}/>:<div className="emptyProps"><MousePointer2 size={20}/><p>Select an object or click existing PDF text.</p><small>{backendReady?'Existing text is editable through the local PDF engine.':'Start the local backend for structural existing-text edits.'}</small></div>}</aside>
    </main>
    <footer className="statusbar"><span>{status}</span><span>Page {pdf?currentPage+1:0} / {pages.length}</span><div className="zoom"><button onClick={()=>zoomBy(-.1)}><ZoomOut size={15}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>zoomBy(.1)}><ZoomIn size={15}/></button></div></footer>
    {searchOpen&&<SearchPanel query={query} setQuery={setQuery} pdf={pdf} onClose={()=>setSearchOpen(false)} onJump={p=>pageRefs.current[p]?.scrollIntoView({behavior:'smooth',block:'center'})}/>}</div>
}

function PDFPage({pdf,page,zoom,pageRef,tool,objects,textSpans,selectedId,onSelect,onExistingText,onAdd,onUpdate}:{pdf:PDFDocumentProxy;page:PageState;zoom:number;pageRef:(el:HTMLDivElement|null)=>void;tool:Tool;objects:EditorObject[];textSpans:TextSpan[];selectedId:string|null;onSelect:(id:string|null)=>void;onExistingText:(s:TextSpan)=>void;onAdd:(o:EditorObject)=>void;onUpdate:(id:string,p:Partial<EditorObject>)=>void}){
 const canvasRef=useRef<HTMLCanvasElement>(null);const [rendered,setRendered]=useState(false);
 useEffect(()=>{let cancelled=false;(async()=>{const p=await pdf.getPage(page.index+1),viewport=p.getViewport({scale:zoom*window.devicePixelRatio}),canvas=canvasRef.current;if(!canvas||cancelled)return;canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.width=`${viewport.width/window.devicePixelRatio}px`;canvas.style.height=`${viewport.height/window.devicePixelRatio}px`;await p.render({canvasContext:canvas.getContext('2d')!,viewport}).promise;if(!cancelled)setRendered(true)})();return()=>{cancelled=true}},[pdf,page.index,zoom]);
 const cssW=page.width*zoom,cssH=page.height*zoom;
 const click=(e:React.MouseEvent<HTMLDivElement>)=>{if(tool==='select')return;const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/zoom,y=(e.clientY-r.top)/zoom;if(tool==='text')onAdd({id:makeId(),type:'text',pageIndex:page.index,x,y,width:180,height:24,rotation:0,text:'Type here',fontSize:14,color:'#111111'});else if(tool==='highlight')onAdd({id:makeId(),type:'highlight',pageIndex:page.index,x,y,width:160,height:18,rotation:0,color:'#facc15',opacity:.35});else if(tool==='shape')onAdd({id:makeId(),type:'shape',pageIndex:page.index,x,y,width:160,height:90,rotation:0,stroke:'#111827',fill:'#ffffff00',strokeWidth:1.5})};
 return <div className="pageShell" ref={pageRef} data-page={page.index}><div className="pdfPage" style={{width:cssW,height:cssH}} onClick={click}><canvas ref={canvasRef}/>{!rendered&&<div className="pageLoading">Rendering…</div>}<div className="textSpanLayer">{tool==='select'&&textSpans.map(s=><button key={s.id} className="textSpan" style={{left:s.bbox[0]*zoom,top:s.bbox[1]*zoom,width:Math.max(4,(s.bbox[2]-s.bbox[0])*zoom),height:Math.max(8,(s.bbox[3]-s.bbox[1])*zoom)}} title={`Edit “${s.text}”`} onClick={e=>{e.stopPropagation();onExistingText(s)}}>{s.text}</button>)}</div><div className="objectLayer">{objects.map(o=><EditorObjectView key={o.id} object={o} zoom={zoom} selected={o.id===selectedId} onSelect={onSelect} onUpdate={onUpdate}/>)}</div></div></div>
}

function EditorObjectView({object:o,zoom,selected,onSelect,onUpdate}:{object:EditorObject;zoom:number;selected:boolean;onSelect:(id:string)=>void;onUpdate:(id:string,p:Partial<EditorObject>)=>void}){
 const [drag,setDrag]=useState<{sx:number;sy:number;ox:number;oy:number}|null>(null);useEffect(()=>{if(!drag)return;const move=(e:MouseEvent)=>onUpdate(o.id,{x:drag.ox+(e.clientX-drag.sx)/zoom,y:drag.oy+(e.clientY-drag.sy)/zoom}),up=()=>setDrag(null);window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);return()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)}},[drag,o.id,zoom,onUpdate]);
 const style={left:o.x*zoom,top:o.y*zoom,width:o.width*zoom,height:o.height*zoom,transform:`rotate(${o.rotation}deg)`,transformOrigin:'center',position:'absolute' as const};const common={className:selected?'editorObject selected':'editorObject',style,onMouseDown:(e:React.MouseEvent)=>{e.stopPropagation();onSelect(o.id);setDrag({sx:e.clientX,sy:e.clientY,ox:o.x,oy:o.y})}};
 if(o.type==='text')return <div {...common}><textarea value={o.text} onChange={e=>onUpdate(o.id,{text:e.target.value})} style={{fontSize:o.fontSize*zoom,color:o.color,fontFamily:fontFamilyFor(o.sourceFont)}} onMouseDown={e=>e.stopPropagation()}/><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
 if(o.type==='highlight')return <div {...common} style={{...style,background:o.color,opacity:o.opacity}}><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
 if(o.type==='shape')return <div {...common} style={{...style,border:`${o.strokeWidth*zoom}px solid ${o.stroke}`,background:o.fill}}><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
 return <div {...common}><img src={o.dataUrl} alt="Inserted" draggable={false}/><ResizeHandle o={o} zoom={zoom} onUpdate={onUpdate}/></div>;
}
function ResizeHandle({o,zoom,onUpdate}:{o:EditorObject;zoom:number;onUpdate:(id:string,p:Partial<EditorObject>)=>void}){const start=useRef<{x:number;y:number;w:number;h:number}|null>(null);return <span className="resizeHandle" onMouseDown={e=>{e.stopPropagation();start.current={x:e.clientX,y:e.clientY,w:o.width,h:o.height};const move=(ev:MouseEvent)=>{if(!start.current)return;onUpdate(o.id,{width:Math.max(20,start.current.w+(ev.clientX-start.current.x)/zoom),height:Math.max(10,start.current.h+(ev.clientY-start.current.y)/zoom)})};const up=()=>{start.current=null;window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)};window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)}}/>}
function Properties({object:o,onChange}:{object:EditorObject;onChange:(p:Partial<EditorObject>)=>void}){return <div className="propsForm"><label>Type<input value={o.type} disabled/></label>{o.type==='text'&&<><label>Text<textarea value={o.text} onChange={e=>onChange({text:e.target.value})}/></label><label>Font size<input type="number" min="1" value={o.fontSize} onChange={e=>onChange({fontSize:Math.max(1,Number(e.target.value))})}/></label><label>Color<input type="color" value={o.color} onChange={e=>onChange({color:e.target.value})}/></label>{o.sourceSpanId&&<div className="precisionNote">Existing PDF text · source font: {o.sourceFont||'unknown'}<br/>Export removes the original span and inserts replacement text through PyMuPDF.</div>}</>}<div className="two"><label>X<input type="number" step=".01" value={round(o.x)} onChange={e=>onChange({x:Number(e.target.value)})}/></label><label>Y<input type="number" step=".01" value={round(o.y)} onChange={e=>onChange({y:Number(e.target.value)})}/></label></div><div className="two"><label>Width<input type="number" step=".01" value={round(o.width)} onChange={e=>onChange({width:Number(e.target.value)})}/></label><label>Height<input type="number" step=".01" value={round(o.height)} onChange={e=>onChange({height:Number(e.target.value)})}/></label></div><label>Rotation<input type="number" step=".1" value={round(o.rotation)} onChange={e=>onChange({rotation:Number(e.target.value)})}/></label></div>}
function SearchPanel({query,setQuery,pdf,onClose,onJump}:{query:string;setQuery:(v:string)=>void;pdf:PDFDocumentProxy|null;onClose:()=>void;onJump:(p:number)=>void}){const[hits,setHits]=useState<{page:number;text:string}[]>([]);useEffect(()=>{let live=true;(async()=>{if(!pdf||!query.trim()){setHits([]);return}const a:{page:number;text:string}[]=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),c=await p.getTextContent(),text=c.items.map(x=>'str'in x?x.str:'').join(' ');if(text.toLowerCase().includes(query.toLowerCase()))a.push({page:i-1,text:text.slice(0,180)})}if(live)setHits(a)})();return()=>{live=false}},[pdf,query]);return <div className="searchPanel"><div className="searchHead"><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search document…"/><button onClick={onClose}>×</button></div>{hits.map(h=><button key={h.page} className="hit" onClick={()=>onJump(h.page)}><b>Page {h.page+1}</b><span>{h.text}</span></button>)}{query&&hits.length===0&&<div className="noHits">No matches</div>}</div>}
function PageThumb({pdf,index}:{pdf:PDFDocumentProxy|null;index:number}){const ref=useRef<HTMLCanvasElement>(null);useEffect(()=>{if(!pdf)return;let dead=false;(async()=>{const p=await pdf.getPage(index+1),v=p.getViewport({scale:.16}),c=ref.current;if(!c||dead)return;c.width=v.width*2;c.height=v.height*2;c.style.width=`${v.width}px`;c.style.height=`${v.height}px`;await p.render({canvasContext:c.getContext('2d')!,viewport:p.getViewport({scale:.32})}).promise})();return()=>{dead=true}},[pdf,index]);return <canvas ref={ref}/>}
function EmptyState({onOpen}:{onOpen:()=>void}){return <div className="empty"><div className="emptyIcon"><FileText size={34}/></div><h1>Edit PDFs locally</h1><p>Open a PDF and work on text, images, highlights and shapes without uploading your document.</p><button className="primary" onClick={onOpen}><FilePlus2 size={18}/> Open PDF</button><span>Files stay in your browser.</span></div>}
function ToolButton({active,label,onClick,children}:{active:boolean;label:string;onClick:()=>void;children:React.ReactNode}){return <button className={active?'tool active':'tool'} onClick={onClick} title={label}>{children}<span>{label}</span></button>}
function IconButton({label,onClick,children}:{label:string;onClick:()=>void;children:React.ReactNode}){return <button className="iconBtn" title={label} onClick={onClick}>{children}</button>}
function round(v:number){return Math.round(v*100)/100}
function hexToRgb(hex:string){const h=hex.replace('#',''),n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)}
function hexToInt(hex:string){const h=hex.replace('#','');const normalized=h.length===3?h.split('').map(x=>x+x).join(''):h;return parseInt(normalized,16)>>>0}
function intColorToHex(color:number){const n=color>>>0;return `#${((n>>16)&255).toString(16).padStart(2,'0')}${((n>>8)&255).toString(16).padStart(2,'0')}${(n&255).toString(16).padStart(2,'0')}`}
function fontFamilyFor(name?:string){const n=(name||'').toLowerCase();if(n.includes('mono')||n.includes('courier'))return 'monospace';if(n.includes('serif')||n.includes('times'))return 'Georgia, serif';return 'Helvetica, Arial, sans-serif'}
