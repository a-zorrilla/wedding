/* Venue planning interface; stays separate from the restored guest-list application. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const safe = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const cash = (n,currency='USD') => n == null || !Number.isFinite(Number(n)) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(Number(n));
  const num = n => n == null || n === '' || !Number.isFinite(Number(n)) ? null : Number(n);
  const shown = v => v == null || v === '' ? '—' : String(v);
  const yesNo = v => v === null || v === undefined || v === '' ? 'Unknown' : v === true || v === 'true' ? 'Yes' : 'No';
  const validUrl = input => { try { const url = new URL(input); return ['http:','https:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
  const photo = v => validUrl(v.image_url);
  const statusOptions = ['Researching','Contacted','Tour Scheduled','Toured','Shortlisted','Rejected','Booked'];
  const enumLabels = {
    coordination_type:{unknown:'Unknown',included:'Included',available_extra:'Extra fee',not_offered:'Not offered'},
    external_vendor_policy:{unknown:'Unknown',allowed:'Allowed',restricted:'Restricted',not_allowed:'Not allowed'},
    site_fee_treatment:{additional:'Additional to F&B',credited_to_fnb:'Credited to F&B',included_in_fnb:'Included in F&B'}
  };
  const NUMBERS = ['guest_count','airport_transfer_minutes','accommodation_transfer_minutes','nearby_hotel_rooms','on_site_sleeping_capacity','ceremony_capacity','seated_dinner_capacity','site_fee','food_beverage_minimum','food_beverage_per_guest','food_beverage_quote','food_minimum','food_per_guest','food_quote','beverage_minimum','beverage_per_guest','beverage_quote','service_charge_pct','tax_pct','external_vendor_fee','additional_fees','outside_vendor_budget','other_wedding_costs','quoted_total'];
  const BOOLEANS = ['indoor_backup','external_vendors_planned'];
  const EDITABLE = ['name','location','website','image_url','contact','status','tour_date','availability_notes','closest_airport','airport_transfer_minutes','accommodation_transfer_minutes','nearby_hotel_rooms','on_site_sleeping_capacity','ceremony_capacity','seated_dinner_capacity','indoor_backup','rain_plan','coordination_type','external_vendor_policy','external_vendors_planned','curfew_time','venue_inclusions','noise_restrictions','guest_count','currency','site_fee','site_fee_treatment','food_beverage_minimum','food_beverage_per_guest','food_beverage_quote','service_charge_pct','tax_pct','external_vendor_fee','additional_fees','additional_fees_description','outside_vendor_budget','other_wedding_costs','quoted_total','pros','cons','notes'];
  const TABLE_GROUPS = [
    {name:'Overview',items:[['name','Venue'],['status','Status'],['location','Location'],['image_url','Photo URL'],['website','Website'],['contact','Contact'],['availability_notes','Availability'],['tour_date','Tour date']]},
    {name:'Travel & capacity',items:[['closest_airport','Airport'],['airport_transfer_minutes','Airport min'],['accommodation_transfer_minutes','Hotel min'],['nearby_hotel_rooms','Hotel rooms nearby'],['on_site_sleeping_capacity','Sleeps on site'],['ceremony_capacity','Ceremony seats'],['seated_dinner_capacity','Dinner seats'],['indoor_backup','Indoor backup'],['rain_plan','Rain plan']]},
    {name:'Services & rules',items:[['coordination_type','Coordination'],['external_vendor_policy','Outside vendors'],['external_vendors_planned','Use outside vendors?'],['venue_inclusions','Included'],['curfew_time','Curfew'],['noise_restrictions','Restrictions']]},
    {name:'Wedding budget',items:[['guest_count','Planning guests'],['currency','Currency'],['site_fee','Site fee'],['site_fee_treatment','Site fee treatment'],['food_beverage_minimum','F&B minimum'],['food_beverage_per_guest','F&B per guest'],['food_beverage_quote','Combined F&B quote (legacy)'],['food_minimum','Food minimum'],['food_per_guest','Food/guest'],['food_quote','Food quote'],['beverage_minimum','Drinks minimum'],['beverage_per_guest','Drinks/guest'],['beverage_quote','Drinks quote'],['service_charge_pct','Service %'],['tax_pct','Tax %'],['external_vendor_fee','Outside vendor fee'],['additional_fees','Venue extras'],['additional_fees_description','Extra fee details'],['outside_vendor_budget','Outside suppliers'],['other_wedding_costs','Other costs'],['quoted_total','All-in quote'],['_total','Estimated total'],['_per_guest','Cost per guest'],['_cost_status','Estimate status']]},
    {name:'Our notes & ratings',items:[['_your_rating','Your rating'],['_partner_rating','Partner rating'],['_average_rating','Average rating'],['rating','Previous shared score'],['pros','Pros'],['cons','Cons'],['notes','Notes']]}
  ];
  let context = () => ({}), reload = async () => {}, report = console.error, notify = () => {};
  let venues = [], ratings = [], selected = null, editing = null, mode = localStorage.getItem('wedding-venue-mode') === 'table' ? 'table' : 'cards';
  const getContext = () => context();
  function calculate(v) {
    const guests=num(v.guest_count)||100,has=k=>num(v[k])!==null;
    const fk=['food_minimum','food_per_guest','food_quote'],bk=['beverage_minimum','beverage_per_guest','beverage_quote'];
    const split=[...fk,...bk].some(has);
    const component=name=>{
      const quote=has(name+'_quote')?num(v[name+'_quote']):has(name+'_per_guest')?num(v[name+'_per_guest'])*guests:null;
      const min=num(v[name+'_minimum']);
      return quote===null&&min===null?null:Math.max(quote||0,min||0);
    };
    const food=component('food'),beverage=component('beverage');
    const fbInput=has('food_beverage_quote')?num(v.food_beverage_quote):has('food_beverage_per_guest')?num(v.food_beverage_per_guest)*guests:null;
    const minimum=num(v.food_beverage_minimum);
    const fb=split?Math.max((food||0)+(beverage||0),minimum||0):fbInput===null&&minimum===null?null:Math.max(fbInput||0,minimum||0);
    const topUp=split?Math.max(0,(minimum||0)-(food||0)-(beverage||0)):0;
    const rental=num(v.site_fee),treatment=v.site_fee_treatment||'additional';
    const rentalDue=treatment==='included_in_fnb'?0:treatment==='credited_to_fnb'?Math.max(0,(rental||0)-(fb||0)):rental||0;
    const service=fb===null||!has('service_charge_pct')?null:fb*num(v.service_charge_pct)/100;
    const tax=fb===null||!has('tax_pct')?null:(rentalDue+fb+(service||0))*num(v.tax_pct)/100;
    const vendor=v.external_vendors_planned===true||v.external_vendors_planned==='true'?(num(v.external_vendor_fee)||0):0;
    const fixed=(num(v.additional_fees)||0)+(num(v.outside_vendor_budget)||0)+(num(v.other_wedding_costs)||0)+vendor;
    const hasCosts=['site_fee','food_beverage_minimum','food_beverage_per_guest','food_beverage_quote',...fk,...bk,'external_vendor_fee','additional_fees','outside_vendor_budget','other_wedding_costs'].some(has);
    const manual=num(v.quoted_total);
    const total=manual!==null?manual:hasCosts?rentalDue+(fb||0)+(service||0)+(tax||0)+fixed:null;
    const incomplete=manual===null&&((split?(food===null||beverage===null):fb===null)||(rental===null&&treatment!=='included_in_fnb')||!has('service_charge_pct')||!has('tax_pct')||(v.external_vendors_planned==null&&has('external_vendor_fee')));
    const breakdown=[['Site fee due',rentalDue],...(split?[['Food',food],['Beverages',beverage],['Combined minimum top-up',topUp||null]]:[['Food & beverage (legacy combined)',fb]]),['Service charge',service],['Estimated tax',tax],['Outside vendor fee',vendor],['Other venue fees',num(v.additional_fees)],['Outside supplier budget',num(v.outside_vendor_budget)],['Other wedding costs',num(v.other_wedding_costs)]];
    return {guests,food,beverage,split,fb,fbInput,minimum,rental,rentalDue,service,tax,vendor,fixed,total,perGuest:total===null?null:total/guests,
      label:manual!==null?'All-in quote':!hasCosts?'Not priced':incomplete?'Partial estimate':'Planning estimate',incomplete,manual,breakdown};
  }
  function ratingsFor(v){ const r=ratings.filter(x=>x.venue_id === v.id);const me=getContext().session?.user?.id;const own=r.find(x=>x.user_id===me);const other=r.filter(x=>x.user_id!==me);const avg=r.length ? r.reduce((s,x)=>s+Number(x.score),0)/r.length : null;return {r,own,other,avg};}
  const average = v => ratingsFor(v).avg;
  function sortedVenues(){
    const search=$('#venueSearch').value.trim().toLowerCase(), status=$('#venueFilter').value, sort=$('#venueSort').value;
    const list=venues.filter(v=>(!status||v.status===status)&&(!search||['name','location','availability_notes','closest_airport','pros','cons','notes','venue_inclusions'].some(f=>String(v[f]||'').toLowerCase().includes(search))));
    list.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='cost'?(calculate(a).total??Infinity)-(calculate(b).total??Infinity):sort==='rating'?(average(b)??-1)-(average(a)??-1):new Date(b.created_at)-new Date(a.created_at));return list;
  }
  function card(v){
    const c=calculate(v), rating=ratingsFor(v), img=photo(v);
    const el=document.createElement('article');el.className='venue-card venue-visual-card';
    const frame='<div class="venue-image">'+(img?'<img src="'+safe(img)+'" alt="Photo of '+safe(v.name)+'" loading="lazy" referrerpolicy="no-referrer">':'')+'<div class="venue-no-image" '+(img?'hidden':'')+'><span aria-hidden="true">✧</span><small>PHOTO NOT ADDED</small></div><span class="venue-image-badge">'+safe(v.status)+'</span></div>';
    el.innerHTML=frame+'<div class="venue-card-interior"><div class="venue-card-heading"><h3>'+safe(v.name)+'</h3><span class="venue-rating">'+(rating.avg===null?'☆ Unrated':'★ '+rating.avg.toFixed(1))+'</span></div><div class="venue-location">⌖ '+safe(v.location||'Location to confirm')+'</div><div class="venue-card-chips"><span>'+safe(shown(v.seated_dinner_capacity))+' dinner guests</span><span>'+(v.indoor_backup===true?'Indoor backup ✓':v.indoor_backup===false?'No indoor backup':'Rain plan TBD')+'</span></div><div class="venue-card-prices"><div><small>'+safe(c.label)+'</small><strong>'+(c.total!==null?cash(c.total,v.currency):'Cost TBD')+'</strong></div><div><small>Per guest · '+c.guests+'</small><strong>'+cash(c.perGuest,v.currency)+'</strong></div></div><button class="action dark venue-open-detail" type="button">View venue &amp; costs ↗</button></div>';
    const image=el.querySelector('img'); if(image)image.addEventListener('error',()=>{image.remove();el.querySelector('.venue-no-image').hidden=false;});
    el.querySelector('button').addEventListener('click',()=>openDetails(v));return el;
  }
  function formatted(v,key){const c=calculate(v),r=ratingsFor(v);
    if(key==='_total')return c.total==null?'—':cash(c.total,v.currency);
    if(key==='_per_guest')return cash(c.perGuest,v.currency);
    if(key==='_cost_status')return c.label;
    if(key==='_your_rating')return r.own?String(r.own.score)+'/5':'—';
    if(key==='_partner_rating')return r.other.length?r.other.map(x=>x.score+'/5').join(', '):'—';
    if(key==='_average_rating')return r.avg===null?'—':r.avg.toFixed(1)+'/5';
    if(key==='rating')return num(v.rating)===null?'—':v.rating+'/5';
    if(BOOLEANS.includes(key))return yesNo(v[key]);
    if(enumLabels[key])return enumLabels[key][v[key]]||'Unknown';
    if(['site_fee','food_beverage_minimum','food_beverage_per_guest','food_beverage_quote','food_minimum','food_per_guest','food_quote','beverage_minimum','beverage_per_guest','beverage_quote','external_vendor_fee','additional_fees','outside_vendor_budget','other_wedding_costs','quoted_total'].includes(key))return cash(v[key],v.currency);
    if(['tax_pct','service_charge_pct'].includes(key))return num(v[key])===null?'—':v[key]+'%';
    if(key==='website'||key==='image_url')return shown(v[key]);
    return shown(v[key]);
  }
  function renderTable(list){
    const table=$('#venueTable'); const groups=TABLE_GROUPS;
    const head='<thead><tr class="venue-group-row"><th rowspan="2" class="venue-sticky">Details</th>'+groups.map(g=>'<th scope="colgroup" colspan="'+g.items.length+'">'+safe(g.name)+'</th>').join('')+'</tr><tr>'+groups.flatMap(g=>g.items.map(([_,title])=>'<th scope="col">'+safe(title)+'</th>')).join('')+'</tr></thead>';
    const body='<tbody>'+list.map(v=>'<tr><td class="venue-sticky"><button class="venue-name-link" type="button" data-id="'+safe(v.id)+'">Open ↗</button></td>'+groups.flatMap(g=>g.items.map(([key])=>'<td title="'+safe(formatted(v,key))+'">'+safe(formatted(v,key))+'</td>')).join('')+'</tr>').join('')+'</tbody>';
    table.innerHTML=head+body;
    table.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>{const v=venues.find(v=>v.id===b.dataset.id);if(v)openDetails(v);}));
  }
  function render(){const list=sortedVenues();$('#venueCards').replaceChildren(...list.map(card));renderTable(list);
    $('#venueEmpty').classList.toggle('hidden',list.length>0);
    $('#venueCards').classList.toggle('hidden',mode!=='cards');$('#venueTableWrap').classList.toggle('hidden',mode!=='table');
    $('#venueCardsMode').setAttribute('aria-pressed',String(mode==='cards'));$('#venueTableMode').setAttribute('aria-pressed',String(mode==='table'));
    if($('#venueDetailDialog').open && selected){const current=venues.find(v=>v.id===selected.id);if(current){selected=current;renderDetails(current);}else $('#venueDetailDialog').close();}
  }
  function line(label,value,opts={}) {const text=opts.raw?value:safe(shown(value));return '<div class="venue-detail-row"><dt>'+safe(label)+'</dt><dd>'+text+'</dd></div>';}
  function infoGroup(title,rows){return '<section class="venue-detail-group"><h3>'+safe(title)+'</h3><dl>'+rows.join('')+'</dl></section>';}
  function renderDetails(v){
    const c=calculate(v),r=ratingsFor(v),website=validUrl(v.website);
    $('#venueDetailTitle').textContent=v.name;
    const image=photo(v);
    const header='<div class="venue-detail-hero">'+(image?'<img alt="Photo of '+safe(v.name)+'" src="'+safe(image)+'" loading="lazy" referrerpolicy="no-referrer">':'<span class="venue-hero-placeholder">✧</span>')+'<div class="venue-detail-hero-copy"><span class="venue-pill">'+safe(v.status)+'</span><h3>'+safe(v.location||'Location not yet entered')+'</h3>'+(website?'<a href="'+safe(website)+'" target="_blank" rel="noopener noreferrer">Open venue website ↗</a>':'')+'</div></div>';
    const costRows=c.breakdown.map(([label,val])=>line(label,cash(val,v.currency)));
    let cost='<section class="venue-detail-cost"><div class="cost-total"><div><small>'+safe(c.label)+' · '+c.guests+' planning guests</small><strong>'+(c.total===null?'Not yet priced':cash(c.total,v.currency))+'</strong></div><div><small>Estimated cost / guest</small><strong>'+cash(c.perGuest,v.currency)+'</strong></div></div><p class="cost-explanation">'+(c.manual!==null?'Based on the all-in quote entered. The component breakdown below is for reference only and is not added to the quoted total.':c.incomplete?'Partial figure only. Missing fees, tax, service or unconfirmed expenses may increase the real total.':'Planning estimate, not a binding quote. Confirm what is included, tax treatment and possible extras with the venue.')+'</p><details open><summary>Cost components &amp; assumptions</summary><dl>'+costRows.join('')+line('Combined F&B minimum (legacy)',cash(v.food_beverage_minimum,v.currency))+line('Combined F&B per guest (legacy)',cash(v.food_beverage_per_guest,v.currency))+line('Combined F&B quote (legacy)',cash(v.food_beverage_quote,v.currency))+line('Food minimum',cash(v.food_minimum,v.currency))+line('Food per guest',cash(v.food_per_guest,v.currency))+line('Food quote',cash(v.food_quote,v.currency))+line('Beverage minimum',cash(v.beverage_minimum,v.currency))+line('Beverage per guest',cash(v.beverage_per_guest,v.currency))+line('Beverage quote',cash(v.beverage_quote,v.currency))+line('Site-fee treatment',formatted(v,'site_fee_treatment'))+line('Service rate',formatted(v,'service_charge_pct'))+line('Tax rate',formatted(v,'tax_pct'))+line('Outside vendors planned',yesNo(v.external_vendors_planned))+line('Extra fee details',v.additional_fees_description)+'</dl></details></section>';
    const links = (website?'<a href="'+safe(website)+'" target="_blank" rel="noopener noreferrer">Website ↗</a>':'');
    const details='<div class="venue-detail-columns">'+
      infoGroup('Location & availability',[line('Website',links||'—',{raw:true}),line('Contact',v.contact),line('Availability',v.availability_notes),line('Tour date',v.tour_date),line('Closest airport',v.closest_airport),line('Airport transfer',v.airport_transfer_minutes == null?'—':v.airport_transfer_minutes+' min'),line('Nearest hotels',v.accommodation_transfer_minutes==null?'—':v.accommodation_transfer_minutes+' min'),line('Nearby hotel rooms',v.nearby_hotel_rooms)])+
      infoGroup('Guest experience & space',[line('Ceremony capacity',v.ceremony_capacity),line('Seated dinner capacity',v.seated_dinner_capacity),line('Sleeps on site',v.on_site_sleeping_capacity),line('Indoor backup',yesNo(v.indoor_backup)),line('Rain plan',v.rain_plan)])+
      infoGroup('Services & restrictions',[line('Coordination',formatted(v,'coordination_type')),line('Outside vendors',formatted(v,'external_vendor_policy')),line('Outside vendors planned',yesNo(v.external_vendors_planned)),line('Venue inclusions',v.venue_inclusions),line('Curfew',v.curfew_time?.slice(0,5)||'—'),line('Noise / restrictions',v.noise_restrictions)])+
      infoGroup('Our notes',[line('Previous shared score',formatted(v,'rating')),line('What we love',v.pros),line('Tradeoffs',v.cons),line('Other notes',v.notes)])+'</div>';
    const ratingsHTML='<section class="venue-detail-rating"><div class="rating-header"><div><span class="eyebrow">OUR INDIVIDUAL IMPRESSIONS</span><h3>How do we each feel?</h3></div><span class="venue-rating-average">'+(r.avg===null?'No ratings yet':'★ '+r.avg.toFixed(1)+'/5 combined')+'</span></div><div class="rating-couple"><div><span class="rating-caption">Your rating</span><strong>'+(r.own?safe(r.own.score)+'/5':'Not rated')+'</strong>'+(r.own?.notes?'<p>'+safe(r.own.notes)+'</p>':'')+'</div><div><span class="rating-caption">Partner'+(r.other.length>1?'s':'')+' rating</span><strong>'+(r.other.length?r.other.map(x=>safe(x.score)+'/5').join(', '):'Not rated')+'</strong>'+r.other.map(x=>x.notes?'<p>'+safe(x.notes)+'</p>':'').join('')+'</div></div><form id="venueRatingForm"><div class="form-grid"><label>Your score<select name="score" required><option value="">Choose a score</option>'+Array.from({length:9},(_,i)=>(i+2)/2).map(n=>'<option value="'+n+'" '+(Number(r.own?.score)===n?'selected':'')+'>'+n.toFixed(1)+' / 5</option>').join('')+'</select></label><label>Personal impression (optional)<textarea name="notes" rows="2" placeholder="What matters to you?">'+safe(r.own?.notes||'')+'</textarea></label></div><div class="rating-actions"><button class="action dark" type="submit">Save my rating</button>'+(r.own?'<button class="action outline" type="button" id="removeMyRating">Remove my rating</button>':'')+'</div></form></section>';
    $('#venueDetailBody').innerHTML=header+cost+details+ratingsHTML;
    const img=$('#venueDetailBody .venue-detail-hero img');if(img)img.addEventListener('error',()=>img.replaceWith(Object.assign(document.createElement('span'),{className:'venue-hero-placeholder',textContent:'✧'})));
    $('#venueRatingForm').addEventListener('submit',saveRating);$('#removeMyRating')?.addEventListener('click',removeRating);
  }
  function openDetails(v){selected=v;renderDetails(v);$('#venueDetailDialog').showModal();}
  function openEdit(v){editing=v;$('#venueForm').reset();$('#dialogTitle').textContent=v?'Edit venue':'Add a venue';$('#venueDelete').classList.toggle('hidden',!v);
    for(const name of EDITABLE){const input=$('#venueForm').elements.namedItem(name);if(!input)continue;const value=v?.[name];input.value=BOOLEANS.includes(name)?(value==null?'':String(value)):(value ?? ({guest_count:100,status:'Researching',coordination_type:'unknown',external_vendor_policy:'unknown',site_fee_treatment:'additional',currency:'USD'}[name] ?? ''));}
    if(!v){$('#venueForm').elements.namedItem('site_fee_treatment').value='additional';}
    updateFormPreview();$('#venueDialog').showModal();
  }
  function readForm(){const o={};for(const name of EDITABLE){const input=$('#venueForm').elements.namedItem(name);const raw=input.value.trim();o[name]=NUMBERS.includes(name)?(raw===''?null:Number(raw)):BOOLEANS.includes(name)?(raw===''?null:raw==='true'):(name==='tour_date'||name==='curfew_time')?(raw||null):raw;}
    if(!o.guest_count)throw new Error('Planning guest count must be at least 1.');
    if(o.website && !validUrl(o.website))throw new Error('Enter a valid website URL.');
    if(o.image_url && !validUrl(o.image_url))throw new Error('Enter a valid photo URL.');
    return o;
  }
  function updateFormPreview(){let v;try{v=readForm();}catch{$('#venueFormEstimate').textContent='Enter a guest count and costs to calculate your estimate.';return;}
    const c=calculate(v);$('#venueFormEstimate').innerHTML='<div><small>'+safe(c.label)+'</small><strong>'+(c.total===null?'Cost not yet entered':cash(c.total,v.currency))+'</strong></div><div><small>Cost per guest</small><strong>'+cash(c.perGuest,v.currency)+'</strong></div><p>'+(c.incomplete?'Missing cost details may increase the actual total.':'Figures are estimates until confirmed with a venue quote.')+'</p>';
  }
  async function saveVenue(e){e.preventDefault();const {db,workspace}=getContext();if(!workspace)return;
    let values;try{values=readForm();}catch(error){report(error);return;}
    values.workspace_id=workspace.id;
    const button=$('#venueSave');button.disabled=true;
    const {error}=editing?await db.from('venues').update(values).eq('workspace_id',workspace.id).eq('id',editing.id):await db.from('venues').insert(values);
    button.disabled=false;if(error){report(error);return;}
    $('#venueDialog').close();notify('Venue saved successfully.');await reload();
  }
  async function deleteVenue(){const {db,workspace}=getContext();if(!editing||!workspace||!confirm('Permanently delete this venue and both personal ratings?'))return;
    const {error}=await db.from('venues').delete().eq('id',editing.id).eq('workspace_id',workspace.id);
    if(error){report(error);return;}$('#venueDialog').close();$('#venueDetailDialog').close();selected=null;notify('Venue deleted.');await reload();
  }
  async function saveRating(e){e.preventDefault();const {db,session,workspace}=getContext();if(!selected||!session||!workspace)return;
    const form=e.currentTarget;const btn=form.querySelector('[type="submit"]');btn.disabled=true;
    const score=Number(form.elements.namedItem('score').value), notes=form.elements.namedItem('notes').value.trim();
    if(!score){btn.disabled=false;return;}
    const {error}=await db.from('venue_ratings').upsert({workspace_id:workspace.id,venue_id:selected.id,user_id:session.user.id,score,notes},{onConflict:'venue_id,user_id'});
    btn.disabled=false;if(error){report(error);return;}notify('Your rating was saved.');await reload();
  }
  async function removeRating(){const {db,session,workspace}=getContext();if(!selected||!session||!workspace)return;
    const {error}=await db.from('venue_ratings').delete().eq('workspace_id',workspace.id).eq('venue_id',selected.id).eq('user_id',session.user.id);
    if(error){report(error);return;}notify('Your rating was removed.');await reload();
  }
  function exportCSV(){
    const keys=TABLE_GROUPS.flatMap(g=>g.items);const rows=[keys.map(([,label])=>label),...sortedVenues().map(v=>keys.map(([key])=>formatted(v,key)))];
    const csv=rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const uri=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=uri;link.download='wedding-venue-comparison.csv';link.click();setTimeout(()=>URL.revokeObjectURL(uri),1500);
  }
  window.VenuePlanner={
    init(options){context=options.getContext;reload=options.reload;report=options.report;notify=options.notify;
      $('#addVenue').onclick=()=>openEdit(null);$('#emptyAdd').onclick=()=>openEdit(null);
      $('#venueClose').onclick=$('#venueCancel').onclick=()=>$('#venueDialog').close();
      $('#venueDetailClose').onclick=$('#venueDetailDismiss').onclick=()=>$('#venueDetailDialog').close();
      $('#venueDetailEdit').onclick=()=>{const v=selected;$('#venueDetailDialog').close();openEdit(v);};
      $('#venueForm').addEventListener('submit',saveVenue);$('#venueDelete').onclick=deleteVenue;
      $('#venueForm').addEventListener('input',updateFormPreview);$('#venueForm').addEventListener('change',updateFormPreview);
      ['#venueSearch','#venueFilter','#venueSort'].forEach(q=>$(q).addEventListener(q==='#venueSearch'?'input':'change',render));
      $('#venueCardsMode').onclick=()=>{mode='cards';localStorage.setItem('wedding-venue-mode',mode);render();};
      $('#venueTableMode').onclick=()=>{mode='table';localStorage.setItem('wedding-venue-mode',mode);render();};
      $('#venueExport').onclick=exportCSV;$('#venueRefresh').onclick=reload;
    },
    setData(v,r){venues=v||[];ratings=r||[];render();},
    reset(){venues=[];ratings=[];selected=null;editing=null;$('#venueDetailDialog')?.close();$('#venueDialog')?.close();},
    render
  };
})();