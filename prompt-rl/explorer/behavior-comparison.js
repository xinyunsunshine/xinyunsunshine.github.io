// A prompt-conditioned policy space, visualized from recorded PBR videos and states.
const COLORS=['#2785b0','#8c62cf','#ca5f91','#249b90','#be882d','#6175cc','#b34842','#55854c','#a26836','#645cb4','#418c9c'];
const LABELS={microwave:'Microwave','2':'Moka pot',goal_t1:'Plate → stove',goal_t3:'Drawer + cheese',goal_t4:'Plate → drawer'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const word=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
function difference(a,b){const aa=a.split(/\s+/).map(word),bb=b.split(/\s+/).map(word),d=Array.from({length:aa.length+1},()=>Array(bb.length+1).fill(0));for(let i=aa.length-1;i>=0;i--)for(let j=bb.length-1;j>=0;j--)d[i][j]=aa[i]===bb[j]?1+d[i+1][j+1]:Math.max(d[i+1][j],d[i][j+1]);let i=0,j=0;const same=new Set();while(i<aa.length&&j<bb.length){if(aa[i]===bb[j]){same.add(j);i++;j++}else if(d[i+1][j]>=d[i][j+1])i++;else j++}return bb.map((_,i)=>!same.has(i))}
export class BehaviorComparison{
 constructor(root){
  this.root=root;this.$=s=>root.querySelector(s);this.videos=[];this.urls=[];this.time=0;this.ready=false;this.playing=false;this.visible=false;this.userPaused=false;this.focus=null;this.hover=null;this.mode='all';this.projection='top';this.metric='doorRotation';this.generation=0;
  this.structure();this.bind();this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);
  new IntersectionObserver(es=>{this.visible=es[0].isIntersecting;if(!this.visible)this.pause(false);else if(this.ready&&!this.userPaused&&!this.reduce)this.play()},{threshold:.08}).observe(root);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause(false);else if(this.visible&&this.ready&&!this.userPaused)this.play()});
  this.load().catch(()=>{this.$('#swarm-status').textContent='The recordings could not load. Refresh or open the full 3D library below.'});
 }
 get reduce(){return matchMedia('(prefers-reduced-motion: reduce)').matches}
 structure(){this.root.innerHTML=`<div class="swarm-guide-intro" aria-live="polite"><span class="eyebrow" id="swarm-guide-kicker">WHAT TO LOOK FOR</span><h3 id="swarm-guide-title"></h3></div><div class="swarm-transport"><button id="behavior-play" aria-label="Play recorded responses" disabled>▶</button><input id="behavior-time" type="range" min="0" max="1000" step="1" value="0" aria-label="Shared elapsed time for recorded responses" disabled><span id="behavior-clock">0.0 s</span><button id="behavior-end" disabled>Final frames</button><button id="behavior-replay" aria-label="Replay recorded responses" disabled>↻ Replay</button></div><div id="swarm-grid" class="swarm-grid" aria-label="Synchronized prompt-conditioned rollouts"></div><div class="swarm-options"><div class="swarm-taskbar"><div id="behavior-tasks" role="group" aria-label="Policy exploration scene"></div><span>π<sub>0.5</sub> · fixed weights</span></div></div><div class="swarm-status-row"><span id="swarm-status" role="status">Loading recorded responses…</span><button id="swarm-clear" hidden>Clear spotlight</button></div><div class="swarm-explanation" hidden><span id="swarm-focus-kicker"></span><h4 id="swarm-focus-title"></h4><p id="swarm-focus-copy"></p></div>`}
 bind(){
  this.$('#behavior-play').onclick=()=>{if(this.playing){this.userPaused=true;this.pause()}else this.play()};
  this.$('#behavior-replay').onclick=()=>{this.seek(0);this.play()};
  this.$('#behavior-end').onclick=()=>{this.userPaused=true;this.pause();this.seek(this.duration)};
  this.$('#behavior-time').oninput=e=>{this.userPaused=true;this.pause();this.seek(+e.target.value/1000*this.duration)};
  this.$('#swarm-clear').onclick=()=>{this.focus=null;this.hover=null;this.applyFocus()};
 }
 async load(){const r=await fetch('./explorer/data/behavior-comparison.json?v=20261014-language-captions2');if(!r.ok)throw Error('Missing data');this.tasks=(await r.json()).tasks;for(const t of this.tasks){const b=document.createElement('button');b.dataset.scene=t.id;b.textContent=LABELS[t.id];b.onclick=()=>this.selectTask(t);this.$('#behavior-tasks').append(b)}await this.selectTask(this.tasks[0])}
 async selectTask(task){
  const gen=++this.generation;this.abort?.abort();this.abort=new AbortController();const signal=this.abort.signal;this.pause(false);this.ready=false;this.task=task;this.time=0;this.focus=null;this.hover=null;this.mode='all';this.userPaused=false;
  for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
  this.prompts=task.prompts;
  this.duration=Math.max(...this.prompts.map(p=>p.duration));this.metric=task.id==='microwave'?'doorRotation':'objectMotion';
  this.root.querySelectorAll('[data-scene]').forEach(b=>{const on=b.dataset.scene===task.id;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
  this.renderGuide();
  this.renderCards();this.applyFocus();this.update();
  this.$('#swarm-status').textContent='Loading recordings…';
  try{
   const clips=await Promise.all(this.prompts.map(async p=>{const r=await fetch('assets/raytraced-pbr/'+p.key+'.mp4',{signal});if(!r.ok)throw Error('Missing video');return r.blob()}));if(gen!==this.generation)return;
   this.urls=clips.map(b=>URL.createObjectURL(b));
   await Promise.all(this.videos.map((v,i)=>new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve()},fail=()=>{cleanup();reject(Error('Media failed'))},aborted=()=>{cleanup();reject(Error('Superseded'))},cleanup=()=>{v.removeEventListener('loadeddata',done);v.removeEventListener('error',fail);signal.removeEventListener('abort',aborted)};v.addEventListener('loadeddata',done);v.addEventListener('error',fail);signal.addEventListener('abort',aborted,{once:true});v.src=this.urls[i];v.load()})));
   if(gen!==this.generation)return;this.ready=true;this.$('#swarm-status').textContent='';this.seek(0);if(this.visible&&!document.hidden&&!this.reduce)this.play();
  }catch{if(gen===this.generation)this.$('#swarm-status').textContent='A clip could not load. Choose another scene or open the full 3D library below.'}
 }
 renderGuide(){
  const goal = this.task.goal;
  this.$('#swarm-guide-kicker').textContent='RECORDED POLICY RESPONSES';
  this.$('#swarm-guide-title').textContent='“' + goal.charAt(0).toUpperCase() + goal.slice(1) + '”';
 }
 observation(p,i){
  const notes={
   microwave:{
    c0:['Names the goal','“Close the microwave” states the goal; this rollout moves the mug and leaves the door open.'],
    p0:['Adds a stopping cue','“Door” names the target; “until it clicks” gives an endpoint. This rollout pushes the door shut.'],
    p1:['Changes the motion verb','“Swing … shut” still produces mug movement. A different verb does not ensure a door interaction.'],
    p2:['Different verb, same result','“Slide … closed” also elicits door closure. Different wording can access the same useful behavior.'],
    p3:['Changes the stopping cue','With “all the way” instead of “until it clicks”, this rollout moves the mug rather than closing the door.'],
    p4:['Distinguishes the objects','“Not the cabinet” contrasts two targets. This rollout closes the microwave door.']
   },
   '2':{
    canonical:['Leaves the destination implicit','“Put … on it” leaves the placement target implicit. This rollout does not place the moka pot on the burner.'],
    w0:['Names the destination twice','Repeating “burner” makes the placement target explicit. This rollout moves the moka pot onto it.'],
    w1:['Clarifies the stove target','“Stove burner” specifies the target before “onto it”. This rollout completes the moka-pot placement.'],
    w2:['Specifies the final pose','“Flat on the burner” describes the desired placement. This rollout puts the moka pot on the burner.'],
    w3:['Names the placement target','“On the burner” replaces the implicit destination. This rollout places the moka pot successfully.'],
    w4:['Rephrases the destination','“Over the burner” also elicits successful moka-pot placement, despite a different spatial phrase.'],
    f0:['Requests a different object','“Frying pan” changes the requested object. The moka pot stays in place; its task is not completed.'],
    f1:['Targets the pan handle','The prompt describes moving the pan handle. This rollout does not complete the moka-pot placement.'],
    f2:['Specifies a different interaction','“Contact … handle” and “drag” describe a pan interaction. The moka pot stays in place.'],
    f3:['Describes a pulling motion','“Pull the pan in a straight line” redirects the prompt toward the pan. The moka-pot task remains incomplete.'],
    f4:['Restricts the target to the pan','“Only the frying pan” excludes the task object. The moka pot stays in place.']
   },
   goal_t1:{
    c0:['Names the goal','“Plate on the stove” states the destination. The robot moves the plate but does not complete the placement.'],
    p1:['Adds object, source and motion','“White plate”, “counter” and “steady motion” specify the transfer. This rollout places the plate on the burner.'],
    p2:['Specifies pickup and placement','“Pick up … with a steady motion” describes the transfer. This rollout completes the stove placement.'],
    p3:['Changes the motion description','“Carefully” replaces a steady-motion cue. The plate moves, but this rollout does not complete the placement.'],
    p4:['Specifies a steady placement','“Set it steadily on the stove burner” describes the final motion and target. This rollout completes the placement.']
   },
   goal_t3:{
    c0:['Uses “top layer”','“Top layer of the drawer” describes the target. This rollout leaves the cream cheese in place.'],
    p0:['Names drawer and container','“Top drawer” and “cream cheese container” specify the interaction targets. This rollout puts the container inside.'],
    p2:['Makes the order explicit','“First open … then place” specifies the sequence. This rollout opens the drawer and transfers the cream cheese.'],
    p3:['Similar detail, failed transfer','This also names the drawer and container, yet leaves the cheese in place. Similar phrasing can elicit different behavior.'],
    p4:['Adds an appearance cue','“White cream cheese container” identifies the object visually. This rollout transfers it into the drawer.']
   },
   goal_t4:{
    c0:['Names the destination','“On the top of the drawer” states the goal. This rollout moves the plate without completing the placement.'],
    p0:['Specifies source and surface','“From table to top surface of black drawer” specifies the transfer. This rollout places the plate on top.'],
    p1:['Makes the surface explicit','“Top surface” names the destination surface. This rollout completes the plate transfer.'],
    p2:['Identifies the destination object','“Black drawer” identifies the destination. This rollout moves the plate onto its top.'],
    p3:['Specifies the route','“Directly” describes the transfer, while “black drawer” names the target. This rollout completes the placement.'],
    p4:['Adds an avoidance constraint','“Without touching other objects” constrains the prompt. This rollout still completes the plate placement.']
   }
  };
  const [title,copy]=notes[this.task.id][p.id];
  const result=this.task.id==='microwave'?'Door '+p.doorRotation.at(-1).toFixed(0)+'° · mug '+p.objectMotion.at(-1).toFixed(1)+' cm':'Object moved '+p.objectMotion.at(-1).toFixed(1)+' cm';
  return{title,copy,result};
 }

 renderCards(){
  const grid=this.$('#swarm-grid');grid.replaceChildren();const baseline=this.task.prompts.find(p=>p.canonical).text;this.videos=[];this.cards=[];
  this.prompts.forEach((p,i)=>{const card=document.createElement('article');card.className='swarm-card';card.style.setProperty('--prompt-color',COLORS[i]);card.dataset.prompt=p.id;
   const note=this.observation(p,i);const changes=difference(baseline,p.text);const quote=p.text.split(/\s+/).map((w,j)=>changes[j]?'<mark>'+esc(w)+'</mark>':esc(w)).join(' ');
   card.innerHTML=`<div class="swarm-card-head"><span class="swarm-outcome ${p.outcome==='success'?'is-success':'is-failure'}">${p.outcome==='success'?'✓ Success':'× Failure'}</span></div><div class="swarm-video"><video muted playsinline preload="metadata" poster="assets/raytraced-pbr/${p.key}.jpg" aria-label="Recorded rollout for prompt ${i+1}: ${esc(p.text)}"></video><span class="swarm-frame-time">Loading…</span></div><button class="swarm-prompt" aria-label="Spotlight prompt ${i+1}: ${esc(p.text)}" aria-pressed="false">“${quote}”</button><div class="swarm-observation"><h4>${esc(note.title)}</h4><p>${esc(note.copy)}</p></div>`;
   card.querySelector('.swarm-prompt').onclick=()=>this.select(i);card.onpointerenter=()=>{this.hover=i;this.applyFocus(false)};card.onpointerleave=()=>{this.hover=null;this.applyFocus(false)};
   const video=card.querySelector('video');this.videos.push(video);this.cards.push(card);grid.append(card);
  });
 }
 select(i){this.focus=this.focus===i?null:i;this.hover=null;this.applyFocus()}
 activeSet(){return new Set(this.focus==null?this.prompts.map((_,i)=>i):[this.focus])}
 applyFocus(copy=true){
  if(!this.prompts)return;const active=this.activeSet(),hasFocus=active.size<this.prompts.length;
  this.cards.forEach((card,i)=>{const on=active.has(i);card.classList.toggle('swarm-dim',!on);card.classList.toggle('spotlight',on&&hasFocus);card.classList.toggle('hovered',this.hover===i);card.querySelector('.swarm-prompt').setAttribute('aria-pressed',String(this.focus===i));for(const group of [this.pathGroups?.[i],this.effectGroups?.[i]])if(group){group.g.style.opacity=on?'1':'.12';group.trail.setAttribute('stroke-width',this.hover===i?4:3);if(on&&hasFocus||this.hover===i)group.g.parentNode.append(group.g)}});
  this.root.querySelectorAll('#swarm-key [data-index]').forEach(b=>{const i=+b.dataset.index;b.classList.toggle('selected',active.has(i)&&hasFocus);b.classList.toggle('dim',!active.has(i));b.setAttribute('aria-pressed',String(this.focus===i))});
  this.$('#swarm-clear').hidden=!hasFocus;
  if(!copy)return;this.$('.swarm-explanation').hidden=this.focus==null;
  if(this.focus!=null){const p=this.prompts[this.focus],note=this.observation(p,this.focus);this.$('#swarm-focus-kicker').textContent='PROMPT '+(this.focus+1)+' · RECORDED '+(p.outcome==='success'?'SUCCESS':'FAILURE');this.$('#swarm-focus-title').textContent='“'+p.text+'”';this.$('#swarm-focus-copy').textContent=note.copy+' Clear the spotlight to compare all shown recordings again.'}
 }
 update(){
  if(!this.prompts)return;for(const id of ['#behavior-play','#behavior-time','#behavior-end','#behavior-replay'])this.$(id).disabled=!this.ready;this.$('#behavior-play').textContent=this.playing?'Ⅱ':'▶';this.$('#behavior-play').setAttribute('aria-label',this.playing?'Pause all recorded responses':'Play all recorded responses');this.$('#behavior-clock').textContent=this.time.toFixed(1)+' / '+this.duration.toFixed(1)+' s';this.$('#behavior-time').value=String(Math.round(this.time/this.duration*1000));
  this.prompts.forEach((p,i)=>{this.cards[i].querySelector('.swarm-frame-time').textContent=!this.ready?'Loading…':this.time>=p.duration-.06?'Final frame':this.time.toFixed(1)+' s'});
 }
 seek(time){this.time=Math.max(0,Math.min(this.duration||0,time));this.last=performance.now();this.videos.forEach((v,i)=>{if(v.readyState>=1)v.currentTime=Math.min(this.time,Math.max(0,v.duration-.04));if(this.playing&&this.time<this.prompts[i].duration)v.play().catch(()=>{});else v.pause()});this.update()}
 play(){if(!this.ready||document.hidden)return;if(this.time>=this.duration-.05)this.seek(0);this.userPaused=false;this.playing=true;this.last=performance.now();this.videos.forEach((v,i)=>{if(this.time<this.prompts[i].duration)v.play().catch(()=>{})});this.update()}
 pause(update=true){this.playing=false;this.videos.forEach(v=>v.pause());if(update)this.update()}
 tick(now){requestAnimationFrame(this.tick);if(!this.playing||!this.visible||document.hidden||!this.ready)return;const dt=Math.min((now-this.last)/1000,.12);this.last=now;if(this.videos.some((v,i)=>this.time<this.prompts[i].duration-.1&&v.readyState<3))return;this.time=Math.min(this.duration,this.time+dt);this.videos.forEach((v,i)=>{if(this.time>=this.prompts[i].duration){v.pause();if(Math.abs(v.currentTime-v.duration)>.1)v.currentTime=Math.max(0,v.duration-.04)}else if(Math.abs(v.currentTime-this.time)>.25)v.currentTime=this.time});if(this.time>=this.duration){this.userPaused=true;this.pause(false)}this.update()}
}
