# Greybeard for Hermes installed

Enable it if you did not install with `--enable`:

```bash
hermes plugins enable greybeard
```

Restart Hermes or the gateway after enabling.

In shared gateways, restrict `/greybeard` to trusted users with Hermes slash-command access controls; runtime mode is process-local.

Commands:

- `/greybeard [lite|full|ultra|off]`
- `/greybeard-review [target]`
- `/greybeard-audit [target]`
- `/greybeard-debt`
- `/greybeard-gain`
- `/greybeard-help`

Bundled skills are available as `greybeard:greybeard`, `greybeard:greybeard-review`, `greybeard:greybeard-audit`, `greybeard:greybeard-debt`, `greybeard:greybeard-gain`, and `greybeard:greybeard-help`.
