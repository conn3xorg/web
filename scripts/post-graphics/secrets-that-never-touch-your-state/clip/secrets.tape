Output secrets.mp4

Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 16
Set Width 1280
Set Height 720
Set Padding 28
Set Framerate 30
Set TypingSpeed 35ms
Set WindowBar Colorful
Set Margin 24
Set MarginFill "#0a1220"
Set BorderRadius 10
Set Theme { "name": "Conn3x", "black": "#0f1a2b", "red": "#ff8a7a", "green": "#7fd3a7", "yellow": "#ffb86b", "blue": "#8fb3ff", "magenta": "#d6a5ff", "cyan": "#7fd8e6", "white": "#dbe4ef", "brightBlack": "#5d6f88", "brightRed": "#ff9a8c", "brightGreen": "#9be3bf", "brightYellow": "#ffc98a", "brightBlue": "#a9c4ff", "brightMagenta": "#e2bdff", "brightCyan": "#9fe5ef", "brightWhite": "#f3f6fa", "background": "#0f1a2b", "foreground": "#dbe4ef", "selection": "#2a3b55", "cursor": "#ff7a2e" }

Hide
Type "export PS1='$ ' PATH=/opt/homebrew/bin:$PATH CONN3X_HMAC_KEY=$(openssl rand -hex 32); alias box='ssh -q -p 2222 -i ../try-it-locally/id_ed25519 -o UserKnownHostsFile=../try-it-locally/known_hosts root@127.0.0.1'; clear" Enter
Sleep 500ms
Show

Sleep 400ms
Type "export TF_VAR_db_password='correct-horse-battery-staple'" Sleep 300ms Enter
Sleep 600ms
Type "conn3x apply -auto-approve -concise | grep 'Apply complete'" Sleep 300ms Enter
Sleep 9s
Type "box cat /root/db-password; echo" Sleep 300ms Enter
Sleep 2s
Type "grep -c correct-horse terraform.tfstate" Sleep 300ms Enter
Sleep 1500ms
Type "grep -o 'hmac-sha256:[0-9a-f:]\{24\}' terraform.tfstate" Sleep 300ms Enter
Sleep 2500ms
Type "box 'echo changed > /root/db-password'" Sleep 300ms Enter
Sleep 2s
Type "conn3x plan -concise -no-color | grep -E 'content_hmac|Plan:' | sed -E 's/([0-9a-f]{12})[0-9a-f]{20,}/\1.../g'" Sleep 300ms Enter
Sleep 9s
