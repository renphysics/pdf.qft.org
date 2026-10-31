import { inspectPdf, buildPdf, parsePageRange, cropMarginsForRotation } from './pdf-engine.js';
import { planSplit, splitPdf, createZip, normalizePreset, safeBaseName } from './workflows.js';
import { initBatch } from './batch-ui.js';

// Resolve assets beside this module, including GitHub Pages project subpaths.
const assetUrl = path => new URL(path, import.meta.url).href;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const safe = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const uid = () => 'f-' + [...crypto.getRandomValues(new Uint32Array(4))].map(value=>value.toString(36)).join('-');
const emptyState = () => ({sources:[],pages:[],annotations:[],watermark:null,headerFooter:null,pageNumbers:null});
let state = emptyState();
const ui = {tool:'text',activeId:null,selected:new Set(),zoom:1,history:[],initial:null,pdf:null,pdfjs:null,bytes:null,renderToken:0,thumbToken:0,previewPageId:null,thumbObserver:null,thumbRenderTask:null,thumbCleanup:null,busy:false,dirty:false,append:false,pending:new Set(),drafts:{},image:null,dragId:null,toastTimer:null,splitResults:null,cancelOperation:false,lastCropPreset:null};
const names = {text:'Add text',image:'Add an image',highlight:'Highlight',watermark:'Watermark',footer:'Headers & footers',numbers:'Page numbers',pages:'Organize pages',merge:'Merge PDFs',delete:'Delete Pages',crop:'Crop PDF',split:'Split PDF'};
const defaults = {
  text:{text:'',size:18,color:'#244e41',x:10,y:15},
  image:{width:25,x:10,y:15},
  highlight:{color:'#f6ce53',opacity:35,x:10,y:20,width:60,height:4},
  watermark:{text:'DRAFT',size:48,color:'#7c8c76',opacity:18,angle:-35,position:'center',scope:'all'},
  footer:{headerLeft:'',headerCenter:'',headerRight:'',footerLeft:'',footerCenter:'',footerRight:'',size:10,color:'#53635d',margin:28,scope:'all'},
  numbers:{format:'Page {page} of {total}',start:1,size:10,color:'#53635d',margin:28,position:'bottom-right',scope:'all'},
  pages:{range:''},merge:{},delete:{range:''},crop:{left:0,top:0,right:0,bottom:0,scope:'current'},split:{mode:'each',size:2,ranges:''}
};
const descriptions = {
  text:'Add a note or label. Click the page to choose a position, or use the position sliders.',
  image:'Place a PNG or JPG on the current page. Your image keeps its original proportions.',
  highlight:'Add a translucent highlight. Click the page to choose its top-left corner.',
  watermark:'A repeated text mark, as bold or as subtle as you like.',
  footer:'Put the same details in a consistent place on your pages.',
  numbers:'Give your document an easy-to-follow sequence.',
  pages:'Choose pages in the strip. Drag to reorder, or use the arrow buttons.',
  merge:'Add PDF files, then arrange their pages in the strip.',
  delete:'Select the pages to remove using their checkboxes or enter a page range. Undo brings them back.',
  crop:'Drag a rectangle on the preview to keep that area, or set the margins below.',
  split:'Create separate PDFs from this document. Applied edits and printed page numbers stay exactly as previewed.'
};

function snapshot(current=state) {
  return {sources:[...current.sources],pages:current.pages.map(p=>({...p,crop:p.crop?{...p.crop}:undefined})),annotations:current.annotations.map(a=>({...a,pageCrop:a.pageCrop?{...a.pageCrop}:undefined})),watermark:current.watermark?{...current.watermark,pages:Array.isArray(current.watermark.pages)?[...current.watermark.pages]:current.watermark.pages}:null,headerFooter:current.headerFooter?{...current.headerFooter,pages:Array.isArray(current.headerFooter.pages)?[...current.headerFooter.pages]:current.headerFooter.pages}:null,pageNumbers:current.pageNumbers?{...current.pageNumbers,pages:Array.isArray(current.pageNumbers.pages)?[...current.pageNumbers.pages]:current.pageNumbers.pages}:null};
}
function busy(value, message='Working on your PDF…') {
  ui.busy=value;if(!value)$('#busy-cancel').hidden=true; $('#busy-overlay').hidden=!value; $('#busy-message').textContent=message;
  $('#download-button').disabled=value; $('#main').setAttribute('aria-busy',String(value)); $('#main').inert=value; $('.site-header').inert=value;
}
function toast(message,error=false) {
  clearTimeout(ui.toastTimer); const node=$('#toast'); node.textContent=message; node.classList.toggle('error',error); node.hidden=false;
  ui.toastTimer=setTimeout(()=>{node.hidden=true;},error?8500:4500);
}
function friendly(error) { console.error(error); return error?.message || 'That did not work. Please try a different PDF.'; }
function activeIndex() { const index=state.pages.findIndex(p=>p.id===ui.activeId); return index<0?0:index; }
function currentPage() { return state.pages[activeIndex()]; }
function formatSize(bytes) { return bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB'; }
function makeField(label, input, wide=false) { return '<label class="field'+(wide?' wide':'')+'"><span>'+label+'</span>'+input+'</label>'; }
function textField(label,name,placeholder='',wide=false) { return makeField(label,'<input name="'+name+'" type="text" maxlength="300" placeholder="'+placeholder+'">',wide); }
function numberField(label,name,min,max,step=1) { return makeField(label,'<input name="'+name+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" required>'); }
function colorField(name='color') { return makeField('Color','<input name="'+name+'" type="color" aria-label="Choose color">'); }
function rangeField(label,name,min,max,unit='%') { return makeField(label+' <output data-for="'+name+'"></output>','<input name="'+name+'" type="range" min="'+min+'" max="'+max+'" step="1" data-unit="'+unit+'">'); }
function selectField(label,name,options,wide=false) { return makeField(label,'<select name="'+name+'">'+options.map(([value,text])=>'<option value="'+value+'">'+text+'</option>').join('')+'</select>',wide); }
function scopeField() { const options=[['all','Every page'],['current','Current page'],['selected','Selected pages']]; if(draft().savedPages?.length)options.push(['saved','Previously applied pages']);return selectField('Apply to','scope',options,true); }
function positionFields() { return '<div class="field-section">POSITION ON THIS PAGE</div>'+rangeField('From left','x',0,90)+rangeField('From top','y',0,90); }
function applyButton(label) { return '<button class="button primary" type="submit">'+icon('check')+label+'</button>'; }
function readDraft() {
  const form=$('#tool-form'); if(!form)return;
  ui.drafts[ui.tool]={...ui.drafts[ui.tool],...Object.fromEntries(new FormData(form).entries())};
}
function draft() { return {...defaults[ui.tool],...(ui.drafts[ui.tool]||{})}; }
function appliedDraft(tool) {
  if(tool==='watermark'&&state.watermark)return {...state.watermark,opacity:state.watermark.opacity*100,scope:state.watermark.pages==='all'?'all':'saved',savedPages:Array.isArray(state.watermark.pages)?[...state.watermark.pages]:null};
  if(tool==='footer'&&state.headerFooter)return {...state.headerFooter,scope:state.headerFooter.pages==='all'?'all':'saved',savedPages:Array.isArray(state.headerFooter.pages)?[...state.headerFooter.pages]:null};
  if(tool==='numbers'&&state.pageNumbers)return {...state.pageNumbers,scope:state.pageNumbers.pages==='all'?'all':'saved',savedPages:Array.isArray(state.pageNumbers.pages)?[...state.pageNumbers.pages]:null};
  return {...defaults[tool]};
}
function renderTool() {
  if(!ui.drafts[ui.tool])ui.drafts[ui.tool]=appliedDraft(ui.tool);
  $$('.editor-tools button').forEach(button=>{const active=button.dataset.tool===ui.tool;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('#tool-select').value=ui.tool;
  const p=currentPage(), index=activeIndex();
  let fields='';
  if(ui.tool==='text')fields=makeField('Your text','<textarea name="text" maxlength="1000" placeholder="A note, a name, a little context…" required></textarea>',true)+'<div class="field-row">'+numberField('Text size (pt)','size',6,96)+colorField()+'</div>'+positionFields()+applyButton('Add text to page '+(index+1));
  if(ui.tool==='image')fields='<div class="file-chosen">'+(ui.image?safe(ui.image.name):'PNG or JPG · up to 15 MB')+'</div><button type="button" class="button secondary" data-action="choose-image">'+icon('image')+(ui.image?'Choose another image':'Choose an image')+'</button>'+rangeField('Image width','width',5,90)+positionFields()+applyButton('Add image to page '+(index+1));
  if(ui.tool==='highlight')fields='<div class="field-row">'+colorField()+rangeField('Opacity','opacity',5,80)+'</div>'+rangeField('Width','width',2,95)+rangeField('Height','height',1,30)+positionFields()+applyButton('Highlight page '+(index+1));
  if(ui.tool==='watermark')fields=textField('Watermark text','text','e.g. DRAFT',true)+'<div class="field-row">'+numberField('Text size (pt)','size',8,150)+colorField()+'</div>'+rangeField('Opacity','opacity',3,100)+rangeField('Angle','angle',-90,90,'°')+selectField('Position','position',[['center','Center of page'],['top','Top of page'],['bottom','Bottom of page']])+scopeField()+applyButton('Apply watermark')+(state.watermark?'<button type="button" class="button subtle" data-action="remove-watermark">Remove watermark</button>':'');
  if(ui.tool==='footer')fields='<div class="scope-note">Use <strong>{page}</strong> and <strong>{total}</strong> for automatic page numbering.</div><div class="field-section">HEADER</div>'+textField('Left','headerLeft','e.g. Project name')+textField('Center','headerCenter')+textField('Right','headerRight')+'<div class="field-section">FOOTER</div>'+textField('Left','footerLeft','e.g. Your name')+textField('Center','footerCenter','e.g. © Your organization')+textField('Right','footerRight','e.g. Page {page}')+'<div class="field-row">'+numberField('Text size (pt)','size',6,24)+colorField()+'</div>'+numberField('Edge margin (pt)','margin',12,100)+scopeField()+applyButton('Apply headers & footers')+(state.headerFooter?'<button type="button" class="button subtle" data-action="remove-footer">Remove headers & footers</button>':'');
  if(ui.tool==='numbers')fields=textField('Number format','format','Page {page} of {total}',true)+'<div class="scope-note"><strong>{page}</strong> is the page number. <strong>{total}</strong> is the document page count.</div>'+selectField('Position','position',[['bottom-right','Bottom right'],['bottom-center','Bottom center'],['bottom-left','Bottom left']],true)+'<div class="field-row">'+numberField('Start numbering at','start',1,100000)+numberField('Text size (pt)','size',6,24)+'</div><div class="field-row">'+colorField()+numberField('Edge margin (pt)','margin',12,100)+'</div>'+scopeField()+applyButton('Apply page numbers')+(state.pageNumbers?'<button type="button" class="button subtle" data-action="remove-numbers">Remove page numbers</button>':'');
  if(ui.tool==='pages')fields='<div class="scope-note"><strong>'+ui.selected.size+' of '+state.pages.length+' pages selected.</strong> Select pages with the checkboxes beneath each thumbnail.</div><div class="selection-buttons"><button type="button" data-action="select-all">Select all</button><button type="button" data-action="select-none">Clear selection</button></div>'+textField('Select page numbers','range','e.g. 1-3, 5',true)+'<button type="button" class="button secondary" data-action="select-range">Select range</button><div class="field-section">SELECTED PAGES</div><div class="mini-actions"><button type="button" class="button secondary" data-action="rotate">'+icon('rotate')+'Rotate 90°</button><button type="button" class="button danger" data-action="delete-pages">'+icon('trash')+'Remove</button></div><button type="button" class="button secondary" data-action="extract">'+icon('download')+'Download selected pages</button><div class="field-section">CURRENT PAGE · '+(index+1)+'</div><div class="mini-actions"><button type="button" class="button secondary" data-action="move-earlier">'+icon('up')+'Move earlier</button><button type="button" class="button secondary" data-action="move-later">'+icon('down')+'Move later</button></div>';
  if(ui.tool==='delete')fields='<div class="scope-note"><strong>'+ui.selected.size+' of '+state.pages.length+' pages selected for deletion.</strong><br>'+(state.pages.length-ui.selected.size)+' pages will remain.</div><div class="selection-buttons"><button type="button" data-action="select-all">Select all</button><button type="button" data-action="select-none">Clear selection</button></div>'+textField('Page numbers to delete','range','e.g. 2, 4-6',true)+'<button type="button" class="button secondary" data-action="select-range">Select range</button><p class="field-hint wide">Numbers follow the current page order. Checked thumbnails are the pages to delete.</p><button type="button" class="button danger" data-action="delete-pages"'+(!ui.selected.size||ui.selected.size===state.pages.length?' disabled':'')+'>'+icon('trash')+'Delete '+ui.selected.size+' selected page'+(ui.selected.size===1?'':'s')+'</button><p class="field-hint wide">'+(ui.selected.size===state.pages.length?'Keep at least one page. Deselect a page to continue.':'After deleting, choose Download PDF to save your copy.')+'</p>';
  if(ui.tool==='crop')fields='<div class="scope-note">Margins are percentages of each page’s <strong>current visible area</strong>. The outlined area is kept.</div><div class="field-row">'+numberField('Top (%)','top',0,99,.1)+numberField('Bottom (%)','bottom',0,99,.1)+'</div><div class="field-row">'+numberField('Left (%)','left',0,99,.1)+numberField('Right (%)','right',0,99,.1)+'</div>'+selectField('Apply to','scope',[['current','Current page'],['all','Every page'],['selected','Selected pages']],true)+'<p id="crop-summary" class="field-hint wide" aria-live="polite"></p>'+applyButton('Apply crop')+'<button type="button" class="button secondary" data-action="clear-crop-margins">Clear margins</button><button type="button" class="button subtle" data-action="restore-crop">Restore original crop for scope</button><p class="field-hint wide">Cropping hides content outside the boundary; it does not securely remove it. Text and graphics keep their original quality.</p>';
  if(ui.tool==='merge')fields='<div class="file-list">'+state.sources.filter(source=>state.pages.some(page=>page.sourceId===source.id)).map(source=>'<div class="file-list-item"><strong>'+safe(source.name)+'</strong>'+source.pageCount+' pages · '+formatSize(source.bytes.length)+'</div>').join('')+'</div><button type="button" class="button primary" data-action="add-files">'+icon('plus')+'Add another PDF</button><div class="scope-note">New pages are added at the end. Use <strong>Organize pages</strong> to change their order, then download the combined PDF.</div><button type="button" class="button secondary" data-action="organize">'+icon('pages')+'Organize pages</button>';
  if(ui.tool==='split')fields=splitFields();
  if(['watermark','footer','numbers','crop'].includes(ui.tool))fields+='<div class="reuse-settings wide"><button type="button" class="text-button" data-action="batch-from-editor">'+icon('batch')+(ui.tool==='crop'&&!ui.pending.has('crop')&&ui.lastCropPreset?'Reuse last applied crop in batch':'Use these settings in batch')+'</button><p>Apply this tool to every page in separate PDFs, and save it as a preset.</p></div>';
  $('#tool-panel').innerHTML='<h2>'+names[ui.tool]+'</h2><p class="panel-description">'+descriptions[ui.tool]+'</p><form id="tool-form">'+fields+'</form><div id="pending-actions" class="field-hint" hidden>Settings not applied. <button class="text-button" type="button" data-action="discard-draft">Discard changes</button></div><div id="annotation-list"></div>';
  const values=draft();
  $$('[name]',$('#tool-form')).forEach(input=>{if(values[input.name]!==undefined)input.value=values[input.name];});
  $('#tool-form').addEventListener('submit',event=>{event.preventDefault();if(['delete','pages'].includes(ui.tool))action('select-range');else if(ui.tool==='split')generateSplit();else applyCurrent();});
  $('#tool-form').addEventListener('input',event=>{
    readDraft(); updateOutputs();
    if(ui.tool==='split'){ui.splitResults=null;$('#split-results')?.replaceChildren();updateSplitSummary();}
    if(!['pages','merge','delete','split'].includes(ui.tool)){ui.pending.add(ui.tool);updatePending();}
    if(['x','y','width','height'].includes(event.target.name))updateMarker();
    if(ui.tool==='crop')updateCropOverlay();
  });
  $('#tool-form').addEventListener('change',()=>{readDraft();updateOutputs();if(ui.tool==='split')updateSplitSummary();});
  updateOutputs(); updateMarker(); updatePending(); renderAnnotations(); updateCropOverlay(); updateDeletionMarks();if(ui.tool==='split')updateSplitSummary();
  if(p)$('#selection-caption').textContent='Page '+(index+1)+' · '+ui.selected.size+' selected';
}
function updateOutputs() {
  $$('input[type=range]',$('#tool-form')).forEach(input=>{const output=$('output[data-for="'+input.name+'"]',$('#tool-form'));if(output)output.textContent=input.value+(input.dataset.unit||'');});
}
function updatePending() {
  $('#pending-badge').hidden=ui.pending.size===0;
  const pending=$('#pending-actions');if(pending)pending.hidden=!ui.pending.has(ui.tool);
  const status=$('#preview-status');
  if(ui.pending.has(ui.tool))status.textContent='Choose Apply / Add to update the document preview.';
  else status.innerHTML=icon('check')+(ui.dirty?'Preview matches your applied edits.':'Your document, ready for a little finishing touch.');
}
function updateMarker() {
  const placing=['text','image','highlight'].includes(ui.tool)&&state.pages.length>0;
  $('#page-surface').classList.toggle('placing',placing);const marker=$('#placement-marker');marker.hidden=!placing;
  if(placing){const values=draft();marker.style.left=Number(values.x)+'%';marker.style.top=Number(values.y)+'%';}
}
function cropValues() {
  const values=draft();
  const margins=Object.fromEntries(['left','top','right','bottom'].map(edge=>[edge,Number(values[edge])/100]));
  if(Object.values(margins).some(value=>!Number.isFinite(value)||value<0||value>=1)||margins.left+margins.right>=.99||margins.top+margins.bottom>=.99)throw new Error('Keep more than 1% of the width and height. Reduce the crop margins.');
  return margins;
}
function updateCropOverlay() {
  const overlay=$('#crop-overlay'), enabled=ui.tool==='crop'&&state.pages.length>0;
  overlay.hidden=!enabled;$('#page-surface').classList.toggle('cropping',enabled);
  if(!enabled)return;
  const summary=$('#crop-summary');
  try{
    const crop=cropValues();
    overlay.style.inset=[crop.top,crop.right,crop.bottom,crop.left].map(value=>value*100+'%').join(' ');
    if(summary)summary.textContent='Keep '+((1-crop.left-crop.right)*100).toFixed(1)+'% of width × '+((1-crop.top-crop.bottom)*100).toFixed(1)+'% of height.';
  }catch(error){overlay.hidden=true;if(summary)summary.textContent=error.message;}
}
function updateDeletionMarks() {
  $$('.page-item').forEach(item=>{const deleting=ui.tool==='delete'&&ui.selected.has(item.dataset.pageId);item.classList.toggle('marked-delete',deleting);const badge=$('.delete-badge',item);if(badge)badge.hidden=!deleting;});
}
function renderAnnotations() {
  const annotations=state.annotations.filter(a=>a.pageId===ui.activeId);
  const node=$('#annotation-list');if(!node)return;
  if(!annotations.length){node.innerHTML='';return;}
  node.innerHTML='<div class="annotation-list"><strong>ADDED ON THIS PAGE</strong>'+annotations.map(a=>'<div class="annotation-item"><span>'+safe(a.type==='text'?a.text:a.type==='image'?'Image':'Highlight')+'</span><button type="button" class="icon-button" data-remove-annotation="'+a.id+'" aria-label="Remove '+safe(a.type)+' annotation">'+icon('trash')+'</button></div>').join('')+'</div>';
}
function scopedPages(value) {
  if(value==='all')return 'all';
  if(value==='saved'){const ids=(draft().savedPages||[]).filter(id=>state.pages.some(p=>p.id===id));if(!ids.length)throw new Error('The previously targeted pages were removed. Choose a new page scope.');return ids;}
  if(value==='current')return [ui.activeId];
  const ids=state.pages.filter(p=>ui.selected.has(p.id)).map(p=>p.id);
  if(!ids.length)throw new Error('Select at least one page in the page strip, or choose Every page.');
  return ids;
}
async function applyCurrent() {
  if(ui.busy)return;readDraft();
  const values=draft(),tool=ui.tool,page=currentPage();if(!page)return;
  if(!$('#tool-form').reportValidity())return;
  try{
    let update;
    if(tool==='text'){
      if(!values.text.trim())throw new Error('Enter the text you would like to add.');
      const annotation={id:uid(),pageId:page.id,pageRotation:page.rotation,pageCrop:page.crop?{...page.crop}:undefined,type:'text',text:values.text,fontSize:Number(values.size),color:values.color,x:Number(values.x)/100,y:Number(values.y)/100,opacity:1,align:'left'};
      update=()=>{state.annotations.push(annotation);};
    }else if(tool==='highlight'){
      const annotation={id:uid(),pageId:page.id,pageRotation:page.rotation,pageCrop:page.crop?{...page.crop}:undefined,type:'highlight',x:Number(values.x)/100,y:Number(values.y)/100,width:Math.min(Number(values.width)/100,1-Number(values.x)/100),height:Math.min(Number(values.height)/100,1-Number(values.y)/100),opacity:Number(values.opacity)/100,color:values.color};
      update=()=>{state.annotations.push(annotation);};
    }else if(tool==='image'){
      if(!ui.image)throw new Error('Choose a PNG or JPG first.');
      const pdfPage=await ui.pdf.getPage(activeIndex()+1), viewport=pdfPage.getViewport({scale:1});
      let width=Math.min(Number(values.width)/100,1-Number(values.x)/100),height=width*viewport.width/(ui.image.ratio*viewport.height);
      if(height>1-Number(values.y)/100){height=1-Number(values.y)/100;width=height*viewport.height*ui.image.ratio/viewport.width;}
      const annotation={id:uid(),pageId:page.id,pageRotation:page.rotation,pageCrop:page.crop?{...page.crop}:undefined,type:'image',x:Number(values.x)/100,y:Number(values.y)/100,width,height,opacity:1,imageBytes:ui.image.bytes,imageType:ui.image.type};
      update=()=>{state.annotations.push(annotation);};
    }else if(tool==='crop'){
      if(ui.previewPageId!==ui.activeId)throw new Error('Wait for this page preview to finish loading before cropping.');
      const margins=cropValues(),scope=scopedPages(values.scope);
      if(!Object.values(margins).some(value=>value>0))throw new Error('Set a margin or drag an area to keep before applying the crop.');
      update=()=>{state.pages.forEach(p=>{
        if(scope!=='all'&&!scope.includes(p.id))return;
        const old=cropMarginsForRotation(p.crop,p.rotation),width=1-old.left-old.right,height=1-old.top-old.bottom;
        p.crop={left:old.left+margins.left*width,right:old.right+margins.right*width,top:old.top+margins.top*height,bottom:old.bottom+margins.bottom*height,rotation:p.rotation};
      });};
    }else if(tool==='watermark'){
      if(!values.text.trim())throw new Error('Enter your watermark text.');
      const watermark={text:values.text,size:Number(values.size),color:values.color,opacity:Number(values.opacity)/100,angle:Number(values.angle),position:values.position,pages:scopedPages(values.scope)};
      update=()=>{state.watermark=watermark;};
    }else if(tool==='footer'){
      const keys=['headerLeft','headerCenter','headerRight','footerLeft','footerCenter','footerRight'];
      if(!keys.some(key=>values[key]?.trim()))throw new Error('Enter text in at least one header or footer position.');
      const headerFooter={...Object.fromEntries(keys.map(key=>[key,values[key]||''])),size:Number(values.size),color:values.color,margin:Number(values.margin),pages:scopedPages(values.scope)};
      update=()=>{state.headerFooter=headerFooter;};
    }else if(tool==='numbers'){
      if(!values.format?.trim())throw new Error('Enter a page-number format, for example Page {page}.');
      const pageNumbers={format:values.format,start:Number(values.start),size:Number(values.size),color:values.color,margin:Number(values.margin),position:values.position,pages:scopedPages(values.scope)};
      update=()=>{state.pageNumbers=pageNumbers;};
    }else return;
    const success=await commit(update,names[tool]+' applied.');
    if(success){ui.pending.delete(tool);if(tool==='crop'){ui.lastCropPreset=Object.fromEntries(['left','top','right','bottom'].map(edge=>[edge,Number(values[edge])/100]));ui.drafts.crop={...defaults.crop,scope:values.scope};}if(tool==='text'){ui.drafts.text={...values,text:''};}renderTool();}
  }catch(error){toast(friendly(error),true);}
}
async function pdfjs() {
  if(!ui.pdfjs){ui.pdfjs=await import('./assets/vendor/pdf.mjs');ui.pdfjs.GlobalWorkerOptions.workerSrc=assetUrl('./assets/vendor/pdf.worker.mjs');}
  return ui.pdfjs;
}
async function makePreview(bytes) {
  const lib=await pdfjs();
  const loading=lib.getDocument({data:bytes.slice(),cMapUrl:assetUrl('./assets/vendor/cmaps/'),cMapPacked:true,standardFontDataUrl:assetUrl('./assets/vendor/standard_fonts/'),wasmUrl:assetUrl('./assets/vendor/wasm/'),iccUrl:assetUrl('./assets/vendor/iccs/')});
  return loading.promise;
}
async function rebuild() {
  const output=await buildPdf(state,progress=>{$('#busy-message').textContent='Preparing your document… '+Math.round(progress*100)+'%';});
  const doc=await makePreview(output);
  ui.splitResults=null;
  ui.renderToken++;ui.thumbToken++;const old=ui.pdf,oldBytes=ui.bytes;ui.pdf=doc;ui.bytes=output;
  try{
    if(!state.pages.some(p=>p.id===ui.activeId))ui.activeId=state.pages[0]?.id;
    ui.selected=new Set([...ui.selected].filter(id=>state.pages.some(p=>p.id===id)));
    updateDocumentInfo();renderPages();await renderCurrent();renderThumbnails();
  }catch(error){
    ui.renderToken++;ui.thumbToken++;ui.pdf=old;ui.bytes=oldBytes;doc.loadingTask.destroy().catch(()=>{});throw error;
  }
  if(old)old.loadingTask.destroy().catch(()=>{});
}
function renderRestoredState() {
  // Cancel results from any render started against the rejected document state.
  ui.renderToken++;ui.thumbToken++;
  if(!state.pages.length){showLanding();return;}
  updateDocumentInfo();renderPages();renderTool();renderCurrent();renderThumbnails();
}
async function commit(mutation,message) {
  if(ui.busy)return false;
  const previous=snapshot(),active=ui.activeId,selected=new Set(ui.selected);
  busy(true,'Applying your changes…');
  try{
    mutation();if(!state.pages.length)throw new Error('Keep at least one page in the document.');
    await rebuild();ui.history.push({state:previous,active,selected});if(ui.history.length>30)ui.history.shift();
    ui.dirty=true;$('#undo-button').disabled=false;renderTool();if(message)toast(message);return true;
  }catch(error){state=previous;ui.activeId=active;ui.selected=selected;renderRestoredState();toast(friendly(error),true);return false;}
  finally{busy(false);updatePending();}
}
async function openFiles(files,append=false) {
  if(ui.busy||batch.isBusy()||!files.length)return;
  const list=[...files];
  if(list.some(file=>!file.name.toLowerCase().endsWith('.pdf')&&file.type!=='application/pdf')){toast('Please choose PDF files. You can add PNG or JPG images with the Image tool.',true);return;}
  if(!append&&(ui.dirty||ui.pending.size||ui.splitResults?.some(file=>!file.downloaded))&&!confirm('Start a new document? Your current edits and unapplied settings will be cleared. Download your edits first if you want to keep them.'))return;
  busy(true,'Opening your PDF'+(list.length>1?'s':'')+'…');
  const previous=snapshot(),previousActive=ui.activeId,previousSelected=new Set(ui.selected),previousInitial=ui.initial;
  try{
    const sources=[],pages=[];
    for(const file of list){
      const bytes=new Uint8Array(await file.arrayBuffer());
      const info=await inspectPdf(bytes),id=uid();
      sources.push({id,bytes,name:file.name,pageCount:info.pageCount});
      for(let index=0;index<info.pageCount;index++)pages.push({id:uid(),sourceId:id,index,rotation:0});
    }
    if(append&&state.pages.length){state.sources.push(...sources);state.pages.push(...pages);}
    else{state={...emptyState(),sources,pages};ui.activeId=pages[0].id;ui.selected=new Set([pages[0].id]);}
    showWorkspace();
    await rebuild();
    if(append&&previous.pages.length){ui.history.push({state:previous,active:previousActive,selected:previousSelected});ui.dirty=true;}
    else{ui.history=[];ui.dirty=false;ui.initial=snapshot();ui.drafts={};ui.lastCropPreset=null;ui.pending.clear();ui.image=null;ui.zoom=1;ui.lastCropPreset=null;}
    $('#undo-button').disabled=!ui.history.length;renderTool();
    if(append)toast(pages.length+' page'+(pages.length===1?'':'s')+' added. Arrange them, then download.');
    else toast('Your PDF is ready. Everything happens on your device.');
  }catch(error){state=previous;ui.activeId=previousActive;ui.selected=previousSelected;ui.initial=previousInitial;renderRestoredState();toast(friendly(error),true);}
  finally{busy(false);$('#file-input').value='';updatePending();}
}
function showWorkspace() {
  if(!batch.close())return;document.body.classList.remove('batching');
  $('#landing').hidden=true;$('#workspace').hidden=false;document.body.classList.add('editing');window.scrollTo(0,0);
}
function showLanding() {
  if(!batch.close())return;document.body.classList.remove('batching');
  $('#landing').hidden=false;$('#workspace').hidden=true;document.body.classList.remove('editing');
  let resume=$('#resume-document');
  if(state.pages.length&&!resume){resume=document.createElement('button');resume.id='resume-document';resume.className='button secondary';resume.dataset.action='resume';resume.textContent='Return to your open document';resume.style.marginTop='14px';$('#drop-zone').append(resume);}
  if(resume)resume.hidden=!state.pages.length;
}
function updateDocumentInfo() {
  const activeSources=state.sources.filter(s=>state.pages.some(p=>p.sourceId===s.id));
  $('#document-name').textContent=activeSources.length===1?activeSources[0].name:'Combined document.pdf';
  $('#document-info').textContent=state.pages.length+' page'+(state.pages.length===1?'':'s')+' · '+formatSize(ui.bytes?.length||0);
  $('#total-pages').textContent=state.pages.length;
  $('#undo-button').disabled=!ui.history.length;
  syncPageNavigation();
}
async function renderCurrent() {
  if(!ui.pdf||$('#workspace').hidden)return;
  const token=++ui.renderToken,pdf=ui.pdf,index=activeIndex();
  ui.previewPageId=null;$('#page-surface').classList.add('render-pending');
  try{
    const page=await pdf.getPage(index+1);
    if(token!==ui.renderToken)return;
    const base=page.getViewport({scale:1}),scroll=$('#canvas-scroll');
    const available=Math.max(160,scroll.clientWidth-(window.innerWidth<=720?32:60));
    const fit=Math.min(available/base.width,1.35),scale=fit*ui.zoom,dpr=Math.min(devicePixelRatio||1,2);
    const viewport=page.getViewport({scale:scale*dpr});
    const temporary=document.createElement('canvas');temporary.width=Math.ceil(viewport.width);temporary.height=Math.ceil(viewport.height);
    await page.render({canvasContext:temporary.getContext('2d'),viewport}).promise;
    if(token!==ui.renderToken)return;
    const canvas=$('#pdf-canvas');canvas.width=temporary.width;canvas.height=temporary.height;canvas.style.width=(base.width*scale)+'px';canvas.style.height=(base.height*scale)+'px';canvas.getContext('2d').drawImage(temporary,0,0);
    canvas.setAttribute('aria-label','PDF preview, page '+(index+1)+' of '+state.pages.length);
    syncPageNavigation();
    $('#zoom-label').textContent=ui.zoom===1?'Fit':Math.round(ui.zoom*100)+'%';
    $('[data-action=previous]').disabled=index===0;$('[data-action=next]').disabled=index===state.pages.length-1;
    $('#selection-caption').textContent='Page '+(index+1)+' · '+ui.selected.size+' selected';
    ui.previewPageId=state.pages[index]?.id;updateMarker();updateCropOverlay();
  }catch(error){if(token===ui.renderToken&&error?.name!=='RenderingCancelledException')toast('Could not preview this page. '+friendly(error),true);}finally{if(token===ui.renderToken)$('#page-surface').classList.remove('render-pending');}
}
function renderPages() {
  const list=$('#page-list');
  list.innerHTML=state.pages.map((page,index)=>'<div class="page-item'+(page.id===ui.activeId?' active':'')+'" data-page-id="'+page.id+'" draggable="true"><button class="page-thumb" type="button" data-page-open="'+page.id+'" aria-label="View page '+(index+1)+'"><span class="thumb-loading">'+(index+1)+'</span></button><div class="page-item-foot"><label><input type="checkbox" data-page-select="'+page.id+'" aria-label="Select page '+(index+1)+'"'+(ui.selected.has(page.id)?' checked':'')+'><span>'+(index+1)+'</span></label></div><span class="delete-badge" hidden>Delete</span><div class="page-move"><button class="icon-button" data-move-page="'+page.id+'" data-direction="-1" aria-label="Move page '+(index+1)+' earlier"'+(index===0?' disabled':'')+'>'+icon('up')+'</button><button class="icon-button" data-move-page="'+page.id+'" data-direction="1" aria-label="Move page '+(index+1)+' later"'+(index===state.pages.length-1?' disabled':'')+'>'+icon('down')+'</button></div></div>').join('');
}
function renderThumbnails() {
  const token=++ui.thumbToken,pdf=ui.pdf,pages=[...state.pages];
  ui.thumbObserver?.disconnect();ui.thumbObserver=null;ui.thumbRenderTask?.cancel();ui.thumbRenderTask=null;ui.thumbCleanup?.(true);ui.thumbCleanup=null;if(!pdf)return;
  const nodes=$$('[data-page-open]'),indices=new Map(pages.map((p,i)=>[p.id,i]));
  const visible=new Set(),queued=new Set(),proxies=new Map();let running=false;
  const cleanup=(all=false)=>{for(const [node,page] of proxies){if((all||!visible.has(node))&&node.dataset.pageOpen!==ui.activeId){page.cleanup();proxies.delete(node);}}};
  ui.thumbCleanup=cleanup;
  const placeholder=(node,index)=>{const canvas=node.querySelector('canvas');if(canvas){canvas.width=0;canvas.height=0;}const span=document.createElement('span');span.className='thumb-loading';span.textContent=index+1;node.replaceChildren(span);};
  async function pump() {
    if(running)return;running=true;
    try{
      while(queued.size&&token===ui.thumbToken){
        const node=queued.values().next().value;queued.delete(node);
        if(!visible.has(node)||node.querySelector('canvas'))continue;
        const index=indices.get(node.dataset.pageOpen);
        try{
          const page=await pdf.getPage(index+1),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:172/base.width});
          if(token!==ui.thumbToken)return;
          proxies.set(node,page);if(!visible.has(node)){cleanup();continue;}
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-hidden','true');
          const task=page.render({canvasContext:canvas.getContext('2d'),viewport});ui.thumbRenderTask=task;
          try{await task.promise;}finally{if(ui.thumbRenderTask===task)ui.thumbRenderTask=null;}
          if(token!==ui.thumbToken)return;
          if(visible.has(node)){node.style.aspectRatio=base.width+' / '+base.height;node.classList.add('thumb-sized');node.replaceChildren(canvas);}else{canvas.width=0;canvas.height=0;cleanup();}
        }catch(error){if(token===ui.thumbToken&&error?.name!=='RenderingCancelledException')console.warn('Thumbnail unavailable',index+1,error);}
      }
    }finally{running=false;}
  }
  if(!('IntersectionObserver' in window)){nodes.forEach(node=>{visible.add(node);queued.add(node);});void pump();return;}
  ui.thumbObserver=new IntersectionObserver(entries=>{
    if(token!==ui.thumbToken)return;
    for(const entry of entries){
      const node=entry.target;
      if(entry.isIntersecting){visible.add(node);queued.add(node);}
      else{visible.delete(node);queued.delete(node);if(node.querySelector('canvas'))placeholder(node,indices.get(node.dataset.pageOpen));}
    }
    cleanup();void pump();
  },{root:window.innerWidth<=720?$('#page-list'):$('.page-sidebar'),rootMargin:'350px',threshold:0});
  nodes.forEach(node=>ui.thumbObserver.observe(node));
}
function choosePage(id) {
  if(ui.busy)return;readDraft();ui.activeId=id;ui.thumbCleanup?.();
  $$('.page-item').forEach(item=>item.classList.toggle('active',item.dataset.pageId===id));
  renderTool();renderCurrent();revealThumbnail(id);
}
function chooseTool(tool) {
  if(ui.busy)return;readDraft();ui.tool=tool;if(!ui.drafts[tool])ui.drafts[tool]=appliedDraft(tool);
  renderTool();
}
async function movePage(id,offset,targetId=null) {
  if(ui.busy)return;
  const from=state.pages.findIndex(p=>p.id===id),to=targetId?state.pages.findIndex(p=>p.id===targetId):from+offset;
  if(from<0||to<0||to>=state.pages.length||from===to)return;
  await commit(()=>{const [page]=state.pages.splice(from,1);state.pages.splice(to,0,page);},'Page order updated.');
}
function selectedIds() {
  if(!ui.selected.size)throw new Error('Select one or more pages using the checkboxes in the page strip.');
  return new Set(ui.selected);
}
function downloadBytes(bytes,name) {
  const url=URL.createObjectURL(bytes instanceof Blob?bytes:new Blob([bytes],{type:'application/pdf'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function outputName(suffix='edited') {
  const sources=state.sources.filter(s=>state.pages.some(p=>p.sourceId===s.id));
  const base=sources.length===1?sources[0].name.replace(/\.pdf$/i,''):'combined';
  return base+'-'+suffix+'.pdf';
}
async function downloadSelected() {
  try{
    const ids=selectedIds();busy(true,'Preparing selected pages…');
    const extraction=snapshot();extraction.pages=extraction.pages.filter(p=>ids.has(p.id));
    const bytes=await buildPdf(extraction);downloadBytes(bytes,outputName('selected'));toast(extraction.pages.length+' selected pages downloaded.');
  }catch(error){toast(friendly(error),true);}finally{busy(false);}
}
function showInfo(kind) {
  const content=$('#dialog-content');
  if(kind==='privacy')content.innerHTML='<div class="eyebrow">YOUR FILES, YOUR SPACE</div><h2>Private by design.</h2><p>QFT PDF processes your PDFs in this browser. The editor does not send document contents, filenames, or your edits to a processing server.</p><h3>What stays on your device?</h3><p>Your PDF files, added images, text, and the edited document. PDF files and generated results are held in this tab’s memory. Closing or refreshing the tab clears them. Saved presets contain your chosen text and settings; they stay in this browser until you delete them or clear site data.</p><h3>What uses the internet?</h3><p>Your browser loads this website, its PDF libraries, and font assets. The hosting provider may receive ordinary website requests. QFT PDF does not include advertising or analytics scripts.</p><p>Use Download PDF to save your finished copy. Your original file is not overwritten.</p>';
  if(kind==='help')content.innerHTML='<div class="eyebrow">A LITTLE GUIDANCE</div><h2>Make yourself at home.</h2><p>Open a PDF, choose a tool, and apply your changes. The preview shows the actual edited document. Download PDF saves a new copy.</p><h3>What can I edit?</h3><p>Add text, PNG/JPG images, highlights, watermarks, headers, footers, and page numbers. Merge PDFs or reorder, rotate, delete, crop, extract, and split their pages. Batch tools apply a saved preset to several PDFs separately.</p><h3>Delete Pages &amp; Crop PDF</h3><p>Delete Pages lets you select thumbnails or a page range, such as 2, 4-6. Keep at least one page. Crop PDF lets you drag an area to keep or enter margin percentages, then apply to the current, selected, or every page. Each crop trims the current visible area. Restore original crop brings back the original page boundary for your chosen scope. Cropping hides content; it is not secure redaction.</p><p>Add text creates new content; it does not rewrite existing paragraphs. Highlights are annotations, not secure redaction. Changes can invalidate existing digital signatures.</p><h3>Supported files</h3><p>Unencrypted PDFs with no fixed file-size or page-count limit. Processing capacity depends on your device and available browser memory. Very large files can be slow or may not open, especially on mobile devices. Combining, removing, or extracting pages from PDFs with interactive form fields is not supported.</p><h3>Fonts and page positions</h3><p>Latin and Chinese text are supported. Chinese text embeds a full font for reliable reading, which adds about 14 MB to the downloaded file. Other scripts depend on the bundled font coverage.</p><p>Click a page to position text or images, or use the position sliders. Repeated content can apply to every page, the current page, or selected pages. Page numbers follow your final page order.</p><h3>Split PDF and batch presets</h3><p>Split by individual page, every N pages, or custom groups such as 1-3; 4-6. A semicolon starts a new output PDF. Download individual results or a ZIP. Batch tools combine watermarks, headers/footers, page numbers, and cropping. Numbering restarts for each file. Presets are saved in this browser; PDFs are not.</p><h3>Undo and reset</h3><p>Undo reverses your recent edits. Reset returns to the first document you opened. Your workspace is not saved after you close or refresh this tab.</p>';
  $('#info-dialog').showModal();
}
async function action(name,element) {
  if(ui.busy&&!['privacy','help','close-dialog','cancel-operation'].includes(name))return;
  if(batch.isBusy()&&!['privacy','help','close-dialog','batch'].includes(name)){toast('Stop the batch or wait for it to finish before switching workspaces.');return;}
  if(name==='cancel-operation'){ui.cancelOperation=true;$('#busy-cancel').disabled=true;$('#busy-message').textContent='Stopping after the current output…';return;}
  if(name==='batch'){batch.open();return;}
  if(name==='batch-from-editor'){sendSettingsToBatch();return;}
  if(name==='download-split'){const file=ui.splitResults?.[Number(element.dataset.outputIndex)];if(file){downloadBytes(file.bytes,file.name);file.downloaded=true;}return;}
  if(name==='download-split-zip'){try{if(ui.splitResults?.length){downloadBytes(createZip(ui.splitResults),safeBaseName(outputName('split'))+'.zip');ui.splitResults.forEach(file=>file.downloaded=true);}}catch(error){toast(friendly(error),true);}return;}
  if(name==='open'){ui.append=false;$('#file-input').click();}
  if(name==='add-files'){ui.append=true;$('#file-input').click();}
  if(name==='sample'){
    try{busy(true,'Opening the sample document…');const response=await fetch(assetUrl('./assets/sample.pdf'));if(!response.ok)throw new Error('The sample could not load. Please choose your own PDF.');const blob=await response.blob();busy(false);await openFiles([new File([blob],'A little room to create.pdf',{type:'application/pdf'})]);}
    catch(error){busy(false);toast(friendly(error),true);}
  }
  if(name==='home'||name==='back'||name==='tools-home'){showLanding();if(name==='tools-home')setTimeout(()=>$('#tools').scrollIntoView({behavior:'smooth'}),0);else window.scrollTo(0,0);}
  if(name==='resume'){showWorkspace();renderCurrent();}
  if(name==='privacy'||name==='help')showInfo(name);
  if(name==='close-dialog')$('#info-dialog').close();
  if(name==='organize')chooseTool('pages');
  if(name==='previous'||name==='next'){const next=activeIndex()+(name==='next'?1:-1);if(next>=0&&next<state.pages.length)choosePage(state.pages[next].id);}
  if(name==='zoom-in'||name==='zoom-out'||name==='zoom-fit'){ui.zoom=name==='zoom-fit'?1:Math.max(.5,Math.min(2.5,ui.zoom+(name==='zoom-in'?.25:-.25)));renderCurrent();}
  if(name==='undo'){
    const previous=ui.history.at(-1);if(!previous)return;
    busy(true,'Undoing the last change…');const current=snapshot(),currentActive=ui.activeId,currentSelected=new Set(ui.selected);
    try{state=previous.state;ui.activeId=previous.active;ui.selected=previous.selected;await rebuild();ui.history.pop();ui.drafts={};ui.lastCropPreset=null;ui.pending.clear();ui.dirty=ui.history.length>0;renderTool();updateDocumentInfo();toast('Last change undone.');}
    catch(error){state=current;ui.activeId=currentActive;ui.selected=currentSelected;renderRestoredState();toast(friendly(error),true);}finally{busy(false);}
  }
  if(name==='reset'){
    $('#dialog-content').innerHTML='<div class="eyebrow">START FRESH</div><h2>Reset this document?</h2><p>This clears your edits and added PDFs and returns to the document you first opened. Your original files are unchanged.</p><button class="button danger" data-action="confirm-reset" style="margin-top:20px">Reset document</button>';
    $('#info-dialog').showModal();
  }
  if(name==='confirm-reset'){
    $('#info-dialog').close();if(!ui.initial)return;
    busy(true,'Restoring the original document…');
    const previous=snapshot(),previousActive=ui.activeId,previousSelected=new Set(ui.selected);
    try{state=snapshot(ui.initial);ui.activeId=state.pages[0].id;ui.selected=new Set([ui.activeId]);await rebuild();ui.history=[];ui.drafts={};ui.lastCropPreset=null;ui.pending.clear();ui.image=null;ui.dirty=false;renderTool();updateDocumentInfo();toast('Back to your original document.');}
    catch(error){state=previous;ui.activeId=previousActive;ui.selected=previousSelected;renderRestoredState();toast(friendly(error),true);}finally{busy(false);}
  }
  if(name==='download'){
    if(ui.pending.size){const tool=[...ui.pending][0];chooseTool(tool);toast('Apply or discard the pending '+names[tool].toLowerCase()+' settings before downloading.',true);return;}
    if(ui.bytes){downloadBytes(ui.bytes,outputName());ui.dirty=false;toast('Your edited PDF has been downloaded.');}
  }
  if(name==='discard-draft'){ui.pending.delete(ui.tool);ui.drafts[ui.tool]=appliedDraft(ui.tool);renderTool();}
  if(name==='select-all'||name==='select-none'){
    ui.selected=name==='select-all'?new Set(state.pages.map(p=>p.id)):new Set();
    $$('[data-page-select]').forEach(input=>input.checked=ui.selected.has(input.dataset.pageSelect));renderTool();
  }
  if(name==='select-range'){
    readDraft();try{const indices=parsePageRange(draft().range,state.pages.length);ui.selected=new Set(indices.map(i=>state.pages[i].id));$$('[data-page-select]').forEach(input=>input.checked=ui.selected.has(input.dataset.pageSelect));renderTool();}catch(error){toast(friendly(error),true);}
  }
  if(name==='rotate'){
    try{const ids=selectedIds();await commit(()=>{state.pages.forEach(p=>{if(ids.has(p.id))p.rotation=(p.rotation+90)%360;});},'Selected pages rotated.');}catch(error){toast(friendly(error),true);}
  }
  if(name==='clear-crop-margins'){
    readDraft();ui.drafts.crop={...defaults.crop,scope:draft().scope};ui.pending.delete('crop');renderTool();
  }
  if(name==='restore-crop'){
    readDraft();try{
      const scope=scopedPages(draft().scope);
      const success=await commit(()=>{state.pages.forEach(p=>{if(scope==='all'||scope.includes(p.id))delete p.crop;});},'Original page boundaries restored.');
      if(success){ui.lastCropPreset=null;ui.drafts.crop={...defaults.crop,scope:draft().scope};ui.pending.delete('crop');renderTool();}
    }catch(error){toast(friendly(error),true);}
  }
  if(name==='delete-pages'){
    try{const ids=selectedIds();if(ids.size===state.pages.length)throw new Error('Keep at least one page. Deselect a page before removing the others.');await commit(()=>{state.pages=state.pages.filter(p=>!ids.has(p.id));state.annotations=state.annotations.filter(a=>!ids.has(a.pageId));},'Selected pages deleted. You can undo this.');}catch(error){toast(friendly(error),true);}
  }
  if(name==='extract'){
    if(ui.pending.size){toast('Apply or discard pending changes before downloading selected pages.',true);return;}
    await downloadSelected();
  }
  if(name==='move-earlier'||name==='move-later')await movePage(ui.activeId,name==='move-earlier'?-1:1);
  if(name==='choose-image')$('#image-input').click();
  if(name==='remove-watermark'||name==='remove-footer'||name==='remove-numbers'){
    const key=name==='remove-watermark'?'watermark':name==='remove-footer'?'headerFooter':'pageNumbers';
    const success=await commit(()=>{state[key]=null;},'Removed from your document.');
    if(success){ui.drafts[ui.tool]={...defaults[ui.tool]};ui.pending.delete(ui.tool);renderTool();}
  }
}

function syncPageNavigation() {
  const field=$('#page-jump');field.max=state.pages.length;field.value=activeIndex()+1;
  $('#page-counter').textContent='of '+state.pages.length;
}
function jumpToPage() {
  const field=$('#page-jump'),number=Number(field.value);
  if(!Number.isInteger(number)||number<1||number>state.pages.length){toast('Enter a page number from 1 to '+state.pages.length+'.',true);syncPageNavigation();return;}
  choosePage(state.pages[number-1].id);
}
function revealThumbnail(id) {
  const node=$('[data-page-id="'+id+'"]'),root=window.innerWidth<=720?$('#page-list'):$('.page-sidebar');if(!node)return;
  const rect=node.getBoundingClientRect(),area=root.getBoundingClientRect();
  if(window.innerWidth<=720){if(rect.left<area.left)root.scrollLeft+=rect.left-area.left;else if(rect.right>area.right)root.scrollLeft+=rect.right-area.right;}
  else{if(rect.top<area.top)root.scrollTop+=rect.top-area.top;else if(rect.bottom>area.bottom)root.scrollTop+=rect.bottom-area.bottom;}
}
function splitFields() {
  return selectField('Split by','mode',[['each','Every page'],['chunks','Every N pages'],['ranges','Custom page groups']],true)+'<div id="split-size" class="wide">'+numberField('Pages per PDF','size',1,Math.max(1,state.pages.length))+'</div><div id="split-ranges" class="wide">'+makeField('Page groups','<textarea name="ranges" rows="3" placeholder="1-3; 4-6; 7, 9-10"></textarea>',true)+'<p class="field-hint">Separate PDFs with a semicolon. Use commas for pages within one PDF.</p></div><div id="split-summary" class="scope-note" aria-live="polite"></div>'+applyButton('Create split PDFs')+'<div id="split-results" class="wide">'+splitResultMarkup()+'</div>';
}
function splitResultMarkup() {
  if(!ui.splitResults?.length)return '';
  return '<div class="split-result-header"><strong>'+ui.splitResults.length+' PDFs ready</strong><span>Your source is unchanged.</span></div><button type="button" class="button primary" data-action="download-split-zip">'+icon('download')+'Download all as ZIP</button><div class="split-result-list">'+ui.splitResults.map((file,index)=>'<div class="split-result"><span><strong>'+safe(file.name)+'</strong><small>'+file.pageCount+' page'+(file.pageCount===1?'':'s')+' · '+formatSize(file.bytes.length)+'</small></span><button type="button" class="icon-button" data-action="download-split" data-output-index="'+index+'" aria-label="Download '+safe(file.name)+'">'+icon('download')+'</button></div>').join('')+'</div>';
}
function updateSplitSummary() {
  const values=draft();$('#split-size').hidden=values.mode!=='chunks';$('#split-ranges').hidden=values.mode!=='ranges';
  $('#split-size input').disabled=values.mode!=='chunks';$('#split-ranges textarea').disabled=values.mode!=='ranges';
  const node=$('#split-summary');
  try{
    const groups=planSplit({mode:values.mode,size:Number(values.size),ranges:values.ranges},state.pages.length);
    const used=new Set(groups.flat()),omitted=state.pages.length-used.size;
    node.textContent=groups.length+' output PDF'+(groups.length===1?'':'s')+' · '+used.size+' of '+state.pages.length+' pages included.'+(omitted?' '+omitted+' page'+(omitted===1?' is':'s are')+' outside these groups.':'');node.classList.remove('invalid');
  }catch(error){node.textContent=error.message;node.classList.add('invalid');}
}
async function generateSplit() {
  if(ui.busy)return;readDraft();
  if(ui.pending.size){toast('Apply or discard your pending edits before splitting.',true);return;}
  try{
    const values=draft(),groups=planSplit({mode:values.mode,size:Number(values.size),ranges:values.ranges},state.pages.length);
    ui.cancelOperation=false;busy(true,'Creating split PDFs…');$('#busy-cancel').disabled=false;$('#busy-cancel').hidden=false;
    const outputs=await splitPdf(ui.bytes,groups,{onProgress:value=>{$('#busy-message').textContent='Creating split PDFs… '+Math.round(value*100)+'%';},shouldCancel:()=>ui.cancelOperation});
    const base=safeBaseName(outputName()).replace(/-edited$/,'');
    ui.splitResults=outputs.map((bytes,index)=>({name:base+'-part-'+String(index+1).padStart(String(groups.length).length,'0')+'.pdf',bytes,pageCount:groups[index].length}));
    renderTool();toast(outputs.length+' PDF'+(outputs.length===1?' is':'s are')+' ready to download.');
  }catch(error){if(error.name==='AbortError')toast('Splitting cancelled. Your document is unchanged.');else toast(friendly(error),true);}
  finally{busy(false);}
}
function sendSettingsToBatch() {
  if(!$('#tool-form').reportValidity())return;readDraft();
  try{
    const values=draft(),preset={version:1,name:names[ui.tool]+' preset'};
    if(ui.tool==='watermark')preset.watermark={...values,opacity:Number(values.opacity)/100};
    if(ui.tool==='footer')preset.headerFooter=values;
    if(ui.tool==='numbers')preset.pageNumbers=values;
    if(ui.tool==='crop')preset.crop=!ui.pending.has('crop')&&ui.lastCropPreset?ui.lastCropPreset:cropValues();
    batch.open(normalizePreset(preset));
  }catch(error){toast(friendly(error),true);}
}
const batch=initBatch({onShow:()=>{readDraft();$('#landing').hidden=true;$('#workspace').hidden=true;document.body.classList.remove('editing');document.body.classList.add('batching');window.scrollTo(0,0);},onBack:()=>{document.body.classList.remove('batching');showLanding();},notify:toast});
$('#tool-select').addEventListener('change',event=>chooseTool(event.target.value));
$('#page-jump').addEventListener('change',jumpToPage);
$('#page-jump').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();jumpToPage();event.target.blur();}});
let toolFilter='all';
function filterTools() {
  const query=$('#tool-search').value.trim().toLowerCase();let count=0;
  $$('.tool-card').forEach(card=>{const visible=(toolFilter==='all'||card.dataset.category===toolFilter)&&card.textContent.toLowerCase().includes(query);card.hidden=!visible;if(visible)count++;});
  $('#no-tools').hidden=count!==0;
}
$('#tool-search').addEventListener('input',filterTools);
$$('[data-tool-filter]').forEach(button=>button.addEventListener('click',()=>{toolFilter=button.dataset.toolFilter;$$('[data-tool-filter]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});filterTools();}));

document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.action){event.preventDefault();action(target.dataset.action,target).catch(error=>{busy(false);toast(friendly(error),true);});}
  if(target.dataset.startTool){if(ui.busy||batch.isBusy())return;if(state.pages.length){chooseTool(target.dataset.startTool);showWorkspace();renderCurrent();}else{ui.tool=target.dataset.startTool;ui.append=false;$('#file-input').click();}}
  if(target.dataset.tool)chooseTool(target.dataset.tool);
  if(target.dataset.pageOpen)choosePage(target.dataset.pageOpen);
  if(target.dataset.movePage)movePage(target.dataset.movePage,Number(target.dataset.direction));
  if(target.dataset.removeAnnotation)commit(()=>{state.annotations=state.annotations.filter(a=>a.id!==target.dataset.removeAnnotation);},'Annotation removed.');
});
$('#file-input').addEventListener('change',event=>openFiles(event.target.files,ui.append));
$('#image-input').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(!['image/png','image/jpeg'].includes(file.type))throw new Error('Please choose a PNG or JPG image.');
    if(file.size>15*1024*1024)throw new Error('Please choose an image smaller than 15 MB.');
    const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>30000000){bitmap.close();throw new Error('Choose an image with fewer than 30 million pixels.');}
    ui.image={name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),type:file.type==='image/png'?'png':'jpg',ratio:bitmap.width/bitmap.height};bitmap.close();ui.pending.add('image');renderTool();toast('Image ready. Choose its position, then add it.');
  }catch(error){toast(friendly(error),true);}finally{event.target.value='';}
});
$('#page-list').addEventListener('change',event=>{
  const id=event.target.dataset.pageSelect;if(!id)return;
  if(event.target.checked)ui.selected.add(id);else ui.selected.delete(id);readDraft();renderTool();
});
$('#page-surface').addEventListener('click',event=>{
  if(ui.busy||!['text','image','highlight'].includes(ui.tool))return;
  const rect=$('#pdf-canvas').getBoundingClientRect();readDraft();const values=draft();
  values.x=Math.max(0,Math.min(90,Math.round(100*(event.clientX-rect.left)/rect.width)));
  values.y=Math.max(0,Math.min(90,Math.round(100*(event.clientY-rect.top)/rect.height)));
  ui.drafts[ui.tool]=values;ui.pending.add(ui.tool);renderTool();
});
let cropDrag=null;
function cropPoint(event,rect) {return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
$('#page-surface').addEventListener('pointerdown',event=>{
  if(ui.busy||ui.tool!=='crop'||event.button!==0||ui.previewPageId!==ui.activeId)return;
  const surface=$('#page-surface'),rect=$('#pdf-canvas').getBoundingClientRect();
  cropDrag={start:cropPoint(event,rect),rect,pointer:event.pointerId};surface.setPointerCapture(event.pointerId);event.preventDefault();
});
$('#page-surface').addEventListener('pointermove',event=>{
  if(!cropDrag||event.pointerId!==cropDrag.pointer)return;
  const end=cropPoint(event,cropDrag.rect),start=cropDrag.start;
  const margins={left:Math.min(start.x,end.x),top:Math.min(start.y,end.y),right:1-Math.max(start.x,end.x),bottom:1-Math.max(start.y,end.y)};
  if(1-margins.left-margins.right<=.01||1-margins.top-margins.bottom<=.01)return;
  readDraft();ui.drafts.crop={...draft(),...Object.fromEntries(Object.entries(margins).map(([key,value])=>[key,Math.round(value*1000)/10]))};
  for(const edge of ['left','top','right','bottom'])$('#tool-form [name='+edge+']').value=ui.drafts.crop[edge];
  ui.pending.add('crop');updateCropOverlay();updatePending();
});
function endCropDrag(event) {if(cropDrag&&event.pointerId===cropDrag.pointer){cropDrag=null;if($('#page-surface').hasPointerCapture(event.pointerId))$('#page-surface').releasePointerCapture(event.pointerId);}}
$('#page-surface').addEventListener('pointerup',endCropDrag);
$('#page-surface').addEventListener('pointercancel',endCropDrag);
$('#page-list').addEventListener('dragstart',event=>{
  const item=event.target.closest('[data-page-id]');if(!item||ui.busy)return;
  ui.dragId=item.dataset.pageId;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',ui.dragId);item.classList.add('dragging');
});
$('#page-list').addEventListener('dragover',event=>{if(!ui.dragId)return;event.preventDefault();const item=event.target.closest('[data-page-id]');$$('.drag-target').forEach(el=>el.classList.remove('drag-target'));if(item)item.classList.add('drag-target');});
$('#page-list').addEventListener('drop',event=>{
  if(!ui.dragId)return;event.preventDefault();event.stopPropagation();const item=event.target.closest('[data-page-id]');if(item)movePage(ui.dragId,0,item.dataset.pageId);ui.dragId=null;$$('.dragging,.drag-target').forEach(el=>el.classList.remove('dragging','drag-target'));
});
$('#page-list').addEventListener('dragend',()=>{ui.dragId=null;$$('.dragging,.drag-target').forEach(el=>el.classList.remove('dragging','drag-target'));});
let dragDepth=0;
document.addEventListener('dragenter',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth++;$('#drop-zone').classList.add('drag-over');});
document.addEventListener('dragleave',event=>{if(!event.dataTransfer?.types.includes('Files'))return;dragDepth--;if(dragDepth<=0)$('#drop-zone').classList.remove('drag-over');});
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
document.addEventListener('drop',event=>{
  if(!event.dataTransfer?.files.length)return;event.preventDefault();dragDepth=0;$('#drop-zone').classList.remove('drag-over');if(batch.isOpen())batch.addFiles(event.dataTransfer.files);else openFiles(event.dataTransfer.files,!$('#workspace').hidden&&state.pages.length>0);
});
$('#info-dialog').addEventListener('click',event=>{if(event.target===$('#info-dialog'))$('#info-dialog').close();});
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{renderCurrent();if(ui.pdf)renderThumbnails();},180);});
window.addEventListener('beforeunload',event=>{if(ui.dirty||ui.pending.size||ui.splitResults?.some(file=>!file.downloaded)||batch.hasUnsavedWork()){event.preventDefault();event.returnValue='';}});
window.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!$('#workspace').hidden){event.preventDefault();action('undo');}
});
if(!window.File||!window.Blob||!window.Worker)toast('QFT PDF needs a modern browser. Please use a recent version of Chrome, Edge, Firefox, or Safari.',true);
