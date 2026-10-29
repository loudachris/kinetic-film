# From brief to finished film

This guide uses the commands shipped in this repository.

Run them from its root folder after completing the README setup.

## 1. Write the brief

Record the product, audience, main message, exact CTA, duration, aspect ratio, colours and soundtrack preference.

Use a single clear action for the viewer and support claims with evidence you can use publicly.

Save this beside your spec as `BRIEF.md`.

For example:

```text
Product: a reusable daily planner.
Audience: people who want a clear plan for the day.
Message: give your next idea a place to start.
CTA: Explore the notebook.
Duration: 20 seconds.
Format: portrait, 1080x1920, 30 fps.
Palette: navy, warm white, coral and lilac.
Sound: original electronic instrumental with cut accents.
```

## 2. Create the project

```sh
npm run film -- init films/notebook --format portrait
```

Supported formats are `landscape`, `portrait` and `square`.

The command refuses to overwrite an existing project.

Edit `films/notebook/spec.json` using the [spec reference](spec.md).

## 3. Plan the beats

At 120 BPM, each beat lasts 0.5 seconds, so a 20-second film uses 40 beats.

| Beats | Seconds | Message | Style |
| --- | --- | --- | --- |
| 0 to 6 | 0 to 3 | YOUR NEXT IDEA | punch |
| 6 to 14 | 3 to 7 | GIVE IT A PLACE TO START | stack |
| 14 to 20 | 7 to 10 | FOCUS | elastic |
| 20 to 28 | 10 to 14 | A CLEARER DAY | orbit |
| 28 to 34 | 14 to 17 | WRITE / PLAN / BEGIN | steps |
| 34 to 40 | 17 to 20 | EXPLORE THE NOTEBOOK | end |

Use the table as a starting point, then adapt the wording to the brief.

Leave enough time for the viewer to read the CTA after the entrance animation settles.

## 4. Preview the composition

```sh
npm run film -- preview films/notebook/spec.json --port 5678
```

Open the printed loopback address in your browser.

Use the play button and scrub control to inspect every scene.

Preview playback is silent; the exported film carries the soundtrack.

Stop the server with Ctrl+C before moving on if you're using the same terminal.

To capture a still:

```sh
npm run film -- snap films/notebook/spec.json --time 8.5 --out output/notebook-frame.png
```

Check text at its settled size and during the entrance and exit, particularly long words and multi-line CTAs.

## 5. Render a draft

Use a smaller canvas with the same ratio for your first export:

```sh
npm run film -- render films/notebook/spec.json --width 360 --height 640 --out output/notebook-draft.mp4
npm run film -- check output/notebook-draft.mp4
```

Render the final portrait version using the spec's dimensions:

```sh
npm run film -- render films/notebook/spec.json --out output/notebook-final.mp4
npm run film -- check output/notebook-final.mp4
```

Each output path must be new, which keeps earlier reviewed versions intact.

For a landscape 4K export, use `--width 3840 --height 2160` with a landscape composition.

Larger frames and higher frame rates need more processing time and disk space.

## 6. Understand the sound

The renderer creates an original electronic backing track from synthesised drums, bass, tonal layers and transition accents.

It needs no downloaded samples, paid generation service or API key.

The seed controls repeatable details, while the tempo and scene boundaries come from the spec.

Rendering also saves the adjacent `.soundtrack.wav` for later editing.

Use `--silent` to export without audio:

```sh
npm run film -- render films/notebook/spec.json --silent --out output/notebook-silent.mp4
```

If you want voiceover, a particular genre or your own licensed track, edit the finished film in a separate audio/video workflow and check that final file again.

The built-in synthesiser has a fixed electronic arrangement; a descriptive music prompt won't change its genre.

## 7. Verify the actual file

The `check` command probes the file, performs a full decode and writes an adjacent `.check.json` report.

It records technical measurements and a SHA-256 file hash.

Also review the creative result yourself:

- Read every main phrase at the intended viewing size.
- Check each entrance, hold and exit for clipped or obscured text.
- Listen on speakers and headphones for balance, distracting accents and the ending.
- Check the exact CTA and every factual claim.
- Open the MP4 on the device you'll use for playback or upload.

The automated report doesn't measure campaign effectiveness, music preference, loudness compliance for a platform or every hardware decoder.

There are no guaranteed performance or conversion outcomes from a video style.

## 8. Hand over or publish

Keep the final MP4, its soundtrack, the spec, brief, beat sheet and check report together.

Record the render command and dependency versions if someone else needs to reproduce it.

Check current platform requirements for aspect ratio, file size, duration, sound and safe areas before uploading.

Posting publicly, uploading to an ad account and spending money remain separate decisions from rendering a film.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `npm.ps1` is blocked on Windows | Use `npm.cmd` and `npx.cmd` without changing execution policy |
| Chromium executable is missing | Run `npx playwright install chromium` |
| Browser libraries are missing on Linux | Follow Playwright's documented system dependency setup |
| FFmpeg or FFprobe isn't found | Install both and add their containing directory to PATH |
| A particular browser is required | Set `CHROME_PATH` to an installed compatible browser executable |
| Output already exists | Pick a new versioned filename |
| Text feels too small | Shorten it or split the phrase across lines or scenes |
| Colours have low contrast | Increase the contrast between the background and main type |
| A changed seed seems subtle | The seed affects sound and decoration; edit the script and scene styles for a new concept |
| Render stops midway | Read the reported error and use a new output filename after correcting it |

Run `npm test` for the bundled code checks and `npm run film -- doctor` for environment diagnostics.
