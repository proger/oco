from datetime import datetime

from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, FileResponse

from .html import p, body, script_inline, header, article, input, HTML
from .paths import files, safe_relative_path, Links

router = APIRouter()


@router.post('/', response_class=HTMLResponse)
@router.post('/index/{here:path}', response_class=HTMLResponse)
async def post(request: Request, here: str = '.'):
    form = await request.form()
    original_filename = form["file"].filename  # type: ignore
    filename = datetime.now().isoformat() + '+' + original_filename
    contents = await form["file"].read()  # type: ignore

    with open(safe_relative_path(safe_relative_path(here) / filename), 'w+b') as f:
        f.write(contents)
        f.flush()
    return index_view(path=here)


def upload_form() -> HTML:
    return HTML("""\
<form name="form" id="form" method="post" enctype="multipart/form-data">
<label class="file">
  <input type="file" name="file" id="file" aria-label="File browser">
  <span class="file-custom"></span>
</label>
<input type=submit value="Upload" />
</form>""")


def index_page(relpath, results, links: Links) -> HTML:
    return body(
        header(
            links.breadcrumbs(relpath) if relpath.name else HTML(""),
            input(type="search", id="searchbox", placeholder="Search", autofocus=None, spellcheck="false"),
            script_inline('index.js'),
            p(f'{len(results)} results', id="counter"),
            upload_form(),
        ),
        article(*results, id="results"),
        title=str(relpath)
    )


@router.get('/', response_class=HTMLResponse)
@router.get('/index/{path:path}', response_class=HTMLResponse)
def index_view(path: str = '.', maxdepth: int = 1):
    relpath = safe_relative_path(path)
    links = Links()
    results = [links.path(path) for path in files(relpath, maxdepth=maxdepth)]
    return index_page(relpath, results, links)


@router.get('/file/{path:path}')
def file(path: str):
    relpath = safe_relative_path(path)
    links = Links()
    if relpath.is_dir():
        results = [links.path(sub) for sub in files(relpath, maxdepth=0)]
        return HTMLResponse(index_page(relpath, results, links))
    elif relpath.exists():
        return FileResponse(relpath)
    else:
        return Response('File not found', status_code=404)
