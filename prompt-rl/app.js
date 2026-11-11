import {ExplorationContrast} from './explorer/exploration-contrast.js?v=brief-reward-captions1';
import {BehaviorComparison} from './explorer/behavior-comparison.js?v=all-prompts1';
import {LiberoRobotViewer} from './explorer/viewer.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
new BehaviorComparison($('#behavior-demo'));
new ExplorationContrast($('#exploration-contrast'));
const viewer=new LiberoRobotViewer($('#viewer'),'./explorer/data/manifest.json');
// Recorded trajectories and meshes are served with the page.
const oldItem=viewer._itemEl.bind(viewer);viewer._itemEl=p=>{const el=oldItem(p);el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',p.text);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click()}};return el};
$('#lrv-play').setAttribute('aria-label','Play or pause 3D rollout');$('#lrv-scrub').setAttribute('aria-label','3D rollout time');$('#lrv-speed').setAttribute('aria-label','3D playback speed');
const visible3D=new IntersectionObserver(es=>{viewer.renderVisible=es[0].isIntersecting;if(!es[0].isIntersecting)viewer.raytracedVideo?.pause()},{rootMargin:'100px'});visible3D.observe($('#viewer'));
const exampleVideos = $$('#real-examples video');
const examplePlay = $('#real-examples-play');
const anyExamplePlaying = () => exampleVideos.some(video => !video.paused && !video.ended);
const updateExamplePlay = () => { examplePlay.textContent = anyExamplePlaying() ? 'Pause all' : 'Play all'; };
for (const video of exampleVideos) {
 for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, updateExamplePlay);
}
examplePlay.onclick = () => {
 if (anyExamplePlaying()) {
  exampleVideos.forEach(video => video.pause());
  return;
 }
 exampleVideos.forEach(video => video.play().catch(() => {}));
};

// Interactive charts redrawn from the vector paths in Figures 4 and 5.
const data=await(await fetch('curves.json?v=paper-se1')).json();let model='pi05',difficulty=0;const hidden=new Set();const colors={'PDE':'#7440be','Action noise':'#1976ba','Parameter noise':'#c46b00','Robometer':'#00865a','RND':'#b62b55'};const modelNames={pi05:'π₀.₅',pi0:'π₀',groot:'GR00T'},figures={pi05:'libero_pi05_envsteps',pi0:'libero_pi0_envsteps',groot:'gr00t_envsteps'};const chart=$('#learning-chart'),NS='http://www.w3.org/2000/svg';const chartLayout=matchMedia('(max-width:760px)'),chartWidth=()=>chartLayout.matches?640:1020;const bounds={l:70,r:chartWidth()-30,t:20,b:325};let chartMeta;
function svg(tag,attrs={},text){const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e}
const citations = {
 'PDE': { label: 'Jiang et al., 2026', url: 'https://arxiv.org/abs/2607.08837' },
 'Action noise': { label: 'Schulman et al., 2017', url: 'https://arxiv.org/abs/1707.06347' },
 'Parameter noise': { label: 'Plappert et al., 2018', url: 'https://arxiv.org/abs/1706.01905' },
 'Robometer': { label: 'Liang et al., 2026', url: 'https://arxiv.org/abs/2603.02115' },
 'RND': { label: 'Burda et al., 2018', url: 'https://arxiv.org/abs/1810.12894' }
};
// Task groups and mean hard-task starting success from the PDE paper.
const benchmarkGroups = {
 pi05: { hardMean: '1.3%', tiers: [
  { count: 47, initial: 'Below 10%' },
  { count: 35, initial: '10% to below 80%' },
  { count: 38, initial: 'At least 80%' }
 ] },
 pi0: { hardMean: '0%', tiers: [
  { count: 49, initial: '0%' },
  { count: 24, initial: 'Above 0% and up to 40%' },
  { count: 27, initial: 'Above 40%' }
 ] },
 groot: { hardMean: '0%', tiers: [
  { count: 49, initial: '0%' },
  { count: 31, initial: 'Above 0% and up to 40%' },
  { count: 40, initial: 'Above 40%' }
 ] }
};

function renderLegend(legend, series, hiddenSeries, redraw) {
 legend.replaceChildren();
 for (const { key, label } of series) {
  const entry = document.createElement('div');
  entry.className = 'chart-legend-entry';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'legend-button';
  button.style.setProperty('--c', colors[key]);
  button.append(document.createElement('i'), label);
  button.setAttribute('aria-pressed', String(!hiddenSeries.has(key)));
  button.addEventListener('click', () => {
   if (!hiddenSeries.delete(key)) hiddenSeries.add(key);
   button.setAttribute('aria-pressed', String(!hiddenSeries.has(key)));
   redraw();
  });

  const citation = citations[key];
  const link = document.createElement('a');
  link.className = 'legend-citation';
  link.href = citation.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = citation.label;
  link.setAttribute('aria-label', `${label} citation, ${citation.label} (opens in a new tab)`);
  entry.append(button, link);
  legend.append(entry);
 }
}

function curveReveal(root, id, duration) {
 const defs = svg('defs');
 const clip = svg('clipPath', { id });
 const width = bounds.r - bounds.l + 14;
 const reveal = svg('rect', { x: bounds.l - 7, y: bounds.t - 8, width, height: bounds.b - bounds.t + 16 });
 const animation = duration && !reduce ? svg('animate', {
  attributeName: 'width', from: 0, to: width, dur: duration, fill: 'freeze', begin: 'indefinite'
 }) : null;
 if (animation) reveal.append(animation);
 clip.append(reveal);
 defs.append(clip);
 root.append(defs);
 return { plot: svg('g', { 'clip-path': `url(#${id})` }), animation };
}

function draw(animate=false){bounds.r=chartWidth()-30;chart.setAttribute('viewBox','0 0 '+chartWidth()+' 390');chart.replaceChildren();const config=data[model],p=config.panels[difficulty];let ymin=p.range[0],ymax=p.range[1];ymin=Math.floor(ymin*10)/10;ymax=Math.ceil(ymax*10)/10;const x=v=>bounds.l+v/config.xmax*(bounds.r-bounds.l),y=v=>bounds.b-(v-ymin)/(ymax-ymin)*(bounds.b-bounds.t);chartMeta={x,y,p,config};
 for(let i=0;i<=4;i++){const val=ymin+(ymax-ymin)*i/4,py=y(val);chart.append(svg('line',{x1:bounds.l,x2:bounds.r,y1:py,y2:py,class:'grid-line'}));chart.append(svg('text',{x:bounds.l-15,y:py+4,'text-anchor':'end',class:'tick'},Math.round(val*100)+'%'))}
 for(let i=0;i<=6;i++){const val=config.xmax*i/6;chart.append(svg('text',{x:x(val),y:bounds.b+26,'text-anchor':'middle',class:'tick'},Number(val.toFixed(1))))}
 chart.append(svg('text',{x:(bounds.l+bounds.r)/2,y:381,'text-anchor':'middle',class:'axis-label'},'ENVIRONMENT STEPS (MILLIONS)'));
 const plotPath = points => points.map(([step, rate], i) =>
  (i ? 'L' : 'M') + x(step).toFixed(1) + ' ' + y(rate).toFixed(1)
 ).join(' ');
 const { plot, animation } = curveReveal(chart, 'simulation-curve-reveal', animate ? '2.4s' : null);
 for (const [name, band] of Object.entries(p.bands)) {
  if (!hidden.has(name)) plot.append(svg('path', {
   d: plotPath(band) + ' Z', fill: colors[name], 'fill-opacity': .13, 'aria-hidden': 'true'
  }));
 }
 if (!hidden.has('PDE')) plot.append(svg('path', {
  d: plotPath(p.bootstrap), fill: 'none', stroke: colors.PDE, 'stroke-width': 2.5, 'stroke-dasharray': '3 2'
 }));
 for (const [name, points] of Object.entries(p.series)) {
  if (hidden.has(name) || !points.length) continue;
  plot.append(svg('path', {d: plotPath(points), stroke: colors[name],
   class: 'chart-line', 'data-series': name}));
  const [step, rate] = points.at(-1);
  plot.append(svg('circle', {cx: x(step), cy: y(rate), r: 4, fill: colors[name], stroke: '#fafbff', 'stroke-width': 2}));
 }
 chart.append(plot);
 chart.append(svg('line',{id:'chart-crosshair',x1:0,x2:0,y1:bounds.t,y2:bounds.b,stroke:'#bac5ac','stroke-dasharray':'4 4',visibility:'hidden'}));chart.append(svg('rect',{x:bounds.l,y:bounds.t,width:bounds.r-bounds.l,height:bounds.b-bounds.t,fill:'transparent',id:'chart-hit'}));
 const { hardMean, tiers } = benchmarkGroups[model];
 const { count, initial } = tiers[difficulty];
 const difficultyName = ['hard', 'medium', 'easy'][difficulty];
 $('#chart-title').textContent = `LIBERO-PRO · ${count} ${difficultyName} tasks · ${modelNames[model]}`;
 $('#chart-initial-success').textContent = `${initial} success before RL`;
 $('#libero-task-count').textContent = tiers.reduce((total, tier) => total + tier.count, 0);
 $('#libero-hard-count').textContent = tiers[0].count;
 $('#libero-hard-start').textContent = hardMean;
 animation?.beginElement();
}
function drawSimulationLegend() {
 const keys = Object.keys(data[model].panels[difficulty].series);
 renderLegend($('#chart-legend'), keys.map(key => ({ key, label: key === 'PDE' ? 'PDE (ours)' : key })), hidden, draw);
}
chart.addEventListener('pointermove',e=>{const {x,y,p,config}=chartMeta;const box=chart.getBoundingClientRect(),sx=(e.clientX-box.left)/box.width*chartWidth();const step=Math.max(0,Math.min(config.xmax,(sx-bounds.l)/(bounds.r-bounds.l)*config.xmax));const line=$('#chart-crosshair');line.setAttribute('x1',x(step));line.setAttribute('x2',x(step));line.setAttribute('visibility','visible');const tip=$('#chart-tooltip');let html='<strong>≈ '+step.toFixed(1)+'M steps</strong>';for(const [name,pts]of Object.entries(p.series)){if(hidden.has(name)||!pts.length)continue;const point=pts.reduce((a,b)=>Math.abs(b[0]-step)<Math.abs(a[0]-step)?b:a);html+='<div><span style="color:'+colors[name]+'">'+name+'</span><span>≈ '+(point[1]*100).toFixed(1)+'%</span></div>'}tip.innerHTML=html;tip.hidden=false;tip.style.left=Math.min(Math.max(0,e.clientX-box.left+15),box.width-180)+'px';tip.style.top='25px'});chart.addEventListener('pointerleave',()=>{$('#chart-tooltip').hidden=true;$('#chart-crosshair')?.setAttribute('visibility','hidden')});
$('#model-tabs').onclick=e=>{const b=e.target.closest('[data-model]');if(!b)return;model=b.dataset.model;hidden.clear();$$('#model-tabs button').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});drawSimulationLegend();draw(true)};$('#difficulty-tabs').onclick=e=>{const b=e.target.closest('[data-difficulty]');if(!b)return;difficulty=+b.dataset.difficulty;$$('#difficulty-tabs button').forEach(x=>x.classList.toggle('selected',x===b));draw(true)};
$('#replay-chart').onclick=()=>draw(true);
drawSimulationLegend();
draw();
if (!reduce) {
 const simulationObserver = new IntersectionObserver(([entry]) => {
  if (entry.intersectionRatio < .2) return;
  simulationObserver.disconnect();
  draw(true);
 }, { threshold: .2 });
 simulationObserver.observe(chart);
}
function reflectSelection(){document.querySelectorAll('.segmented button').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('selected'))));}
document.addEventListener('click',reflectSelection);reflectSelection();
// Cycles renders preserve the source geometry and recorded prompt trajectories.
let renderMode='interactive',renderKey='';
const renderLibraries={pbr:{jobs:[],complete:0,total:33}};
const rtStage=$('#lrv-stage'),rtVideo=document.createElement('video'),rtMessage=document.createElement('div');
rtVideo.className='raytraced-video';rtVideo.controls=true;rtVideo.loop=true;rtVideo.muted=true;rtVideo.playsInline=true;rtVideo.preload='metadata';rtVideo.setAttribute('aria-label','Ray-traced playback of the selected recorded rollout');rtMessage.className='raytraced-message';rtStage.append(rtVideo,rtMessage);viewer.raytracedVideo=rtVideo;
function updateRaytraced(){const library=renderLibraries[renderMode]||renderLibraries.pbr;const prompt=viewer.active;const key=prompt?.traj?.replace(/^tasks\//,'').replace('/traj/','-');const job=library.jobs.find(j=>j.id===key);rtStage.classList.toggle('is-raytraced',renderMode!=='interactive');if(renderMode==='interactive'){rtVideo.pause();viewer.raytraceActive=false;return}viewer.raytraceActive=true;const folder='raytraced-pbr';if(job?.status==='complete'){rtMessage.hidden=true;rtVideo.hidden=false;if(renderKey!==renderMode+key){renderKey=renderMode+key;rtVideo.poster='assets/'+folder+'/'+job.poster;rtVideo.src='assets/'+folder+'/'+job.video}if(viewer.renderVisible)rtVideo.play().catch(()=>{})}else{rtVideo.pause();rtVideo.hidden=true;rtMessage.hidden=false;rtMessage.innerHTML='<strong>'+(!library.jobs.length?'Loading replay…':'Replay unavailable')+'</strong><p>Choose Interactive 3D to explore this trajectory.</p>'}}
const originalSelect=viewer._selectPrompt.bind(viewer);viewer._selectPrompt=async p=>{await originalSelect(p);updateRaytraced()};
$('#renderer-tabs').onclick=e=>{const b=e.target.closest('[data-renderer]');if(!b)return;renderMode=b.dataset.renderer;$$('#renderer-tabs button').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});updateRaytraced()};
async function refreshRenders(){for(const mode of ['pbr']){try{const folder='raytraced-pbr';const response=await fetch('assets/'+folder+'/status.json',{cache:'no-store'});if(response.ok)renderLibraries[mode]=await response.json()}catch{}}updateRaytraced()}
refreshRenders();

// Faithful vector redraw of the four checkpoints in the original project video.
const realChart=$('#real-learning-chart'),realHidden=new Set();
const realSeries=[{key:'PDE',label:'PPO + PDE',points:[[0,.10],[64,.30],[128,.30],[192,.50]]},{key:'Action noise',label:'PPO',points:[[0,.10],[64,.10],[128,.15],[192,.15]]}];
const realX=v=>bounds.l+v/192*(bounds.r-bounds.l),realY=v=>bounds.b-v/.6*(bounds.b-bounds.t);
function drawRealLearning(animate=false){
 bounds.r=chartWidth()-30;realChart.setAttribute('viewBox','0 0 '+chartWidth()+' 390');
 realChart.replaceChildren(svg('title',{id:'real-learning-title'},'Real-robot success rate on one task'),svg('desc',{id:'real-learning-desc'},'Franka with π₀.₅ on one task. At 0, 64, 128, and 192 training rollouts, PPO plus PDE has success rates of 10, 30, 30, and 50 percent. PPO has success rates of 10, 10, 15, and 15 percent.'));
 for(let i=0;i<=6;i++){const v=i/10,py=realY(v);realChart.append(svg('line',{x1:bounds.l,x2:bounds.r,y1:py,y2:py,class:'grid-line'}),svg('text',{x:bounds.l-15,y:py+4,'text-anchor':'end',class:'tick'},i*10+'%'))}
 for(const v of [0,64,128,192])realChart.append(svg('text',{x:realX(v),y:bounds.b+26,'text-anchor':'middle',class:'tick'},v));
 realChart.append(svg('text',{x:(bounds.l+bounds.r)/2,y:381,'text-anchor':'middle',class:'axis-label'},'TRAINING ROLLOUTS'));
 const { plot: lines, animation } = curveReveal(realChart, 'real-curve-reveal', animate ? '3.6s' : null);
 // Draw the baseline first so overlapping PDE checkpoints remain visible.
 for(const series of [...realSeries].reverse()){
  if(realHidden.has(series.key))continue;
  const d=series.points.map(([x,y],i)=>(i?'L':'M')+realX(x)+' '+realY(y)).join(' ');
  lines.append(svg('path',{d,stroke:colors[series.key],class:'chart-line','data-series':series.key}));
  for(const [x,y]of series.points){const attrs={fill:colors[series.key],stroke:'#fcfcff','stroke-width':2};lines.append(series.key==='PDE'?svg('circle',{...attrs,cx:realX(x),cy:realY(y),r:5.5}):svg('rect',{...attrs,x:realX(x)-5,y:realY(y)-5,width:10,height:10,rx:1}))}
 }
 realChart.append(lines,svg('line',{id:'real-learning-crosshair',x1:0,x2:0,y1:bounds.t,y2:bounds.b,stroke:'#a9b4cd','stroke-dasharray':'4 4',visibility:'hidden'}),svg('rect',{x:bounds.l,y:bounds.t,width:bounds.r-bounds.l,height:bounds.b-bounds.t,fill:'transparent'}));
 if(animation){realChart.unpauseAnimations?.();animation.beginElement()}
}
realChart.addEventListener('pointermove',e=>{
 const box=realChart.getBoundingClientRect(),sx=(e.clientX-box.left)/box.width*chartWidth(),rollouts=(sx-bounds.l)/(bounds.r-bounds.l)*192;
 const checkpoint=[0,64,128,192].reduce((a,b)=>Math.abs(b-rollouts)<Math.abs(a-rollouts)?b:a),crosshair=$('#real-learning-crosshair');
 crosshair.setAttribute('x1',realX(checkpoint));crosshair.setAttribute('x2',realX(checkpoint));crosshair.setAttribute('visibility','visible');
 const tip=$('#real-learning-tooltip');tip.innerHTML='<strong>'+checkpoint+' training rollouts</strong>'+realSeries.filter(s=>!realHidden.has(s.key)).map(s=>'<div><span style="color:'+colors[s.key]+'">'+s.label+'</span><span>'+Math.round(s.points.find(p=>p[0]===checkpoint)[1]*100)+'%</span></div>').join('');tip.hidden=false;tip.style.left=Math.max(0,Math.min(e.clientX-box.left+15,box.width-200))+'px';tip.style.top='25px';
});
realChart.addEventListener('pointerleave',()=>{$('#real-learning-tooltip').hidden=true;$('#real-learning-crosshair')?.setAttribute('visibility','hidden')});
$('#replay-real-learning').onclick=()=>drawRealLearning(true);
let realLearningSeen=false,realLearningVisible=false;
renderLegend($('#real-learning-legend'), realSeries, realHidden, drawRealLearning);
drawRealLearning();
function syncRealLearning(){if(document.hidden||!realLearningVisible)realChart.pauseAnimations?.();else realChart.unpauseAnimations?.()}
new IntersectionObserver(es=>{realLearningVisible=es[0].isIntersecting;if(realLearningVisible&&!realLearningSeen){realLearningSeen=true;drawRealLearning(true)}syncRealLearning()},{threshold:.2}).observe($('#real-learning'));
document.addEventListener('visibilitychange',syncRealLearning);

chartLayout.addEventListener('change',()=>{draw();drawRealLearning()});


// Keep the navigation aligned with the four narrative chapters.
const storyLinks=[...document.querySelectorAll('.nav>div>a[href^="#"]')];
const storySections=[...document.querySelectorAll('main>section')];
const storyChapterBySection={theory:'method',simulation:'results','real-examples':'results',rollouts:'explore'};
let storyFrame=false;
function updateStoryChapter(){
 storyFrame=false;
 const current=storySections.filter(s=>s.getBoundingClientRect().top<=140).at(-1)?.id;
 const chapter=storyChapterBySection[current]??current;
 for(const link of storyLinks){const active=link.hash==='#'+chapter;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')}
}
addEventListener('scroll',()=>{if(!storyFrame){storyFrame=true;requestAnimationFrame(updateStoryChapter)}},{passive:true});
updateStoryChapter();
