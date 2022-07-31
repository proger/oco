from pathlib import Path
import re
from typing import Iterable

from .html import HTML, a, h2, p


def files(here: Path, pattern=re.compile(r'(\.(flac|mp3|wav)|/)$')) -> Iterable[Path]:
    for path in here.iterdir():
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


def path_link(path: Path, file_prefix='/wavesurfer') -> HTML:
    return p(str(path.parent) + '/', part_link(path, file_prefix=file_prefix), tabindex=0)


def part_link(path: Path, file_prefix='/wavesurfer'):
    if path.is_dir():
        name = (path.name or str(path)) + '/'
        return a(name, f'/index/{path}')
    else:
        return a(path.name, f'{file_prefix}/{path}')


def breadcrumbs(here: Path, file_prefix='/file') -> HTML:
    return h2(*[part_link(path, file_prefix=file_prefix) for path in parts(here, Path('.'))])


def relative_path(path: str) -> Path:
    return Path(path).resolve().relative_to(Path().resolve())
