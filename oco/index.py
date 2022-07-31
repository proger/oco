from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, FileResponse

from .html import p, body, script_inline, header, article, input, HTML
from .paths import files, breadcrumbs, relative_path, path_link

router = APIRouter()


@router.post('/', response_class=HTMLResponse)
@router.post('/index/{here:path}', response_class=HTMLResponse)
async def post(request: Request, here: str = '.'):
    form = await request.form()
    original_filename = form["file"].filename  # type: ignore
    filename = datetime.now().isoformat() + '+' + original_filename
    contents = await form["file"].read()  # type: ignore

    with open(relative_path(here) / filename, 'w+b') as f:
        f.write(contents)
        f.flush()
    return index(here=here)


@router.get('/', response_class=HTMLResponse)
@router.get('/index/{here:path}', response_class=HTMLResponse)
def index(here: str = '.'):
    root = relative_path(here)
    results = [path_link(path) for path in files(root)]
    return body(
        header(
            breadcrumbs(root) if root.name else HTML(""),
            input(type="search", id="searchbox", placeholder="Search", autofocus=None, spellcheck="false"),
            script_inline('index.js'),
            p(f'{len(results)} results', id="counter"),
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
        title=here
    )


@router.get('/file/{path:path}')
def file(path: str):
    return FileResponse(Path(path))
