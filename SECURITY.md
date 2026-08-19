# Security Policy

## Supported Versions

InfoBento is pre-1.0 and under active development. Only the latest released
version receives security fixes.

## Reporting a Vulnerability

Please report security issues **privately** rather than opening a public issue:

- Use GitHub's [private vulnerability reporting](https://github.com/jasoneplumb/infobento.com/security/advisories/new), or
- email **jasoneplumb@gmail.com**.

Please include steps to reproduce and the affected version or commit. We aim to
acknowledge reports within a few days and will coordinate a fix and disclosure
timeline with you.

## Known limitations

These are already known — please don't spend effort reporting them, but do read
them before building on this code.

### Bench firmware does not verify TLS certificates

The Arduino sketches under `firmware/` call `client.setInsecure()` on every
HTTPS request, so no certificate validation occurs. The device id doubles as a
bearer secret and travels in the URL path, so an active network attacker can
capture it and impersonate the device. The sketches are bench tools intended for
networks you control; they are not hardened for deployment. Tracked in
[#145](https://github.com/jasoneplumb/infobento.com/issues/145).

### The device id is a bearer secret

`GET /api/device/<device-id>/frames` and the other firmware-facing routes
authenticate on the device id alone — a long opaque UUID treated like an API
key, with no additional header. Anyone who learns a device id can read that
device's rendered frames. Device ids must therefore never appear in screenshots,
logs, published assets, or documentation. Pair codes are the value intended to
be printed and shared; they are single-use for claiming and are not accepted by
the frame endpoints.
