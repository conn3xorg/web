Output apply.mp4

Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 16
Set WindowBar Colorful
Set Margin 24
Set MarginFill "#0a1220"
Set BorderRadius 10
Set Width 1280
Set Height 720
Set Padding 28
Set Framerate 30
Set TypingSpeed 40ms
Set Theme { "name": "Conn3x", "black": "#0f1a2b", "red": "#ff8a7a", "green": "#7fd3a7", "yellow": "#ffb86b", "blue": "#8fb3ff", "magenta": "#d6a5ff", "cyan": "#7fd8e6", "white": "#dbe4ef", "brightBlack": "#5d6f88", "brightRed": "#ff9a8c", "brightGreen": "#9be3bf", "brightYellow": "#ffc98a", "brightBlue": "#a9c4ff", "brightMagenta": "#e2bdff", "brightCyan": "#9fe5ef", "brightWhite": "#f3f6fa", "background": "#0f1a2b", "foreground": "#dbe4ef", "selection": "#2a3b55", "cursor": "#ff7a2e" }

Hide
Type "export PS1='$ ' PATH=/opt/homebrew/bin:$PATH; alias app-0='ssh -q -p 2221 -i id_ed25519 -o UserKnownHostsFile=known_hosts root@127.0.0.1'; clear" Enter
Sleep 500ms
Show

Sleep 400ms
Type "conn3x apply -auto-approve -compact-warnings" Sleep 300ms Enter
Sleep 3500ms
Type "app-0 id deploy" Sleep 200ms Enter
Sleep 1500ms
Type "clear; conn3x plan" Sleep 300ms Enter
Sleep 3500ms
