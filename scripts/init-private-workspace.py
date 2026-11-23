#!/usr/bin/env python3
"""Initialize a private POSIX workspace: python3 scripts/init-private-workspace.py ~/Life"""

import argparse
import os
from pathlib import Path
import stat
from contextlib import contextmanager


@contextmanager
def private_directory(parent_fd, name):
    try:
        os.mkdir(name, mode=0o700, dir_fd=parent_fd)
    except FileExistsError:
        pass
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise ValueError(f"{name} must be owned by you and private to your account")
        yield fd
    finally:
        os.close(fd)


def initialize(path):
    parent = path.parent.resolve(strict=True)
    if path.name in {"", ".", ".."}:
        raise ValueError("choose a named workspace directory")
    target = parent / path.name
    checkout = Path(__file__).resolve().parent.parent
    if target == checkout or checkout in target.parents or target in checkout.parents:
        raise ValueError("choose a workspace separate from the Portal checkout")
    if any((folder / ".git").exists() for folder in (target, *target.parents)):
        raise ValueError("choose a workspace outside a Git checkout")
    parent_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        with private_directory(parent_fd, path.name) as root:
            for name in ("Personal", "Family", "3DVR", "Archive"):
                with private_directory(root, name) as folder:
                    if name == "3DVR":
                        with private_directory(folder, "Clients"):
                            pass
    finally:
        os.close(parent_fd)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="workspace path beneath an existing directory")
    args = parser.parse_args()
    try:
        print(initialize(args.directory.expanduser()))
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
