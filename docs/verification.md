# Tested capabilities

Checked on 29 October 2026 using Windows, Node 24.16, Playwright 1.58.2, Chrome 156 and FFmpeg/FFprobe 8.1.1.

## Automated checks

- 13 code tests passed for validation, repeat rendering, portrait word fitting, audio, output protection, command handling, loopback routes and subprocess failures.
- The generic landscape demo rendered at 1280 x 720, 30 fps, 600 frames and 20 seconds.
- The MP4 passed a full video and audio decode.
- Video used H.264 with yuv420p, BT709 metadata and a 1:1 pixel aspect ratio.
- The soundtrack used stereo AAC at 48 kHz and matched the 20-second video duration.
- Synthesised PCM is deterministic for the same spec and seed, with a bounded peak.
- Skill frontmatter passed validation.
- All 6 scenes received browser frame inspection in landscape, portrait and square layouts.

The animated README preview was generated from the generic demo.

## Interpretation

These checks confirm the tested behaviour on the recorded environment.

The code uses platform-neutral Node interfaces, but macOS and Linux haven't been exercised in this release check.

The default downloaded Playwright browser and every system font combination haven't been independently tested.

System fonts can change line breaks and the appearance of a render between machines.

A technical pass doesn't establish headphone listening quality, platform approval, commercial results or compatibility with every device.

Inspect your own final video and read its generated `.check.json` report before delivery.

The `check` command measures and decodes the file you give it; it doesn't compare that file with your intended brief or spec.
