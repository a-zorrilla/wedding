/* Private venue photo galleries and uploads. Photos are scoped to the logged-in wedding workspace. */
(() => {
 'use strict';
 const bucket='wedding-venue-photos';
 const escape=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const validUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
 let records=[],context=()=>({}),reload=async()=>{},report=console.error,notify=()=>{},busy=false;
 const uploaded=v=>records.filter(p=>p.venue_id===v.id).sort((a,b)=>a.slot-b.slot);
 const images=v=>{
   const files=uploaded(v).filter(p=>validUrl(p.signed_url)).map(p=>({url:p.signed_url,id:p.id,label:p.original_filename||'Uploaded picture',uploaded:true}));
   const cover=validUrl(v.image_url);
   if(cover&&files.length<5)files.push({url:cover,id:null,label:'Original venue photo',uploaded:false});
   return files.slice(0,5);
 };
 const imageHTML=(v,index=0)=>{
   const imgs=images(v),pic=imgs[index]||imgs[0];
   return pic?'<img src="'+escape(pic.url)+'" alt="'+escape(v.name)+' photo '+(index+1)+' of '+imgs.length+'" loading="lazy" referrerpolicy="no-referrer">':'<div class="venue-no-image"><span aria-hidden="true">✧</span><small>PHOTO NOT ADDED</small></div>';
 };
 function bindSwitcher(root,v,detail){
   const imgs=images(v);let current=0;
   const replace=()=>{
     const surface=root.querySelector('[data-gallery-surface]');
     if(!surface)return;
     surface.innerHTML=imageHTML(v,current);
     const img=surface.querySelector('img');
     if(img)img.onerror=()=>{img.remove();const p=document.createElement('div');p.className='venue-no-image';p.innerHTML='<span aria-hidden="true">✧</span><small>IMAGE UNAVAILABLE</small>';surface.appendChild(p);};
     const counter=root.querySelector('[data-gallery-count]');if(counter)counter.textContent=imgs.length?(current+1)+' / '+imgs.length:'No photos';
     const open=root.querySelector('[data-gallery-open]');if(open){open.href=imgs[current]?.url||'#';open.hidden=!imgs.length;}
     root.querySelectorAll('[data-gallery-thumb]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.galleryThumb)===current)));
   };
   root.querySelectorAll('[data-gallery-step]').forEach(b=>b.addEventListener('click',event=>{
     event.stopPropagation();if(imgs.length<2)return;current=(current+Number(b.dataset.galleryStep)+imgs.length)%imgs.length;replace();
   }));
   root.querySelectorAll('[data-gallery-thumb]').forEach(b=>b.addEventListener('click',event=>{
     event.stopPropagation();current=Number(b.dataset.galleryThumb);replace();
   }));
   if(!detail&&imgs.length>1){
     const surface=root.querySelector('[data-gallery-surface]');
     if(surface){surface.style.cursor='pointer';surface.setAttribute('title','Click to see next picture');surface.addEventListener('click',()=>{current=(current+1)%imgs.length;replace();});}
   }
   replace();
 }
 const cardMarkup=v=>{
   const n=images(v).length;
   return '<div class="venue-photo-surface" data-gallery-surface>'+imageHTML(v)+'</div>'+
   (n>1?'<div class="venue-photo-controls"><button type="button" data-gallery-step="-1" aria-label="Previous photo">‹</button><span data-gallery-count>1 / '+n+'</span><button type="button" data-gallery-step="1" aria-label="Next photo">›</button></div>':'');
 };
 const detailMarkup=v=>{
   const imgs=images(v),n=imgs.length;
   return '<section class="venue-gallery-panel" aria-label="Photos for '+escape(v.name)+'">'+
   '<div class="venue-gallery-top"><h3>Photo gallery</h3><span>'+n+' of 5 visible</span></div>'+
   '<div class="venue-gallery-frame"><div data-gallery-surface>'+imageHTML(v)+'</div>'+
   (n>1?'<button type="button" class="venue-gallery-arrow left" data-gallery-step="-1" aria-label="Previous photo">‹</button><button type="button" class="venue-gallery-arrow right" data-gallery-step="1" aria-label="Next photo">›</button>':'')+
   '<div class="venue-gallery-bottom"><span data-gallery-count>'+ (n?'1 / '+n:'No photos') +'</span><a data-gallery-open href="'+escape(imgs[0]?.url||'#')+'" target="_blank" rel="noopener noreferrer" '+(!n?'hidden':'')+'>View full photo ↗</a></div></div>'+
   '<div class="venue-gallery-thumbs">'+imgs.map((img,i)=>'<button type="button" data-gallery-thumb="'+i+'" aria-label="View photo '+(i+1)+'"><img src="'+escape(img.url)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></button>').join('')+'</div>'+
   '<div class="venue-gallery-manager"><label class="venue-gallery-upload-label" for="venuePhotoFiles">Add your own photos (JPEG, PNG, WebP, AVIF; 8 MB each)</label>'+
   '<input id="venuePhotoFiles" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple '+(uploaded(v).length>=5?'disabled':'')+'>'+
   '<p class="venue-gallery-help">'+uploaded(v).length+' uploaded · 5 uploads maximum. Existing linked cover photos remain until replaced or edited.</p>'+
   '<div class="venue-gallery-uploaded">'+uploaded(v).map(p=>'<div><span>'+escape(p.original_filename||'Uploaded photo')+'</span><button class="venue-gallery-remove" type="button" data-remove-photo="'+escape(p.id)+'">Remove</button></div>').join('')+'</div></div>'+
   '</section>';
 };
 async function upload(v,files){
   if(busy)return;const {db,session,workspace}=context();
   if(!db||!workspace||!session)return;
   if(!files.length)return;
   const allow={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'};
   if(files.length>5-uploaded(v).length){report(new Error('You can upload at most five photos to each venue. Remove a picture first.'));return;}
   for(const file of files){if(!allow[file.type]){report(new Error('Supported formats: JPEG, PNG, WebP or AVIF.'));return;}
     if(file.size>8*1024*1024){report(new Error('Each photo must be 8 MB or smaller.'));return;}}
   busy=true;let uploadedCount=0;
   const input=document.querySelector('#venuePhotoFiles');if(input)input.disabled=true;
   try{
     for(const file of files){
       const taken=new Set(uploaded(v).map(p=>p.slot));
       const slot=[0,1,2,3,4].find(i=>!taken.has(i));
       if(slot===undefined)throw Error('All five photo slots are full. Refresh and try again.');
       const path=workspace.id+'/'+v.id+'/'+crypto.randomUUID()+'.'+allow[file.type];
       const {error:storageError}=await db.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
       if(storageError)throw storageError;
       const {data, error}=await db.from('venue_photos').insert({
         workspace_id:workspace.id,venue_id:v.id,slot,storage_path:path,original_filename:file.name.slice(0,180),uploaded_by:session.user.id
       }).select().single();
       if(error){await db.storage.from(bucket).remove([path]);throw error;}
       records.push(data);uploadedCount++;
     }
     notify(uploadedCount+' picture'+(uploadedCount===1?'':'s')+' added to '+v.name+'.');
   }catch(e){report(e);}
   finally{busy=false;await reload();}
 }
 async function remove(v,id){
   const {db,workspace}=context();const p=uploaded(v).find(x=>x.id===id);if(!p||!workspace)return;
   if(!confirm('Remove this uploaded photo from '+v.name+'?'))return;
   const {error}=await db.from('venue_photos').delete().eq('id',id).eq('workspace_id',workspace.id);
   if(error){report(error);return;}
   const result=await db.storage.from(bucket).remove([p.storage_path]);
   if(result.error)report(new Error('Picture was removed from the gallery, but its storage file may need cleanup: '+result.error.message));
   notify('Picture removed.');await reload();
 }
 window.VenueGallery={
   init(options){context=options.getContext;reload=options.reload;report=options.report;notify=options.notify;},
   setData(next){records=next||[];},
   reset(){records=[];},
   hasPhotos(v){return images(v).length>0;},
   firstImage(v){return images(v)[0]?.url||null;},
   cardMarkup,
   bindCard(root,v){bindSwitcher(root,v,false);},
   detailMarkup,
   bindDetails(v){
     const root=document.querySelector('#venueDetailBody .venue-gallery-panel');if(!root)return;
     bindSwitcher(root,v,true);
     root.querySelector('#venuePhotoFiles')?.addEventListener('change',e=>{
       const files=Array.from(e.target.files||[]);e.target.value='';upload(v,files);
     });
     root.querySelectorAll('[data-remove-photo]').forEach(b=>b.addEventListener('click',()=>remove(v,b.dataset.removePhoto)));
   }
 };
})();