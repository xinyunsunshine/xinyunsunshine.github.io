# Failed-examples viewer — GitHub Pages embed

Companion to `rollout-viewer/`. Same self-contained static 3D widget, but showing the **3 tasks
where prompt optimization did NOT recover pi0.5 success** — every prompt (canonical *and* all
optimized) fails in the 8-env eval:

- `goal_t0` — open the bottom drawer of the cabinet
- `goal_t5` — Push the cream cheese to the front of the stove
- `goal_t9` — Put the cream cheese on the rack

Fully self-contained: vendored three.js, Draco+WebP-compressed scenes (~1 MB each), no CDN, no
build step, all relative paths. Total ≈ 8 MB.

## Embed

Copy this `failed-examples/` folder into your Pages repo and iframe it (fix `src` to its location):

```html
<div style="position:relative; width:100%; max-width:1200px; aspect-ratio:16/10; margin:2rem auto;">
  <iframe src="failed-examples/index.html"
          style="position:absolute; inset:0; width:100%; height:100%; border:0; border-radius:12px;"
          title="pi0.5 failed prompts viewer" loading="lazy" allowfullscreen></iframe>
</div>
```

Must be served over HTTP(S) (GitHub Pages is fine) — the Draco worker won't load from `file://`.
Scene list / order / camera / prompts are all data-driven in `data/manifest.json`.
