const superscripts=['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸'];
export function initPosteriorSampling(root){
 if(!root)return;
 const $=s=>root.querySelector(s), slider=$('#posterior-horizon');
 const render=(draw=false)=>{
  const h=Number(slider.value),independent=Array.from({length:h},(_,i)=>draw?Math.random()<.5:i%3!==1),right=draw?Math.random()<.5:true,committed=Array(h).fill(right);
  $('#posterior-horizon-output').value=h;root.querySelector('[data-horizon-value]').textContent=h;root.querySelector('[data-horizon-phrase]').textContent=h===1?'right move':'consecutive right moves';
  const track=(id,moves)=>{const el=$(id);el.innerHTML=moves.map((r,i)=>`<span class="posterior-step ${r?'move-right':'move-left'}" style="--step:${i}" aria-hidden="true">${r?'→':'←'}</span>`).join('');el.style.setProperty('--steps',h);el.setAttribute('aria-label',moves.map(r=>r?'right':'left').join(', '))};
  track('#independent-track',independent);track('#committed-track',committed);
  const outcome=(id,moves)=>{const success=moves.every(Boolean);$(id).textContent=(draw?'Sample':'Example')+' · '+(success?'reward reached':'no reward');$(id).classList.toggle('reached-reward',success)};
  outcome('#independent-result',independent);outcome('#committed-result',committed);
  $('#committed-policy').textContent=(draw?'Sample':'Example')+' · always '+(right?'right':'left');
  $('#independent-chance').textContent=(100/2**h).toLocaleString('en-US',{maximumFractionDigits:h>7?2:1})+'%';
  $('#independent-formula').textContent='(½)'+superscripts[h];
 };
 slider.addEventListener('input',()=>render(false));$('#posterior-draw').onclick=()=>render(true);render(false);
}
