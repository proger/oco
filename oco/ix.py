from __future__ import annotations

import contextlib
from functools import lru_cache
from pathlib import Path
import wave

from fastapi import APIRouter, Body, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from .html import HTML, body, div, footer, header
from .paths import Links, safe_relative_path

router = APIRouter()

BASE_DIR = Path('data')

TEXT_STRESS_PATH = BASE_DIR / 'text.stress'
ALIGNMENTS_PATH = BASE_DIR / 'alignments'
ALIGNMENT_HOP_SECONDS = 0.01
PITCH_PATH = BASE_DIR / 'pitch'
PITCH_PERIODICITY_PATH = BASE_DIR / 'pitch_periodicity.txt'
PITCH_HOP_SECONDS = 0.01  # default; refined per file if duration is available
_SUBSCRIPT_DIGITS = {ord(ch): None for ch in '₀₁₂₃₄₅₆₇₈₉'}


@lru_cache
def _text_stress_map():
    try:
        with TEXT_STRESS_PATH.open() as f:
            return dict(line.rstrip('\n').split('\t', 1) for line in f if '\t' in line)
    except FileNotFoundError:
        return {}


def _text_for(relpath: Path) -> str | None:
    text_map = _text_stress_map()
    rel = relpath.as_posix()
    if rel.startswith('data/'):
        rel = rel[len('data/'):]
    return text_map.get(rel)


@lru_cache
def _cached_wav_duration(path_str: str):
    try:
        with contextlib.closing(wave.open(path_str, 'rb')) as wf:
            frames = wf.getnframes()
            framerate = wf.getframerate()
            if framerate:
                return frames / float(framerate)
    except (wave.Error, FileNotFoundError):
        return None
    return None


def _wav_duration(relpath: Path):
    return _cached_wav_duration(relpath.as_posix())


def _speaker_from_path(relpath: Path) -> str:
    parts = relpath.parts
    if parts and parts[0] == 'data':
        return parts[1] if len(parts) > 1 else 'unknown'
    return parts[0] if parts else 'unknown'


def _word_intervals(text: str, duration: float | None):
    words = text.split()
    if not words:
        return []

    total_duration = duration if duration is not None else 0.25 * len(words)
    per_word = total_duration / len(words)

    intervals = []
    start = 0.0
    for word in words:
        end = start + per_word
        intervals.append({"interval": [start, end], "name": word})
        start = end
    return intervals


def _alignment_relpath(relpath: Path) -> str:
    rel = relpath.as_posix()
    if rel.startswith('data/'):
        rel = rel[len('data/'):]
    return rel


def _pitch_relpath(relpath: Path) -> str:
    rel = relpath.as_posix()
    if rel.startswith('data/'):
        rel = rel[len('data/'):]
    return rel


def _pitch_path_for(relpath: Path) -> Path:
    rel_pitch = relpath.parent / 'pitch.txt'
    if rel_pitch.exists():
        return rel_pitch
    return PITCH_PATH


def _pitch_periodicity_path_for(relpath: Path) -> Path:
    rel_pitch = relpath.parent / 'pitch_periodicity.txt'
    if rel_pitch.exists():
        return rel_pitch
    return PITCH_PERIODICITY_PATH


@lru_cache
def _alignment_index(alignments_path: Path) -> dict[str, int]:
    index: dict[str, int] = {}
    if not alignments_path.exists():
        return index

    with alignments_path.open('rb') as f:
        offset = 0
        for raw_line in f:
            try:
                line = raw_line.decode('utf-8').rstrip('\n')
            except UnicodeDecodeError:
                offset += len(raw_line)
                continue

            if not line:
                offset += len(raw_line)
                continue

            path, *_ = line.split(maxsplit=1)
            index[path] = offset
            offset += len(raw_line)

    return index


@lru_cache
def _pitch_index(pitch_path: Path) -> dict[str, int]:
    index: dict[str, int] = {}
    if not pitch_path.exists():
        return index

    try:
        with pitch_path.open('rb') as f:
            offset = 0
            for raw_line in f:
                try:
                    line = raw_line.decode('utf-8').rstrip('\n')
                except UnicodeDecodeError:
                    offset += len(raw_line)
                    continue

                if not line:
                    offset += len(raw_line)
                    continue

                path, *_ = line.split(maxsplit=1)
                index[path] = offset
                offset += len(raw_line)
    except FileNotFoundError:
        return {}

    return index


def _pitch_offset(relpath: Path, pitch_path: Path | None = None):
    pitch_path = pitch_path or _pitch_path_for(relpath)
    rel = _pitch_relpath(relpath)
    index = _pitch_index(pitch_path)
    if not index:
        return None

    for key in (relpath.name, relpath.as_posix(), rel):
        offset = index.get(key)
        if offset is not None:
            return offset
    return None


@lru_cache(maxsize=1024)
def _alignment_tokens(relpath: Path):
    rel_alignments = relpath.parent / 'alignments.txt'
    alignments_path = rel_alignments if rel_alignments.exists() else ALIGNMENTS_PATH
    index = _alignment_index(alignments_path)
    if not index:
        return None

    key = _alignment_relpath(relpath)
    offset = index.get(relpath.name)
    if offset is None:
        offset = index.get(key)
    if offset is None:
        return None

    try:
        with alignments_path.open('rb') as f:
            f.seek(offset)
            raw_line = f.readline()
    except FileNotFoundError:
        return None

    try:
        line = raw_line.decode('utf-8').rstrip('\n')
    except UnicodeDecodeError:
        return None

    parts = line.split()
    if len(parts) <= 1:
        return []

    return parts[1:]


@lru_cache(maxsize=1024)
def _pitch_values(relpath: Path):
    pitch_path = _pitch_path_for(relpath)
    offset = _pitch_offset(relpath, pitch_path)
    if offset is None:
        return None

    try:
        with pitch_path.open('rb') as f:
            f.seek(offset)
            raw_line = f.readline()
    except FileNotFoundError:
        return None

    try:
        line = raw_line.decode('utf-8').rstrip('\n')
    except UnicodeDecodeError:
        return None

    parts = line.split()
    if len(parts) <= 1:
        return []

    values: list[float] = []
    for token in parts[1:]:
        try:
            values.append(float(token))
        except ValueError:
            values.append(0.0)
    return values


@lru_cache(maxsize=1024)
def _pitch_periodicity_values(relpath: Path):
    periodicity_path = _pitch_periodicity_path_for(relpath)
    rel = _pitch_relpath(relpath)

    periodicity_index = _pitch_index(periodicity_path)
    if rel not in periodicity_index:
        return None

    try:
        with periodicity_path.open('rb') as f:
            f.seek(periodicity_index[rel])
            raw_line = f.readline()
    except FileNotFoundError:
        return None

    try:
        line = raw_line.decode('utf-8').rstrip('\n')
    except UnicodeDecodeError:
        return None

    parts = line.split()
    if len(parts) <= 1:
        return []

    values: list[float] = []
    for token in parts[1:]:
        try:
            values.append(float(token))
        except ValueError:
            values.append(0.0)
    return values


def _pitch_payload(relpath: Path):
    values = _pitch_values(relpath)
    if values is None:
        return None

    periodicity = _pitch_periodicity_values(relpath)

    hop = PITCH_HOP_SECONDS
    duration = _wav_duration(relpath)
    if duration and values:
        hop = round(duration / len(values), 3)

    payload = {"hop": hop, "values": values}
    if periodicity is not None:
        payload["periodicity"] = periodicity

    return payload



def _alignment_intervals(tokens: list[str]):
    if not tokens:
        return []

    intervals = []
    current = tokens[0]
    start_idx = 0

    for idx, token in enumerate(tokens[1:], start=1):
        intervals.append({"interval": [round(start_idx * ALIGNMENT_HOP_SECONDS, 2), round(idx * ALIGNMENT_HOP_SECONDS, 2)], "name": token})
        start_idx = idx

    intervals.append({"interval": [round(start_idx * ALIGNMENT_HOP_SECONDS, 2), round(len(tokens) * ALIGNMENT_HOP_SECONDS, 2)], "name": token})
    return intervals


@router.post('/wav/{path:path}')
def spans_post(path: str, body: bytes = Body(b'')):
    spans = safe_relative_path(path).with_suffix('.spans')
    spans.write_bytes(body)
    return Response()


@router.get('/spans/{path:path}', response_class=Response)
def spans_get(path: str):
    spans = safe_relative_path(path).with_suffix('.spans')
    try:
        return spans.read_bytes()
    except FileNotFoundError:
        return b'[]'


@router.get('/wav/{path:path}/params.json')
def params(path: str):
    relpath = safe_relative_path(path)
    if not relpath.exists() or not relpath.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    tracks_and_words = []
    alignment_tokens = _alignment_tokens(relpath)
    if alignment_tokens is not None:
        tracks_and_words.append({
            "speaker": _speaker_from_path(relpath),
            "words": f"/wav/{relpath}/alignment.seg.json",
        })

    pitch_info = None
    if _pitch_offset(relpath) is not None:
        pitch_info = {"url": f"/wav/{relpath}/pitch.json"}

    return {
        "filelist": [f"/file/{relpath}"],
        "tracksAndWords": tracks_and_words,
        "pitch": pitch_info,
    }

@router.get('/wav/{path:path}/alignment.seg.json')
def alignment_segments(path: str):
    relpath = safe_relative_path(path)
    tokens = _alignment_tokens(relpath)
    if tokens is None:
        raise HTTPException(status_code=404, detail="Alignment not found")

    return _alignment_intervals(tokens)


@router.get('/wav/{path:path}/pitch.json')
def pitch(path: str):
    relpath = safe_relative_path(path)
    payload = _pitch_payload(relpath)
    if payload is None:
        raise HTTPException(status_code=404, detail="Pitch not found")

    return payload


@router.get('/wav/{path:path}', response_class=HTMLResponse)
def wav(path: str, request: Request):
    relpath = safe_relative_path(path)
    if not relpath.exists() or not relpath.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    links = Links(media_prefix='/file')
    text_label = _text_for(relpath) or ""
    return body(
        header(
            links.breadcrumbs(relpath),
            div(text_label, **{"class": "text-label"}) if text_label else HTML(""),
        ),
        div(id='viewer'),
        footer(
            div(id='log', **{'class': 'log'}),
        ),
        HTML('<script src="/static/ixlib.js"></script>'),
        HTML('<script src="/static/ix.js"></script>'),
        title=str(relpath),
        extrahead=HTML("""\
<meta name="viewport" content="width=device-width, user-scalable=no">
<link rel="stylesheet" type="text/css" href="/static/ix.css">
"""))
