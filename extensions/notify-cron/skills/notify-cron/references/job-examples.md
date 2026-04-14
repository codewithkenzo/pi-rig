# notify-cron job examples

## 15-minute topic digest

```json
{
  "id": "plan-heartbeat",
  "title": "Plan heartbeat",
  "every_minutes": 15,
  "destination": "telegram:-1003768782074:9",
  "message": "🧭 latest plan heartbeat",
  "enabled": true
}
```

## hourly discord summary

```json
{
  "id": "hourly-summary",
  "title": "Hourly summary",
  "every_minutes": 60,
  "destination": "discord:123456789012345678",
  "message": "hourly status digest",
  "enabled": true
}
```
