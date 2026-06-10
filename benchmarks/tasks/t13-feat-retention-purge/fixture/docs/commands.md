# ticketdesk commands

Run any command as `node src/cli.js <command> [options]`.

| Command | Description |
|---|---|
| list-tickets | Print every ticket as `<id>  <customerId>  <status>  <updatedAt>` |
| list-customers | Print every customer as `<id>  <name>  <email>` |
| list-comments | Print every comment as `<id>  <ticketId>  <author>` |
| add-comment | Add a comment: `add-comment <ticketId> <author> <body>` |
| archive-tickets | Move closed tickets older than the archive window (and their comments) to `data/archive/`: `archive-tickets [--apply]` |
| help | Print all available commands |
