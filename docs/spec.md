# Film specification

A film is JSON data, with no executable JavaScript or remote media.

Start from `examples/demo.json` or use the `init` command.

## Top-level fields

| Field | Meaning |
| --- | --- |
| `version` | Must be `1` |
| `title` | Short title for the project |
| `width`, `height` | Even canvas dimensions from 320 to 3840 |
| `fps` | Integer frame rate from 24 to 60 |
| `bpm` | Tempo from 60 to 200 |
| `seed` | Integer from 0 to 4294967295, used for repeatable sound and decoration |
| `palette.background` | Background colour in `#RRGGBB` format |
| `palette.foreground` | Main type colour in `#RRGGBB` format |
| `palette.accent` | Primary accent in `#RRGGBB` format |
| `palette.secondary` | Secondary accent in `#RRGGBB` format |
| `scenes` | Array of 1 to 20 scenes |

The total film must be 60 seconds or less.

The frame count is the duration multiplied by the frame rate, rounded to a whole frame.

System fonts can differ across machines, so reproduce final output on the same render environment when exact appearance matters.

## Scene fields

| Field | Meaning |
| --- | --- |
| `type` | `punch`, `stack`, `elastic`, `orbit`, `steps` or `end` |
| `beats` | Duration from 1 to 16 beats |
| `text` | A string or array of strings |
| `eyebrow` | Optional short upper label |
| `caption` | Optional supporting line |

Use arrays when you want to control line breaks or separate the phrases in a sequence.

Keep each message concise, even though the renderer fits the lettering to the available space.

| Style | Useful for |
| --- | --- |
| `punch` | A direct opening statement or major reveal |
| `stack` | A short multi-line message |
| `elastic` | A short word that carries the emphasis |
| `orbit` | A central phrase surrounded by moving geometry |
| `steps` | An ordered set of brief phrases |
| `end` | A readable closing CTA |

## Timing

Seconds per beat = `60 / bpm`.

Film duration = `total beats * 60 / bpm`.

At 120 BPM, 40 beats gives 20 seconds.

For a 20-second example, assign scenes 6, 8, 6, 8, 6 and 6 beats.

The soundtrack follows the same tempo and scene boundaries.

## Example scene

```json
{
  "type": "end",
  "beats": 6,
  "text": ["EXPLORE", "THE NOTEBOOK"],
  "eyebrow": "YOUR NEXT MOVE",
  "caption": "Plan a day that works for you."
}
```

## Aspect ratios

| Format | Canvas |
| --- | --- |
| Landscape | 1920 x 1080 |
| Portrait | 1080 x 1920 |
| Square | 1080 x 1080 |
| Landscape 4K | 3840 x 2160 |

Rendering at a new ratio recomposes the type and geometry for that canvas.

Review the result at the new dimensions because fitting text isn't the same as good editorial line breaks.

Keep essential wording away from platform controls and verify current placement requirements before uploading.
