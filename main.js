(() => {
  'use strict';
  const PROJECT_URL = 'https://iorausxqwrlggudtklib.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_mhqtMUMxfjCKM9AHOVgXgg_pBCmBcNU';
  const $ = (q) => document.querySelector(q);
  const show = (q, yes) => $(q).classList.toggle('hidden', !yes);
  const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currency = v => v == null ? 'Cost TBD' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
  const validUrl = v => {try {const url=new URL(v);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
  const fields = ['name','location','website','contact','capacity','estimated_cost','status','rating','pros','cons','notes','tour_date'];
  const EMPTY_GUESTS = {version:1,people:[],parties:[]};
  let db, session=null, workspace=null, venues=[], editingVenue=null;
  let channels=[], guestRevision=0, guestPending=null, guestTimer=null, guestSaving=false, guestBlocked=false, guestReady=false;

  function notice(message, severe=false) {
    $('#noticeBar').textContent=message;
    $('#noticeBar').classList.remove('hidden');
    $('#noticeBar').style.background=severe?'#ffebe5':'#fff4df';
  }
  function clearNotice(){ $('#noticeBar').classList.add('hidden');$('#noticeBar').textContent=''; }
  function sync(message,kind='') {$('#syncState').textContent=message;$('#syncState').className='sync-pill '+(kind?'is-'+kind:'');}
  function fail(error) {const msg=error?.message||String(error);notice(msg,true);console.error(error);return false;}
  function localDraftKey(){return 'wedding-cloud-draft:'+workspace.id;}
  function snapshotText(obj){return JSON.stringify(obj);}
  function recountGuests(data) {
    const people=data?.people||[];
    $('#navGuestCount').textContent=people.length||'';
    $('#homePeople').textContent=people.length;
    $('#homeRSVP').textContent=people.filter(p=>p.status==='invited').reduce((n,p)=>n+1+(p.unnamedPlusOne?1:0),0);
  }
  function recountVenues() {
    $('#homeVenues').textContent=venues.length;
    $('#homeShortlisted').textContent=venues.filter(v=>v.status==='Shortlisted').length;
    $('#vTotal').textContent=venues.length;
    $('#vShortlist').textContent=venues.filter(v=>v.status==='Shortlisted').length;
    $('#vTours').textContent=venues.filter(v=>v.status==='Tour Scheduled').length;
    $('#vBooked').textContent=venues.filter(v=>v.status==='Booked').length;
  }
  function tab(next) {
    if (!['overview','guests','venues'].includes(next)) next='overview';
    ['overview','guests','venues'].forEach(name=>{
      show('#'+name+'View',name===next);
      const b=document.querySelector('[data-tab="'+name+'"]');b.classList.toggle('active',name===next);b.setAttribute('aria-selected',name===next?'true':'false');
    });
    if (location.hash!=='#'+next) history.replaceState(null,'','#'+next);
    window.scrollTo({top:0,behavior:'instant'});
  }
  async function stopChannels() {
    clearTimeout(guestTimer); guestTimer=null;
    if (!db) return;
    await Promise.all(channels.map(ch=>db.removeChannel(ch).catch(()=>{})));channels=[];
  }
  async function bootstrap() {
    if (!db) return;
    const {data:{session:s},error}=await db.auth.getSession();if(error){fail(error);return;}
    session=s;$('#userLabel').textContent=s?.user?.email||'';
    show('#signOut',!!s);show('#shareWorkspace',!!s);show('#authView',!s);show('#setupView',false);show('#appShell',false);
    await stopChannels(); workspace=null;guestReady=false;guestPending=null;guestRevision=0;guestBlocked=false;
    if (!s){sync('● Sign in to save');return;}
    const {data:ws,error:we}=await db.from('workspaces').select('*').order('created_at').limit(1);
    if(we){fail(we);return;}
    workspace=ws?.[0]||null;
    if(!workspace){show('#setupView',true);const token=new URLSearchParams(location.search).get('invite');if(token)$('#inviteToken').value=token;return;}
    show('#appShell',true); clearNotice(); sync('● Connected');
    tab(location.hash.slice(1)||'overview');
    await Promise.all([loadGuests(),loadVenues()]);
    subscribe();
  }
  async function loadGuests() {
    if(!workspace || guestSaving || guestPending || guestBlocked)return;
    let {data,error}=await db.from('guest_lists').select('data,revision').eq('workspace_id',workspace.id).maybeSingle();
    if(error){fail(error);return;}
    if(!data) {
      const created=await db.from('guest_lists').insert({workspace_id:workspace.id,data:EMPTY_GUESTS}).select('data,revision').single();
      if(created.error){ // Another member may have created it first.
        const retry=await db.from('guest_lists').select('data,revision').eq('workspace_id',workspace.id).single();
        if(retry.error){fail(retry.error);return;}data=retry.data;
      } else data=created.data;
    }
    guestRevision=Number(data.revision);
    window.GuestListApp.hydrate(data.data);
    guestReady=true;
    recountGuests(data.data);
    const draft=localStorage.getItem(localDraftKey());
    if(draft)notice('A guest-list draft was saved in this browser after a previous interrupted save. Download a guest-list backup and review it before making more changes. Your shared cloud list has not been overwritten.');
  }
  window.WeddingBridge = {
    queueGuestSave(data) {
      if(!workspace||!guestReady||guestBlocked)return;
      guestPending=JSON.parse(snapshotText(data));
      recountGuests(guestPending);
      try{localStorage.setItem(localDraftKey(),snapshotText(guestPending));}catch(e){console.warn('Local recovery copy unavailable',e);}
      sync('● Saving guest list…','saving');
      clearTimeout(guestTimer);
      guestTimer=setTimeout(flushGuests,700);
    }
  };
  async function flushGuests() {
    if(guestSaving||!guestPending||guestBlocked||!workspace)return;
    guestSaving=true;
    const snapshot=guestPending;
    guestPending=null;
    const currentRevision=guestRevision;
    const {data,error}=await db.from('guest_lists').update({data:snapshot}).eq('workspace_id',workspace.id).eq('revision',currentRevision).select('revision').maybeSingle();
    guestSaving=false;
    if(error||!data){
      guestBlocked=true;
      guestPending=window.GuestListApp.snapshot();
      try{localStorage.setItem(localDraftKey(),snapshotText(guestPending));}catch{}
      sync('● Guest sync needs attention','error');
      notice('Guest-list changes were NOT overwritten. Another device may have edited the list or the save failed. Download a backup NOW from Guest list, then refresh the page and restore/merge your changes carefully. '+(error?.message||''),true);
      return;
    }
    guestRevision=Number(data.revision);
    if(guestPending){guestTimer=setTimeout(flushGuests,150);}else{
      sync('● All changes saved');
      try{localStorage.removeItem(localDraftKey());}catch{}
    }
  }
  async function loadVenues() {
    if(!workspace)return;
    const {data,error}=await db.from('venues').select('*').eq('workspace_id',workspace.id).order('created_at',{ascending:false});
    if(error){fail(error);return;}venues=data||[];recountVenues();renderVenues();
  }
  function subscribe(){
    if(!workspace)return;
    const w=workspace.id;
    const v=db.channel('wedding-venues-'+w).on('postgres_changes',{event:'*',schema:'public',table:'venues',filter:'workspace_id=eq.'+w},()=>loadVenues()).subscribe();
    const g=db.channel('wedding-guests-'+w).on('postgres_changes',{event:'*',schema:'public',table:'guest_lists',filter:'workspace_id=eq.'+w},payload=>{
      const incoming=Number(payload.new?.revision||0);
      if(!guestReady || incoming<=guestRevision)return;
      if(guestSaving && incoming===guestRevision+1)return;
      if(guestPending||guestSaving||guestBlocked||window.GuestListApp.editing()){
        sync('● New guest changes available','saving');
        notice('Your partner updated the guest list. Finish any edits and refresh to see their changes. If you have unsaved changes, download a backup first.');
      }else loadGuests();
    }).subscribe();channels.push(v,g);
  }
  function openVenue(v) {
    editingVenue=v;
    $('#venueForm').reset();$('#dialogTitle').textContent=v?'Edit venue':'Add a venue';
    show('#venueDelete',!!v);
    for(const f of fields){const el=$('#venueForm').elements.namedItem(f);if(el)el.value=v?.[f]??'';}
    $('#venueDialog').showModal();
  }
  function renderVenues() {
    const q=$('#venueSearch').value.trim().toLowerCase(),status=$('#venueFilter').value,sort=$('#venueSort').value;
    const arr=venues.filter(v=>(!status||v.status===status)&&(!q||[v.name,v.location,v.notes,v.pros,v.cons].some(t=>String(t||'').toLowerCase().includes(q))));
    arr.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='cost'?(a.estimated_cost??Infinity)-(b.estimated_cost??Infinity):sort==='rating'?(b.rating??0)-(a.rating??0):new Date(b.created_at)-new Date(a.created_at));
    const list=$('#venueCards');list.replaceChildren();show('#venueEmpty',!arr.length);
    for(const v of arr) {
      const card=document.createElement('article');card.className='venue-card';
      const link=validUrl(v.website);
      card.innerHTML='<div class="venue-card-top"><span class="venue-pill '+(v.status==='Rejected'?'rejected':v.status==='Booked'?'booked':'')+'">'+escapeHTML(v.status)+'</span><span class="venue-stars">'+(v.rating?'★'.repeat(v.rating):'☆ ☆ ☆ ☆ ☆')+'</span></div><div><h3>'+escapeHTML(v.name)+'</h3><div class="venue-location">⌖ '+escapeHTML(v.location||'Location not entered')+'</div></div><div class="venue-facts"><span><strong>'+currency(v.estimated_cost)+'</strong> · estimate</span><span>♙ '+escapeHTML(v.capacity??'—')+' guests</span>'+(v.tour_date?'<span>Tour: '+escapeHTML(v.tour_date)+'</span>':'')+'</div>'+(v.pros?'<div class="venue-preview"><b>Why we love it</b> · '+escapeHTML(v.pros)+'</div>':'')+(v.notes?'<div class="venue-preview">'+escapeHTML(v.notes)+'</div>':'')+'<div class="venue-card-actions">'+(link?'<a href="'+escapeHTML(link)+'" target="_blank" rel="noopener noreferrer">Visit website ↗</a>':'<span></span>')+'</div>';
      const button=document.createElement('button');button.className='action outline';button.textContent='View & edit';button.onclick=()=>openVenue(v);card.querySelector('.venue-card-actions').append(button);list.append(card);
    }
  }
  function csvExport(){
    const cols=['name','location','website','contact','capacity','estimated_cost','status','rating','tour_date','pros','cons','notes'];
    const csv=[cols.join(','),...venues.map(v=>cols.map(c=>'"'+String(v[c]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='wedding-venues.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function initEvents(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
    document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.goto)));
    $('#brandHome').addEventListener('click',e=>{e.preventDefault();if(workspace)tab('overview');});
    window.addEventListener('hashchange',()=>{if(workspace)tab(location.hash.slice(1));});
    $('#authForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await db.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error)fail(error);else await bootstrap();});
    $('#signUp').addEventListener('click',async()=>{if(!$('#authForm').reportValidity())return;const {data,error}=await db.auth.signUp({email:$('#email').value.trim(),password:$('#password').value});if(error)fail(error);else if(!data.session)notice('Account created. Check your inbox to confirm your email, then sign in.');else await bootstrap();});
    $('#shareWorkspace').addEventListener('click',async()=>{if(!workspace)return;const link=location.origin+location.pathname+'?invite='+workspace.invite_token+'#overview';try{await navigator.clipboard.writeText(link);notice('Private invitation link copied. Share it only with someone you want to give access to your wedding workspace.');}catch{prompt('Copy your private invitation link:',link);}});
    $('#signOut').addEventListener('click',async()=>{if(guestPending||guestSaving||guestBlocked){if(!confirm('Guest changes may not have been saved. Download a backup first. Sign out anyway?'))return;}await db.auth.signOut();await bootstrap();});
    $('#createWorkspace').addEventListener('submit',async e=>{e.preventDefault();const {error}=await db.rpc('create_wedding_workspace',{workspace_name:$('#workspaceName').value});if(error)fail(error);else await bootstrap();});
    $('#joinWorkspace').addEventListener('submit',async e=>{e.preventDefault();const {error}=await db.rpc('join_wedding_workspace',{token:$('#inviteToken').value.trim()});if(error)fail(error);else{history.replaceState(null,'',location.pathname+'#overview');await bootstrap();}});
    $('#addVenue').onclick=()=>openVenue(null);$('#emptyAdd').onclick=()=>openVenue(null);
    $('#venueClose').onclick=()=>$('#venueDialog').close();$('#venueCancel').onclick=()=>$('#venueDialog').close();
    $('#venueForm').addEventListener('submit',async e=>{
      e.preventDefault();if(!workspace)return;
      const values={};for(const f of fields){const raw=$('#venueForm').elements.namedItem(f).value.trim();values[f]=['capacity','estimated_cost','rating','tour_date'].includes(f)?(raw===''?null:(f==='tour_date'?raw:Number(raw))):raw;}
      values.workspace_id=workspace.id;
      const btn=$('#venueSave');btn.disabled=true;
      const {error}=editingVenue?await db.from('venues').update(values).eq('id',editingVenue.id).eq('workspace_id',workspace.id):await db.from('venues').insert(values);
      btn.disabled=false;if(error)return fail(error);
      $('#venueDialog').close();clearNotice();await loadVenues();
    });
    $('#venueDelete').addEventListener('click',async()=>{
      if(!editingVenue||!confirm('Delete this venue permanently?'))return;
      const {error}=await db.from('venues').delete().eq('id',editingVenue.id).eq('workspace_id',workspace.id);
      if(error)return fail(error);$('#venueDialog').close();clearNotice();await loadVenues();
    });
    ['#venueSearch','#venueFilter','#venueSort'].forEach(id=>$(id).addEventListener(id==='#venueSearch'?'input':'change',renderVenues));
    $('#venueExport').onclick=csvExport;$('#venueRefresh').onclick=loadVenues;
    window.addEventListener('beforeunload',e=>{if(guestPending||guestSaving||guestBlocked){e.preventDefault();e.returnValue='';}});
    db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')queueMicrotask(()=>bootstrap().catch(fail));});
  }
  async function start(){
    if(!window.supabase||!window.GuestListApp){notice('The app could not load its required scripts. Refresh the page and check your connection.',true);return;}
    db=window.supabase.createClient(PROJECT_URL,PUBLIC_KEY);
    initEvents();await bootstrap();
  }
  start().catch(fail);
})();