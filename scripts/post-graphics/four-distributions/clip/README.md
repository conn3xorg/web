# Verify clip

`verify.tape` records `apps/site/public/media/blog/four-distributions/verify.mp4`
with [VHS](https://github.com/charmbracelet/vhs) on macOS, in an empty
directory, with `cosign`, `gh` (signed in) and `sha256sum` on the `PATH`. The
tape downloads conn3x v0.6.3 for darwin/arm64 itself and checks it the way the
release notes describe. Encode as in `../../why-conn3x/clip/README.md`, poster
from the last frame.
