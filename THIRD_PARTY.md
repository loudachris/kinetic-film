# Dependencies and provenance

The source code, demo specification and documentation in this repository are released under the [MIT licence](LICENSE).

The renderer and soundtrack synthesiser are independent implementations created for this edition.

Beat-timed typography is the creative approach; this package doesn't bundle or require Scenario's engine, scripts, examples, fonts or music.

## Installed separately

| Component | Purpose | Licence information |
| --- | --- | --- |
| Playwright | Drives the local browser during capture | Apache-2.0, included in the installed package |
| Chromium | Draws the canvas | Its own notices, included with the downloaded browser |
| FFmpeg and FFprobe | Encode and inspect video and audio | Licence depends on your installed build; run `ffmpeg -L` |
| Node.js | Runs the command-line tools | Its own notices, included with the runtime |
| System fonts | Draw text on your machine | Use fonts you're entitled to use in your output |

Dependencies retain their own licences and aren't relicensed by this repository.

No third-party font files or source media are bundled.

The synthesiser creates its audio from oscillators and seeded noise, without downloaded samples.

Your own wording, logos, images, music and other additions remain subject to their respective permissions.
