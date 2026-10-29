# Contributing

Use a fictitious brief to reproduce a bug or demonstrate an improvement.

Include the command, dependency versions and the smallest useful spec.

Remove customer names, account IDs, credentials, private paths and unpublished campaign information before opening an issue or pull request.

Generated projects and renders are ignored by Git by default.

Review `git diff --cached` before contributing, including any new binary files.

Run `npm test`, render the changed scene and inspect the delivered frame before submitting a renderer change.

Keep rendering deterministic so seeking backwards produces the same frame as seeking forwards on the same environment.

Contributions should be your own work or carry compatible permission and attribution.

The project's [MIT licence](LICENSE) applies to accepted contributions.
