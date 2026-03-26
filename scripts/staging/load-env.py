#!/usr/bin/env python3

from __future__ import annotations

import shlex
import sys
from pathlib import Path


def parse_env(path: Path) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []

    for line_number, raw_line in enumerate(path.read_text().splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit(f"Invalid env line {line_number}: {raw_line}")

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            raise SystemExit(f"Invalid env key on line {line_number}")

        if value[:1] == value[-1:] and value[:1] in {'"', "'"}:
            value = value[1:-1]

        entries.append((key, value))

    return entries


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: load-env.py <env-file>")

    env_file = Path(sys.argv[1])
    if not env_file.is_file():
        raise SystemExit(f"Missing env file: {env_file}")

    for key, value in parse_env(env_file):
        print(f"export {key}={shlex.quote(value)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
