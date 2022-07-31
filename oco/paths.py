from dataclasses import dataclass
from pathlib import Path
import re
from typing import Iterable

from .html import HTML, a, h2, p


def files(here: Path, pattern=re.compile(r'')) -> Iterable[Path]:
    for path in sorted(here.iterdir()):
        path_repr = str(path) + '/' if path.is_dir() else str(path)
        if pattern.search(path_repr):
            yield path
        if path.is_dir():
            yield from files(path, pattern=pattern)


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
    media_file = re.compile(r'\.(flac|mp3|wav)$')

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


def relative_path(path: str) -> Path:
    return Path(path).resolve().relative_to(Path().resolve())
