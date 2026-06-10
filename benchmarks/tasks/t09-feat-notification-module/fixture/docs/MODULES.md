# Modules

## alerts

Purpose: Raise and track operational alerts with severity levels.
Config: alerts.maxHistory (number, default 100) — maximum number of alerts kept in history.
Events: ALERT_RAISED — emitted when an alert is raised; payload: { level, message }.

## metrics

Purpose: Record and retrieve named numeric metrics.
Config: metrics.retentionDays (number, default 30) — how many days metrics are retained.
Events: METRIC_RECORDED — emitted when a metric is recorded; payload: { name, value }.

## users

Purpose: Manage user accounts in the ops console.
Config: users.maxUsers (number, default 500) — maximum number of users allowed.
Events: USER_ADDED — emitted when a user is added; payload: { username }.
