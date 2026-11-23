# CastDirector showcase

Project website: https://zzzweakman.github.io/CastDirector-homepage/

Repository: https://github.com/zzzweakman/CastDirector-homepage

Open **please_click_me.html** or **index.html**. Both entries are identical and work directly from local files or on a static host.

For local HTTP playback, run `python3 serve.py` and open http://127.0.0.1:8127/.

The cover uses the reference demo's moving film wall and gradient title, with the full author list and affiliations visible immediately. The page contains a showreel, four category tabs with a single expanded case card, and the original three-scene method comparison and animated inference pipeline. Immersive audio is expanded by default. Selecting another category closes the previous card and pauses its video. The only comparison baseline is LTX-2.3.

- Combat interactions: training-pad kick, wooden-sword practice, and boxing.
- Group activity: discussion circle, yurt, live-action choir, and the partly hidden diner raising a glass. The requested actions and constraints are listed beside each video.
- Immersive audio: the updated hallway echo clip and speech behind a moving wiper, each with a seekable waveform derived from its audio.
- Animated characters: the supplied puppet conversation and SpongeBob cast clips.

The category hallway clip uses `精选素材/回声 new.mp4`. The hallway method comparison keeps the reference demo's original paired result. No echo or additional audio effects are added by the page. Original audio streams and clip durations are retained. Selected videos are H.264 MP4 at up to 1280 pixels wide; the existing 720p showreel is preserved.

There are no external libraries, font requests, analytics, or build dependencies. Full videos load on demand. The six silent, low-resolution cover previews total about 0.53 MB and pause off-screen; reduced-motion preferences disable automatic motion. Foreground playback is coordinated so clips do not overlap with the comparison's selected audio source.

Edit page structure in `index.html`, color and case styling in `css/showcase.css`, and case descriptions/media paths in `js/showcase-data.js`. `js/data.js` contains comparison screenplays and media; `js/flow-frames.js` maps the pipeline's output frames. Keep `please_click_me.html` identical to `index.html` after changes. Recompute the waveform data when replacing either immersive-audio clip.

The repository root is served by GitHub Pages from the `main` branch. `.nojekyll` keeps the site as plain static files. This folder also works on any other static host.

Author names link to the verified homepage or Google Scholar profile for Zhizhou Zhong, Ruicheng Zhang, Shuiyang Mao, Wei Liu, and Wenhan Luo. Other authors retain `#` placeholder links. All author names share the same appearance without underlines. The page has no footer.
