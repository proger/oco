from dataclasses import dataclass
import os
from pathlib import Path
import re
from typing import Iterable
from urllib.parse import quote

from .html import HTML, a, h2, p


def files(here: Path, maxdepth=0, root=True) -> Iterable[Path]:
    if maxdepth < 0:
        return

    try:
        items = sorted(
            here.iterdir(),
            key=lambda path: _mtime(path),
            reverse=True,
        )
    except PermissionError:
        return

    for path in items:
        try:
            if path.is_symlink():
                continue
            if path.suffix in ['.wav', '.png'] and root:
                yield path
            if path.is_dir() and (path.name not in ['.git']):
                yield path
                yield from files(path, maxdepth=maxdepth-1, root=False)
        except OSError:
            continue


def _mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def parts(path: Path, root: Path) -> Iterable[Path]:
    yield root
    for part in path.parts:
        root = root / part
        yield root


@dataclass(frozen=True)
class Links:
    file_prefix: str = '/file'
    dir_prefix: str = '/index'
    media_prefix: str = '/wav'
    media_file = re.compile(r'\.(flac|mp3|wav|webm)$')

    def part(self, path: Path) -> HTML:
        if path.is_dir():
            name = (path.name or str(path)) + '/'
            return a(name, f'{self.dir_prefix}/{path}')
        elif self.media_file.search(path.name):
            return a(path.name, f'{self.media_prefix}/{path}')
        else:
            return a(path.name, f'{self.file_prefix}/{path}')

    def breadcrumbs(self, here: Path) -> HTML:
        return h2(*[self.part(path) for path in parts(here, Path('.'))])


def safe_relative_path(path: str) -> Path:
    return Path(path).resolve().relative_to(Path().resolve())
