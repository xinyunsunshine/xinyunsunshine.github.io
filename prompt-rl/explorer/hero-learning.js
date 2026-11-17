export function initHeroLearning(root){
 if(!root)return;
 const videos=[...root.querySelectorAll('video')],toggle=root.querySelector('#hero-video-toggle'),scrub=root.querySelector('#hero-video-time');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let visible=false,wanted=!reduce,playing=false,starting=false,raf,cycleTimer,run=0;
 const duration=()=>Math.max(0,...videos.map(v=>Number.isFinite(v.duration)?v.duration:0));
 const stop=()=>{++run;playing=false;cancelAnimationFrame(raf);clearTimeout(cycleTimer);videos.forEach(v=>v.pause());toggle.textContent='▶ Play';toggle.setAttribute('aria-label','Play real-robot examples')};
 const tick=()=>{if(!playing)return;const end=duration(),time=Math.max(...videos.map(v=>v.currentTime));scrub.value=end?time/end*1000:0;if(videos.every(v=>v.ended)){playing=false;cycleTimer=setTimeout(()=>{videos.forEach(v=>v.currentTime=0);start()},1200);return}raf=requestAnimationFrame(tick)};
 const start=async()=>{if(!visible||document.hidden||!wanted||playing||starting)return;starting=true;const gen=++run;clearTimeout(cycleTimer);if(videos.every(v=>v.ended))videos.forEach(v=>v.currentTime=0);const results=await Promise.all(videos.map(v=>v.ended?Promise.resolve():v.play().catch(()=>false)));starting=false;if(gen!==run)return;if(!visible||document.hidden||!wanted){stop();return}if(results.some(r=>r===false)){wanted=false;stop();return}playing=true;toggle.textContent='Ⅱ Pause';toggle.setAttribute('aria-label','Pause real-robot examples');cancelAnimationFrame(raf);tick()};
 toggle.onclick=()=>{wanted=!wanted;if(wanted)start();else stop()};root.querySelector('#hero-video-replay').onclick=()=>{videos.forEach(v=>v.currentTime=0);scrub.value=0;wanted=true;start()};
 scrub.oninput=()=>{wanted=false;stop();const time=Number(scrub.value)/1000*duration();videos.forEach(v=>{if(Number.isFinite(v.duration))v.currentTime=Math.min(time,Math.max(0,v.duration-.04))})};
 videos.forEach(v=>{v.addEventListener('canplay',()=>{if(wanted&&visible&&!playing)start()});v.addEventListener('error',()=>{stop();const note=root.querySelector('#hero-video-error');note.hidden=false;note.textContent='Video unavailable. View the real-robot demos below.'})});
 new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible)start();else stop()},{threshold:.12}).observe(root.querySelector('.hero-video-pair'));
 document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
}
