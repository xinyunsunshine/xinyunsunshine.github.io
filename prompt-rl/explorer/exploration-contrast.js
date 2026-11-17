const ATTEMPT_COUNT = 3;
const PROMPT_ATTEMPTS = [
 ['put the green container on the bottom rack', 'mode-blue'],
 ['put the green box on the bottom rack', 'mode-purple'],
 ['put the green box completely on the bottom rack', 'mode-orange'],
];
// Native recorded frames. The source recordings show different tasks and speeds.
export class ExplorationContrast{
 constructor(root){
  this.root=root;this.index=0;this.time=0;this.ready=false;this.playing=false;this.userPaused=false;this.visible=false;this.generation=0;this.reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.structure();this.videos=[...root.querySelectorAll('video')];
  this.modePaths = [...root.closest('.learning-hero').querySelectorAll('.behavior-modes svg')].map(
   diagram => [...diagram.querySelectorAll('.mode-trace')]
  );
  this.promptLabel = root.closest('.learning-hero').querySelector('.mode-prompt[aria-live]');
  this.bind();
  new IntersectionObserver(es=>{this.visible=es[0].isIntersecting;if(!this.visible)this.pause(false);else if(this.ready&&!this.userPaused&&!this.reduce)this.play()},{threshold:.15}).observe(root);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause(false);else if(this.visible&&this.ready&&!this.userPaused&&!this.reduce)this.play()});
  this.load().catch(()=>{this.$('.ec-status').textContent='The recordings could not load. Refresh to try again.'});
 }
 $(s){return this.root.querySelector(s)}
 structure(){
  this.root.innerHTML = `
   <div class="ec-panels">
    <article class="ec-panel ec-action">
     <div class="ec-film"><video muted playsinline preload="metadata" poster="assets/exploration/action-noise-1.jpg" aria-label="Recorded action-noise attempt on the drawer task"></video></div>
     <p class="ec-summary">Repeated failures give RL no reward.</p>
    </article>
    <article class="ec-panel ec-language">
     <div class="ec-film"><video muted playsinline preload="metadata" poster="assets/exploration/prompt-1.jpg" aria-label="Recorded PDE attempt on the bottom-rack task"></video></div>
     <p class="ec-summary">New prompts can find success sooner.</p>
    </article>
   </div>
   <div class="ec-controls">
    <button class="ec-play" aria-label="Play rollouts" disabled>▶ Play</button>
   </div>
   <p class="ec-status" role="status">Loading recordings…</p>`;
 }

 get finished() {
  return this.ready && this.index === ATTEMPT_COUNT - 1 && this.time >= this.duration - .04;
 }

 bind(){
  this.$('.ec-play').onclick = () => {
   if (this.playing) {
    this.userPaused = true;
    this.pause();
   } else if (this.finished) {
    this.userPaused = false;
    this.select(0, true);
   } else {
    this.play();
   }
  };
 }
 async load(){
  this.urls=await Promise.all(Array.from({length: ATTEMPT_COUNT}, async(_,i)=>Promise.all(['action-noise','prompt'].map(async kind=>{const r=await fetch(`assets/exploration/${kind}-${i+1}.mp4`);if(!r.ok)throw Error('Missing recording');return URL.createObjectURL(await r.blob())}))));
  await this.select(0);
 }
 async select(index,resume=false){
  const generation=++this.generation;this.pause(false);this.ready=false;this.index=index;this.time=0;this.update();this.$('.ec-status').textContent='Loading episode…';
  const [prompt, color] = PROMPT_ATTEMPTS[index];
  this.promptLabel.textContent = '“' + prompt + '”';
  this.promptLabel.className = 'mode-prompt ' + color;
  this.updateModes();
  try{
   await Promise.all(this.videos.map((v,i)=>new Promise((resolve,reject)=>{const cleanup=()=>{v.removeEventListener('loadeddata',done);v.removeEventListener('error',fail)},done=()=>{cleanup();resolve()},fail=()=>{cleanup();reject(Error('Media failed'))};v.addEventListener('loadeddata',done);v.addEventListener('error',fail);v.poster=`assets/exploration/${i===0?'action-noise':'prompt'}-${index+1}.jpg`;v.src=this.urls[index][i];v.load()})));
   if(generation!==this.generation)return;
   this.duration=Math.max(...this.videos.map(v=>v.duration));this.ready=true;this.$('.ec-status').textContent='';this.seek(0);
   if(this.visible&&!document.hidden&&!this.userPaused&&(resume||!this.reduce))this.play();
  }catch{if(generation===this.generation)this.$('.ec-status').textContent='The videos could not load. Refresh to try again.'}
 }
 update(){
  const button = this.$('.ec-play');
  const action = this.playing ? 'Pause' : this.finished ? 'Replay' : 'Play';
  button.disabled = !this.ready;
  button.textContent = action;
  button.setAttribute('aria-label', action + ' rollouts');
 }
 seek(t){this.time=Math.max(0,Math.min(this.duration||0,t));this.last=performance.now();this.videos.forEach(v=>{if(v.readyState>=1)v.currentTime=Math.min(this.time,Math.max(0,v.duration-.04));if(this.playing&&this.time<v.duration-.04)v.play().catch(()=>{});else v.pause()});this.updateModes();this.update()}
 play(){if(!this.ready||document.hidden||this.playing||this.finished)return;if(this.time>=this.duration-.05)this.seek(0);this.userPaused=false;this.playing=true;this.last=performance.now();this.videos.forEach(v=>{if(this.time<v.duration-.04)v.play().catch(()=>{})});this.update();this.frame=requestAnimationFrame(()=>this.syncPlayback())}
 pause(update=true){cancelAnimationFrame(this.frame);this.playing=false;this.videos.forEach(v=>v.pause());if(update)this.update()}
 updateModes(){
  this.modePaths.forEach((paths, side) => {
   const video = this.videos[side];
   const end = video.duration - .04;
   const progress = this.ready && end > 0 ? Math.min(1, video.currentTime / end) : 0;
   paths.forEach((path, attempt) => {
    const revealed = attempt === this.index ? (this.reduce ? 1 : progress) : 0;
    path.style.strokeDashoffset = 100 * (1 - revealed);
   });
  });
 }
 syncPlayback(){
  if(!this.ready||!this.playing)return;
  const now=performance.now();this.time=Math.min(this.duration,this.time+(now-this.last)/1000);this.last=now;
  for(const v of this.videos){
   const target=Math.min(this.time,Math.max(0,v.duration-.04));
   if(this.time>=v.duration-.04){v.pause();if(Math.abs(v.currentTime-target)>.02)v.currentTime=target;}
   if(Math.abs(v.currentTime-target)>.3)v.currentTime=target;
  }
  this.updateModes();
  if (this.time >= this.duration - .04) {
   if (this.finished) this.pause();
   else this.select(this.index + 1, true);
   return;
  }
  this.frame=requestAnimationFrame(()=>this.syncPlayback());
 }
}
