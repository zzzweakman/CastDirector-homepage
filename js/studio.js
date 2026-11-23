'use strict';
const demoCases=window.__PAGE_DATA__.cases;
const demoMethods=window.__PAGE_DATA__.methods;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
let currentCase=demoCases.find(c=>c.id==='selected_icy_cave');
let comparisonPlayer,activeEvent=-1,lastCueTime='';
const actorColors=['#a98763','#8ba371','#83a3b2'];

function scriptText(c){
 const s=c.screenplay;
 return `SCENE\n${s.scene}\n\nVISIBLE CAST\n${s.cast.map((p,i)=>`${i+1}. ${p.appearance}\n   ${p.position}; ${p.posture}`).join('\n')}\n\nORDERED EVENTS\n${s.events.map((e,i)=>`${i+1}. ${e.speaker?e.speaker+' — '+e.speaker_desc:'Action'}${e.words?'\n   “'+e.words+'”':''}${e.voice?'\n   Voice: '+e.voice:''}\n   ${e.action}${e.camera?'\n   '+e.camera:''}`).join('\n\n')}\n\nAUDIO\n${s.audio_caption}\n\nATMOSPHERE\n${s.atmosphere}`;
}
function eventAt(events,time){
 const found=events.findIndex(e=>time>=e.t[0]&&time<e.t[1]);
 return found>=0?found:Math.max(0,events.filter(e=>e.t[0]<=time).length-1);
}
function paintPrompt(time=0,duration=currentCase.duration){
 const stamp=`${time.toFixed(1)} / ${duration.toFixed(1)} s`;
 if(stamp!==lastCueTime){$('#cue-position').textContent=stamp;lastCueTime=stamp;}
 const index=eventAt(currentCase.screenplay.events,time);
 if(index===activeEvent)return;
 activeEvent=index;
 const e=currentCase.screenplay.events[index],speaker=currentCase.screenplay.speakers?.[e.speaker];
 $('#cue-speaker').textContent=speaker?.offscreen?'Off-screen voice':e.speaker||'Action';
 $('#cue-words').textContent=e.words?`“${e.words}”`:e.action;
 $('#cue-action').textContent=e.words?e.action:(e.camera||'');
 $('.live-prompt').style.setProperty('--actor',actorColors[speaker?.color]||'#8c9f70');
 $$('#event-navigation button,.script-track button').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.event)===index)));
 flow.setEvent(e);
}
function showComparison(preserve=false){
 const time=preserve&&comparisonPlayer?comparisonPlayer.videos[0].currentTime:0;
 const playing=preserve&&comparisonPlayer?.playing;
 const audio=preserve&&comparisonPlayer?comparisonPlayer.audioIndex:0;
 if(comparisonPlayer)comparisonPlayer.destroy();
 const c=currentCase,baseline=$('#baseline-select').value;
 const videos=['ours',baseline].map(id=>({label:demoMethods.find(m=>m.id===id).label,src:c.videos[id],poster:c.media?.[id]?.poster||c.poster||c.frame,duration:c.media?.[id]?.duration||c.duration}));
 comparisonPlayer=new ComparisonPlayer({id:'main-comparison',code:c.title,title:c.title,description:c.claim,anchor:'comparisons',videos},$('#evidence-host'));
 comparisonPlayer.onTime=paintPrompt;comparisonPlayer.setAudio(audio);
 let note='Shared playback stops at the shorter clip. Open each video to view its full duration.';
 if(c.baseline_conditioning_note)note+=' '+c.baseline_conditioning_note;
 $('#comparison-note').textContent=note;activeEvent=-1;lastCueTime='';
 if(time>0)comparisonPlayer.seek(time);else paintPrompt(0,comparisonPlayer.duration);
 if(playing)comparisonPlayer.start();
}
function selectCase(id){
 currentCase=demoCases.find(c=>c.id===id);
 const c=currentCase,s=c.screenplay;
 $$('#studio-cases button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.case===id)));
 $('#input-frame').src=c.frame;$('#input-frame').alt=`${c.frame_label||'First frame'}: ${c.title}`;
 $('#frame-label').textContent=c.frame_label||'Input / First frame';
 $('#cast-count').textContent=`${s.cast.length} visible ${s.cast.length===1?'character':'characters'}`;
 $('#scene-caption').textContent=s.scene.charAt(0).toUpperCase()+s.scene.slice(1)+'.';
 $('#event-count').textContent=`${s.events.length} events`;
 $('#script-list').innerHTML=s.events.map((e,i)=>`<button type="button" data-event="${i}" aria-current="false" aria-label="Seek to screenplay event ${i+1}"><span class="event-number">${String(i+1).padStart(2,'0')}</span><span><span class="event-who">${escapeHTML(e.speaker||'Action')}${s.speakers?.[e.speaker]?.offscreen?' · off-screen':''}</span><span class="event-words">${escapeHTML(e.words?'“'+e.words+'”':e.action)}</span>${e.words?`<span class="event-action">${escapeHTML(e.action)}</span>`:''}</span></button>`).join('');
 $('#event-navigation').innerHTML=s.events.map((e,i)=>`<button type="button" data-event="${i}" aria-current="false" aria-label="Seek to event ${i+1}: ${escapeHTML(e.words||e.action)}">${String(i+1).padStart(2,'0')}</button>`).join('');
 $('#script-full').textContent=scriptText(c);flow.setCase(c);showComparison();
}

// One visible animation clock controls phases and moving media cards.
// Packets illustrate routing, not measured features or intermediate denoising states.
class CaseFlow{
 constructor(){
  this.root=$('#pipeline');this.elapsed=0;this.last=0;this.phase=-1;this.frame=0;this.visible=false;this.wanted=!motionPreference.matches;
  this.stages=[
   ['Inputs','The Director receives the first frame and screenplay. Gemma receives the screenplay.'],
   ['Feature encoding','Qwen3-VL supplies audio and video contexts. Gemma supplies text features. Both are encoded once per clip.'],
   ['Joint denoising','Each stream uses Gemma text attention and Director cross-attention. Blocks run from bottom to top; the first-frame latent stays fixed.'],
   ['Refinement and decoding','Stage 1 uses Director conditioning. Stage 2 applies 2× upsampling and four-step joint refinement with Gemma context, followed by audio and video decoding.'],
   ['Output frames','Frames from the selected video. Screenplay cues follow the playback timeline.']
  ];
  this.routes={};
  for(const key of ['frame','text','audio','video','audio-denoise','video-denoise','refine','gemma-input','gemma-audio','gemma-video','gemma-refine']){
   const path=$('#flow-'+key+'-route')||$('#flow-'+key);
   this.routes[key]={path,length:path.getTotalLength()};
  }
  this.packetIds=['image','text','audio','video','audio-denoise','video-denoise','refine','gemma-input','gemma-audio','gemma-video','gemma-refine'];
  $('#trace-play').addEventListener('click',()=>{this.wanted=!this.wanted;this.updateRun();});
  $('#trace-reset').addEventListener('click',()=>{this.elapsed=0;this.last=0;this.wanted=true;this.render();this.updateRun();});
  $$('.step-nav button').forEach(b=>b.addEventListener('click',()=>{this.wanted=false;this.elapsed=(Number(b.dataset.step)+.55)*4400;this.render();this.updateRun();}));
  new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.updateRun();},{threshold:.12}).observe($('.live-workbench'));
  document.addEventListener('visibilitychange',()=>this.updateRun());
  motionPreference.addEventListener('change',()=>{if(motionPreference.matches)this.wanted=false;this.updateRun();});
  this.render();this.updateRun();
 }
 setCase(c){
  $('#flow-case-title').textContent=c.title;
  $('#flow-input-image').setAttribute('href',c.frame);$('#flow-moving-image').setAttribute('href',c.frame);
  $('#flow-input-label').textContent=c.frame_label||'First frame';
  $('#flow-gemma-events').textContent=$('#flow-moving-text').textContent=c.screenplay.events.length+' events';
  (window.FLOW_FRAMES[c.id]||[]).forEach((frame,i)=>{$('#flow-frame-'+i).setAttribute('href',frame.src);$('#flow-frame-time-'+i).textContent=frame.time.toFixed(2)+' s';});
  this.setEvent(c.screenplay.events[0]);this.elapsed=0;this.last=0;this.render();
 }
 setEvent(e){
  const words=(e.words||e.action).split(/\s+/);let first='',second='';
  for(const word of words){if((first+' '+word).trim().length<=19&&!second)first=(first+' '+word).trim();else second=(second+' '+word).trim();}
  if(second.length>20)second=second.slice(0,18).trimEnd()+'…';
  $('#flow-speaker').textContent=e.speaker||'Action';$('#flow-line-1').textContent=first;$('#flow-line-2').textContent=second;
 }
 updateRun(){
  const running=this.wanted&&this.visible&&!document.hidden;
  this.root.dataset.running=String(running);
  $('#trace-play').textContent=this.wanted?'Ⅱ Pause animation':'▶ Play animation';
  $('#trace-play').setAttribute('aria-label',this.wanted?'Pause pipeline animation':'Play pipeline animation');
  $('#trace-play').setAttribute('aria-pressed',String(this.wanted));$('.flow-badge').textContent=this.wanted?'AUTO LOOP':'PAUSED';
  if(running&&!this.frame){this.last=0;this.frame=requestAnimationFrame(t=>this.tick(t));}
  else if(!running){cancelAnimationFrame(this.frame);this.frame=0;this.last=0;}
 }
 tick(now){
  if(this.last)this.elapsed+=Math.min(100,now-this.last);
  this.last=now;this.render();this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 packet(id,key,progress){
  const el=$('#packet-'+id),r=this.routes[key];
  if(progress<0||progress>1){el.setAttribute('opacity','0');return;}
  const eased=progress*progress*(3-2*progress),point=r.path.getPointAtLength(r.length*eased);
  el.setAttribute('transform',`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
  el.setAttribute('opacity',String(Math.min(1,progress*8,(1-progress)*8)));
 }
 render(){
  const progress=(this.elapsed%22000)/4400,phase=Math.floor(progress),local=progress-phase;
  if(phase!==this.phase){
   this.phase=phase;this.root.dataset.step=String(phase);
   $$('.step-nav button').forEach(b=>{if(Number(b.dataset.step)===phase)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
   $$('.f-stage').forEach(g=>g.classList.toggle('is-active',Number(g.dataset.flowStage)===phase));
   $('#trace-counter').textContent=`${String(phase+1).padStart(2,'0')} / 05`;
   $('#step-title').textContent=this.stages[phase][0];$('#step-description').textContent=this.stages[phase][1];
   const statuses=['Receiving the complete screenplay','Encoding text → native features','Cached features → both streams','Native context reused in Stage 2','Text features ready for reuse'];
   $('#gemma-status').textContent=statuses[phase];
   $('#gemma-node').classList.toggle('is-active',phase<4);
   for(const key of ['input','audio','video','refine']){
    const active=key==='input'?phase===0:key==='refine'?phase===3:phase===1||phase===2;
    $('#flow-gemma-'+key+'-route').classList.toggle('is-active',active);
   }
   $('#native-audio-attention').classList.toggle('native-receiving',phase===1||phase===2);
   $('#native-video-attention').classList.toggle('native-receiving',phase===1||phase===2);
   $('#native-refinement').classList.toggle('native-receiving',phase===3);
  }
  this.packetIds.forEach(id=>$('#packet-'+id).setAttribute('opacity','0'));
  if(phase===0){this.packet('image','frame',(local-.08)/.75);this.packet('text','text',(local-.2)/.75);this.packet('gemma-input','gemma-input',(local-.04)/.9);}
  if(phase===1){this.packet('audio','audio',(local-.04)/.84);this.packet('video','video',(local-.14)/.84);this.packet('gemma-audio','gemma-audio',(local-.32)/.65);this.packet('gemma-video','gemma-video',(local-.36)/.64);}
  if(phase===2){this.packet('audio-denoise','audio-denoise',(local*2)%1);this.packet('video-denoise','video-denoise',(local*2+.15)%1);this.packet('gemma-audio','gemma-audio',(local*2)%1);this.packet('gemma-video','gemma-video',(local*2)%1);}
  if(phase===3){this.packet('refine','refine',(local-.05)/.9);this.packet('gemma-refine','gemma-refine',(local-.02)/.95);}
  $$('#gemma-token-grid rect').forEach((cell,i)=>{
   const amount=phase===0?.12:phase===1?Math.max(.12,Math.min(1,(local-i*.032)*7)):phase===4?.6:1;
   cell.setAttribute('opacity',String(amount));
  });
  $$('.flow-output-frame').forEach((g,i)=>{const amount=phase===4?Math.max(0,Math.min(1,(local-i*.23)*3.8)):.12;g.setAttribute('opacity',String(.62+.38*amount));g.setAttribute('transform',`translate(${(20*(1-amount)).toFixed(2)} 0)`);});
 }
}
const flow=new CaseFlow();
$('#studio-cases').addEventListener('click',e=>{const b=e.target.closest('[data-case]');if(b)selectCase(b.dataset.case);});
$('#baseline-select').addEventListener('change',()=>showComparison(true));
for(const host of [$('#script-list'),$('#event-navigation')])host.addEventListener('click',e=>{const b=e.target.closest('[data-event]');if(b)comparisonPlayer.seek(currentCase.screenplay.events[Number(b.dataset.event)].t[0]);});

// All six cover tiles use real clips, with a shared pause control.
let ambientEnabled=!motionPreference.matches,heroVisible=false;
const ambient=$$('.ambient-video');
function updateAmbient(){
 for(const v of ambient){if(ambientEnabled&&heroVisible&&!document.hidden){v.muted=true;if(!v.getAttribute('src'))v.src=v.dataset.src;v.play().catch(()=>{});}else v.pause();}
 $('#ambient-toggle').setAttribute('aria-pressed',String(ambientEnabled));$('#ambient-toggle').textContent=ambientEnabled?'Ⅱ Pause background':'▶ Play background';
}
$('#ambient-toggle').addEventListener('click',()=>{ambientEnabled=!ambientEnabled;updateAmbient();});
new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;updateAmbient();},{threshold:.02}).observe($('.hero'));
motionPreference.addEventListener('change',()=>{if(motionPreference.matches)ambientEnabled=false;updateAmbient();});
document.addEventListener('visibilitychange',()=>{updateAmbient();if(document.hidden&&comparisonPlayer)comparisonPlayer.pause();});
document.addEventListener('play',e=>{if(e.target.classList.contains('ambient-video'))return;if(e.target.closest('#evidence-host'))$('#showreel-video').pause();else if(e.target===$('#showreel-video')&&comparisonPlayer)comparisonPlayer.pause();},true);
selectCase('selected_icy_cave');updateAmbient();
