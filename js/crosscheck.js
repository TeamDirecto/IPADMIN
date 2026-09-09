(()=>{
  "use strict";

  const API="https://vicidial97.directo.com/ip-manager-webadmin-api";
  const pendingBody=document.getElementById("pendingBody");
  if(!pendingBody)return;

  const nodeNames={
    vicidial43:"VICIDIAL 43",VicidialMED:"VICIDIAL MED",
    ALIADOS:"ALIADOS",GENERADORES:"GENERADORES",ALL_CENTERS:"TODOS LOS CENTROS",
    AliadosD1:"ALIADOS D1",AliadosD2:"ALIADOS D2",AliadosD3:"ALIADOS D3",AliadosD4:"ALIADOS D4",AliadosD5:"ALIADOS D5",
    "ViciIntelya-Dial1":"GENERADORES D1",generadoresmed2:"GENERADORES D2","ViciMED-Dial3":"GENERADORES D3","ViciIntelya-Dial4":"GENERADORES D4","ViciMED-Dial5":"GENERADORES D5"
  };

  function esc(v){
    return String(v==null?"":v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function nodeLabel(n){return nodeNames[n]||n||"-"}

  async function adminFetch(path){
    const token=sessionStorage.getItem("ipadmin_token")||"";
    const r=await fetch(API+path,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      let detail=d.detail||("HTTP "+r.status);
      if(typeof detail==="object")detail=JSON.stringify(detail);
      throw new Error(detail);
    }
    return d;
  }

  function ensureModal(){
    let overlay=document.getElementById("coverageOverlay");
    if(overlay)return overlay;
    overlay=document.createElement("div");
    overlay.id="coverageOverlay";
    overlay.className="coverage-overlay";
    overlay.hidden=true;
    overlay.innerHTML='\
      <section class="coverage-modal" role="dialog" aria-modal="true" aria-labelledby="coverageTitle">\
        <div class="coverage-head">\
          <div><h3 class="coverage-title" id="coverageTitle">Cobertura de la IP</h3><p class="coverage-subtitle" id="coverageSubtitle"></p></div>\
          <button type="button" class="coverage-close" id="coverageClose" aria-label="Cerrar">×</button>\
        </div>\
        <div class="coverage-body" id="coverageBody"></div>\
      </section>';
    document.body.appendChild(overlay);
    overlay.querySelector("#coverageClose").addEventListener("click",closeModal);
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal()});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)closeModal()});
    return overlay;
  }

  function closeModal(){
    const o=document.getElementById("coverageOverlay");
    if(o)o.hidden=true;
  }

  function sourceMeta(source,node,data){
    const health=(data.node_health_state&&data.node_health_state[node])||"UNKNOWN";
    if(source==="BOTH")return {cls:"both"+(health!=="SYNCED"?" healthbad":""),icon:"✓",label:"IVR + IP Manager"+(health!=="SYNCED"?" · "+health:"")};
    if(source==="IP_MANAGER")return {cls:"ipmanager"+(health!=="SYNCED"?" healthbad":""),icon:"◆",label:"IP Manager"+(health!=="SYNCED"?" · "+health:"")};
    if(source==="IVR_LEGACY")return {cls:"legacy",icon:"✓",label:"IVR legacy"};
    if(source==="NEW")return {cls:"new",icon:"✕",label:"Nueva"};
    return {cls:"unknown",icon:"?",label:"Sin confirmar"};
  }

  function renderCoverage(request,data){
    const overlay=ensureModal();
    overlay.hidden=false;
    overlay.querySelector("#coverageSubtitle").textContent=`Solicitud #${request.id} · ${request.ip} · ${nodeLabel(request.node_name)}`;

    const expected=Array.isArray(data.expected_nodes)?data.expected_nodes:[];
    const sources=data.node_sources||{};
    const present=Array.isArray(data.present_nodes)?data.present_nodes:[];
    const requestable=Array.isArray(data.requestable_nodes)?data.requestable_nodes:[];
    const unknown=Array.isArray(data.unknown_nodes)?data.unknown_nodes:[];

    let summary="";
    if(data.all_present===true){
      summary='<span class="coverage-chip block">Ya registrada en todo el destino</span>';
    }else{
      summary+='<span class="coverage-chip present">Presentes: '+esc(present.length)+'</span>';
      summary+='<span class="coverage-chip new">Nuevas: '+esc(requestable.length)+'</span>';
      if(unknown.length)summary+='<span class="coverage-chip unknown">Sin confirmar: '+esc(unknown.length)+'</span>';
    }

    const rows=expected.map(node=>{
      const meta=sourceMeta(sources[node]||"UNKNOWN",node,data);
      return '<div class="coverage-node '+meta.cls+'"><span class="coverage-icon">'+meta.icon+'</span><span class="coverage-name">'+esc(nodeLabel(node))+'</span><span class="coverage-state">'+esc(meta.label)+'</span></div>';
    }).join("");

    const note=data.safe_to_submit===false
      ? 'Hay nodos sin confirmar. Esta vista es informativa; valida el estado antes de aprobar.'
      : 'La cobertura combina inventario IVR legacy y estado deseado de IP Manager. La aprobación administrativa no se modifica desde esta vista.';

    overlay.querySelector("#coverageBody").innerHTML='<div class="coverage-summary">'+summary+'</div><div class="coverage-grid">'+rows+'</div><div class="coverage-note">'+esc(note)+'</div>';
  }

  function renderError(message,id){
    const overlay=ensureModal();
    overlay.hidden=false;
    overlay.querySelector("#coverageSubtitle").textContent=id?`Solicitud #${id}`:"";
    overlay.querySelector("#coverageBody").innerHTML='<div class="coverage-error">'+esc(message)+'</div>';
  }

  async function openCoverage(id,button){
    const overlay=ensureModal();
    overlay.hidden=false;
    overlay.querySelector("#coverageSubtitle").textContent=`Solicitud #${id}`;
    overlay.querySelector("#coverageBody").innerHTML='<div class="coverage-loading">Consultando IVR legacy e IP Manager…</div>';
    if(button)button.disabled=true;
    try{
      const request=await adminFetch('/requests/'+encodeURIComponent(id));
      const q='?ip='+encodeURIComponent(request.ip)+'&node_name='+encodeURIComponent(request.node_name);
      const data=await adminFetch('/ip-check'+q);
      renderCoverage(request,data);
    }catch(err){
      renderError(err&&err.message?err.message:"No fue posible consultar la cobertura.",id);
    }finally{
      if(button)button.disabled=false;
    }
  }

  function ensureButtons(){
    pendingBody.querySelectorAll('.approve-one').forEach(approve=>{
      const group=approve.closest('.action-group');
      if(!group||group.querySelector('.coverage-one'))return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn btn-coverage btn-sm coverage-one';
      btn.dataset.id=approve.dataset.id;
      btn.textContent='Cobertura';
      group.insertBefore(btn,approve);
    });
  }

  pendingBody.addEventListener('click',e=>{
    const button=e.target.closest('.coverage-one');
    if(!button)return;
    openCoverage(button.dataset.id,button);
  });

  const observer=new MutationObserver(ensureButtons);
  observer.observe(pendingBody,{childList:true,subtree:true});
  ensureButtons();
})();
