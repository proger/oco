from datetime import datetime
from itertools import chain
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, FileResponse

from .html import p, a, body, script_inline, header, article, input, HTML

router = APIRouter()


def files():
    return sorted(chain(Path().glob('**/*.wav'),
                        Path().glob('**/*.flac'),
                        Path().glob('**/*.mp3')))


@router.post('/', response_class=HTMLResponse)
async def post(request: Request):
    form = await request.form()
    original_filename = form["file"].filename  # type: ignore
    filename = datetime.now().isoformat() + '+' + original_filename
    contents = await form["file"].read()  # type: ignore

    with open(Path.cwd() / filename, 'w+b') as f:
        f.write(contents)
        f.flush()
    return index()


@router.get('/', response_class=HTMLResponse)
def index():
    here = Path.cwd()
    results = [p(str(path.parent) + '/', a(path.name, f'/wavesurfer/{path}'), tabindex=0)
               for path in files()]
    return body(
        header(
            input(type="search", id="searchbox", placeholder="Search", autofocus=None, spellcheck="false"),
            script_inline('index.js'),
            p(f'{len(results)} results in {here}', id="counter"),
            HTML("""\
<form name="form" id="form" method="post" enctype="multipart/form-data">
<label class="file">
  <input type="file" name="file" id="file" aria-label="File browser">
  <span class="file-custom"></span>
</label>
<input type=submit value="Upload" />
</form>""")
        ),
        article(*results, id="results"),
        title=str(here)
    )


@router.get('/file/{path:path}')
def file(path: str):
    return FileResponse(Path(path))
