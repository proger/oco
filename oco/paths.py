from dataclasses import dataclass
import os
from pathlib import Path
import re
from typing import Iterable

from .html import HTML, a, h2, p


def files(here: Path, maxdepth=1) -> Iterable[Path]:
    if maxdepth < 0:
        return

    try:
        items = sorted(here.iterdir())
    except PermissionError:
        return

    for path in items:
        try:
            if path.is_symlink():
                continue
            yield path
            if path.is_dir():
                yield from files(path, maxdepth=maxdepth-1)
        except OSError:
            continue


def parts(path: Path, root: Path) -> Iterable[Path]:
    yield root
    for part in path.parts:
        root = root / part
        yield root


@dataclass(frozen=True)
class Links:
    file_prefix: str = '/file'
    dir_prefix: str = '/index'
    media_prefix: str = '/wavesurfer'
    media_file = re.compile(r'\.(flac|mp3|wav|webm)$')

    def path(self, path: Path) -> HTML:
        return p(str(path.parent) + '/', self.part(path), tabindex=0)

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
