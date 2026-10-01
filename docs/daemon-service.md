# Running `slack daemon` as a Background Service

To have the `slack daemon` run automatically in the background on macOS, restart on failures, and launch on login, configure it as a macOS `launchd` LaunchAgent.

---

## 1. LaunchAgent Configuration

Create the plist at `~/Library/LaunchAgents/com.user.slack-router.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.slack-router</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USER/.local/bin/slack</string>
        <string>daemon</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USER/.config/slack-router/daemon.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USER/.config/slack-router/daemon.err</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Paseo.app/Contents/Resources/bin</string>
        <key>HOME</key>
        <string>/Users/YOUR_USER</string>
    </dict>
</dict>
</plist>
```

---

## 2. Managing the Service

```bash
# Load and start daemon
launchctl load ~/Library/LaunchAgents/com.user.slack-router.plist

# Check if running
launchctl list | grep slack-router

# View live daemon logs
tail -f ~/.config/slack-router/daemon.log

# Stop daemon
launchctl unload ~/Library/LaunchAgents/com.user.slack-router.plist
```
