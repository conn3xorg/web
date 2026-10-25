# Convert clip

`convert.tape` records `apps/site/public/media/blog/coming-from-ansible/convert.mp4`
with [VHS](https://github.com/charmbracelet/vhs) and conn3x v0.4.0. Run it in a
directory holding `site.yml`, `inventory.ini` and `files/app.conf` from here, then:

```sh
ffmpeg -i convert.mp4 -an -c:v libx264 -pix_fmt yuv420p -crf 24 -preset slow -movflags +faststart out.mp4
ffmpeg -sseof -0.2 -i convert.mp4 -frames:v 1 poster.png && cwebp -q 85 poster.png -o convert.webp
```
