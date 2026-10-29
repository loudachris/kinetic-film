---
name: kinetic-film
description: Create beat-timed kinetic typography films from a short product or brand brief with the bundled local canvas renderer and original synthesised soundtrack. Supports landscape, portrait and square MP4 output. Use for text-led promos and launch films, rather than talking-head or footage edits.
---

# Kinetic Film

Use this repository's independent renderer to turn a brief into an editable JSON film and a checked MP4.

Resolve the repository from this file's location and run commands there, regardless of the caller's working directory.

## Build the film

Extract the audience, message, exact CTA, duration, aspect ratio, palette and sound preference.

Preserve explicit wording and brand choices; choose reasonable defaults for optional details.

For a new film, use 20 seconds at 30 fps and 120 BPM unless the brief suggests otherwise.

Choose the aspect ratio for the intended placement; portrait uses a real portrait composition.

Read [the spec reference](docs/spec.md) before writing JSON and [the production guide](docs/guide.md) for commands and verification.

Use `npm run film -- doctor` to check local prerequisites.

Use `npm run film -- init films/my-film --format portrait` to create a project without overwriting existing work.

Write a short brief and beat sheet alongside `spec.json`, then edit that JSON.

Make each scene communicate an idea: a clear opening message, relevant details, then the exact CTA.

Use only claims supplied or verified for this project, and replace all generic demo wording.

Keep essential text short enough to read on a phone; split a crowded phrase across scenes or lines.

Use the scene styles to support the meaning, varying scale, composition and rhythm across the sequence.

The JSON contains data only; don't add executable code, external asset URLs or account identifiers.

## Preview, render and verify

Preview with `npm run film -- preview films/my-film/spec.json` and inspect entrances, settled text and exits.

Render a small draft with an explicit width and height in the intended aspect ratio before a full-resolution export.

The renderer synthesises original electronic music and scene accents locally by default.

Use `--silent` when requested; externally supplied music and voiceover need a separate licensed edit and aren't built-in inputs.

Run `npm run film -- check output/my-film.mp4` after rendering.

Review actual exported frames at every scene, read the CTA at phone size, and listen to the finished soundtrack.

A successful decode check doesn't establish text readability, sound quality, accessibility or compatibility with every device.

Report which checks ran and any remaining limitations.

Provide the video, spec, brief, beat sheet and check report, plus the command needed to reproduce the render.

If local tools aren't available, deliver the brief and JSON with production commands and clearly label the video as unrendered.

Creating a film doesn't authorise posting, uploading to ad accounts, spending money or modifying campaigns.

## Scope

This edition supplies 6 original canvas scene styles and synthesised sound.

It uses system fonts and doesn't include a 3D renderer, footage editing, a proprietary engine, cloud generation or a hosted editor.

The repository's promotional links belong in its documentation, not in the user's film unless requested.
