---
name: model-fallback-monitor
description: "Monitor model fallback attempts and send Telegram notifications"
metadata:
  {
    "openclaw":
      {
        "emoji": "🔄",
        "events": ["model:fallback"],
        "requires":
          {
            "config":
              [
                "channels.telegram.modelFallbackMonitorEnabled",
                "agents.defaults.telegramMonitorChat",
              ],
          },
      },
  }
---

# Model Fallback Monitor

Listens for model fallback events and sends notifications to a configured Telegram chat when models switch or fail.

## Configuration

Add to your `~/.openclaw/config.json`:

```json
{
  "channels": {
    "telegram": {
      "modelFallbackMonitorEnabled": true
    }
  },
  "agents": {
    "defaults": {
      "telegramMonitorChat": "123456789"
    }
  },
  "hooks": {
    "internal": {
      "entries": {
        "model-fallback-monitor": {
          "enabled": true
        }
      }
    }
  }
}
```

The monitor is disabled by default. Set `channels.telegram.modelFallbackMonitorEnabled` to `true` to enable it.
The `telegramMonitorChat` should be the chat ID of your Telegram bot's monitoring channel or private chat.

## Events

- **`model:fallback`** - Triggered whenever a model candidate is attempted during fallback, with decision type, error details, and attempt tracking
