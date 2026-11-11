const copy=document.querySelector('#copy-citation');
copy.onclick=async()=>{try{await navigator.clipboard.writeText(document.querySelector('#citation-text').textContent);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy citation',1800)}catch{copy.textContent='Select the citation to copy'}};

const storyRollouts = document.querySelector('.story-rollouts');
if (storyRollouts) {
  const story = storyRollouts.closest('.efficiency-story');
  const stages = [...storyRollouts.querySelectorAll('.story-stage')];
  const guides = [...story.querySelectorAll('.story-target')];
  const chartSteps = guides.map(guide => Number(guide.dataset.x));
  const plotSteps = stages.map(stage => Number(stage.dataset.plotStep));
  const curveReveal = story.querySelector('#story-curve-reveal');
  const cueStep = story.querySelector('#story-step');
  const stageVideos = stages.map(stage => [...stage.querySelectorAll('video')]);
  const videos = stageVideos.flat();
  const playback = story.querySelector('#story-playback');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const playbackRate = 6;
  let currentStage = 0;
  let wantsPlayback = !motionPreference.matches;
  let onScreen = false;
  let finished = false;
  let advanceTimer;
  let curveFrame;
  curveReveal.setAttribute('width', chartSteps[0] + 8);
  story.classList.add('is-at-start');

  for (const video of videos) {
    video.defaultPlaybackRate = playbackRate;
    video.playbackRate = playbackRate;
    video.addEventListener('ended', syncStoryPlayback);
    video.addEventListener('error', syncStoryPlayback);
  }

  function selectStage(index) {
    currentStage = index;
    story.classList.toggle('is-at-start', plotSteps[index] === 0);
    cueStep.textContent = stages[index].getAttribute('aria-label');
    stages.forEach((stage, i) => {
      stage.classList.toggle('is-current', i === index);
      stage.setAttribute('aria-hidden', String(i !== index));
    });
    guides.forEach((guide, i) => guide.classList.toggle('is-current', i === plotSteps[index]));
  }

  function paintCurve() {
    const start = chartSteps[plotSteps[Math.max(0, currentStage - 1)]];
    const end = chartSteps[plotSteps[currentStage]];
    const progress = Math.min(...stageVideos[currentStage].map(video => {
      if (video.ended || video.error) return 1;
      return Number.isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration : 0;
    }));
    curveReveal.setAttribute('width', start + (end - start) * progress + 8);
  }

  function animateCurve() {
    paintCurve();
    curveFrame = requestAnimationFrame(animateCurve);
  }

  function syncStoryPlayback() {
    clearTimeout(advanceTimer);
    cancelAnimationFrame(curveFrame);
    const shouldPlay = wantsPlayback && onScreen && !document.hidden;
    const activeVideos = stageVideos[currentStage];
    for (const video of videos) {
      if (shouldPlay && activeVideos.includes(video)) {
        if (!video.ended && !video.error && video.paused) video.play().catch(() => {});
      } else if (!video.paused) {
        video.pause();
      }
    }
    playback.textContent = shouldPlay ? 'Pause' : finished ? 'Replay' : 'Play';
    paintCurve();
    if (shouldPlay) {
      for (const video of stageVideos[currentStage + 1] ?? []) video.preload = 'auto';
      if (!motionPreference.matches) curveFrame = requestAnimationFrame(animateCurve);
    }
    if (shouldPlay && activeVideos.every(video => video.ended || video.error)) {
      advanceTimer = setTimeout(() => {
        if (currentStage + 1 === stages.length) {
          finished = true;
          wantsPlayback = false;
        } else {
          selectStage(currentStage + 1);
        }
        syncStoryPlayback();
      }, 550);
    }
  }

  playback.hidden = false;
  playback.addEventListener('click', () => {
    if (finished) {
      finished = false;
      for (const video of videos) {
        if (video.readyState) video.currentTime = 0;
      }
      selectStage(0);
    }
    wantsPlayback = !wantsPlayback;
    syncStoryPlayback();
  });
  motionPreference.addEventListener('change', event => {
    wantsPlayback = !event.matches && !finished;
    syncStoryPlayback();
  });
  document.addEventListener('visibilitychange', syncStoryPlayback);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    syncStoryPlayback();
  }, { threshold: .15 }).observe(storyRollouts);
}
