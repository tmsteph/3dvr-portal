#!/usr/bin/env python3
"""Replace only the legacy Operator redirect, preserving every other Caddy route."""
from pathlib import Path
import sys

LEGACY = 'redir https://portal.3dvr.tech/operator{uri} 302'
DIRECT = '@operator_root path /\n  redir @operator_root /operator/ 302\n  reverse_proxy 127.0.0.1:4320'


def prepare(source):
    if LEGACY not in source:
        if DIRECT in source:
            return source
        raise ValueError('Expected Operator redirect is absent; inspect Caddy configuration before changing it.')
    if source.count(LEGACY) != 1:
        raise ValueError('Ambiguous Operator redirect; refusing to change multiple routes.')
    return source.replace(LEGACY, DIRECT)


if __name__ == '__main__':
    Path(sys.argv[2]).write_text(prepare(Path(sys.argv[1]).read_text()))
