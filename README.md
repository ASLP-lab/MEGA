# MEGA

**MEGA: Melody-Guided and Harmony-Aligned Vocal Accompaniment Generation**

Project website with the [paper](assets/paper/MEGA.pdf), model overview, evaluation results, and interactive audio comparisons. Built with HTML, CSS, and JavaScript; no build step or backend is required.

## Local preview

Run from the repository root with Python 3.9 or later:

```bash
python3 scripts/serve.py --port 8000
```

Open [http://localhost:8000/](http://localhost:8000/). The preview server supports HTTP byte ranges for audio seeking. Use an HTTP server rather than opening `index.html` directly so the browser can load the JSON data.

## Results and audio demos

Results reproduce Table 1 of the paper. Objective scores cover 500 songs per dataset; subjective scores are pooled across both datasets and reported as MOS with 95% confidence intervals.

The listening section contains 10 curated examples. Each offers the original vocal and outputs from MEGA, ACE-Step 1.5, LaDA-Band, and AnyAccomp. Each model's generated accompaniment is added to the original vocal at unity gain. Audio loads on demand, and switching models can preserve the playback position.

## Content

| Content | Location |
| --- | --- |
| Page, authors, and abstract | `index.html` |
| Styles and interactions | `assets/css/`, `assets/js/` |
| Evaluation results | `data/results.json` |
| Sample order, captions, durations, and waveforms | `data/samples.json` |
| Audio recordings | `assets/audio/<sample-id>/` |
| Paper | `assets/paper/MEGA.pdf` |
| Model diagram | `assets/images/architecture.pdf`, `assets/images/architecture.png` |

To update the demos, edit `data/samples.json` and the corresponding audio files. Each sample uses the `vocal`, `mega`, `ace`, `lada`, and `anyaccomp` audio keys. Keep duration and waveform data consistent with each recording, and remove audio files that are no longer referenced. If the sample count changes, update the initial `total-samples` and `wheel-total` counters in `index.html`.

The repository can be served by a static host such as GitHub Pages. Asset URLs are relative and support hosting under a project subpath. The root `.nojekyll` file is included for GitHub Pages.

## Font attribution

The bundled Manrope font is distributed under the [SIL Open Font License](assets/fonts/OFL-Manrope.txt).
