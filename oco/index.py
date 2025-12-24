from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, FileResponse

from .html import p, body, script_inline, header, article, input, HTML
from .paths import files, safe_relative_path, Links

router = APIRouter()


def index_page(relpath, maxdepth: int = 2) -> HTML:
    links = Links()
    rows = [
        p(str(path.parent) + '/', links.part(path), tabindex=0)
        for path in files(relpath, maxdepth=maxdepth)
    ]
    return body(
        header(
            links.breadcrumbs(relpath) if relpath.name else HTML(""),
            input(type="search", id="searchbox", placeholder="Search", autofocus=None, spellcheck="false"),
            script_inline('index.js'),
            p(f'{len(rows)} results', id="counter"),
        ),
        article(*rows, id="results"),
        title=str(relpath)
    )


@router.get('/', response_class=HTMLResponse)
@router.get('/index/{path:path}', response_class=HTMLResponse)
def index_view(path: str = '.', maxdepth: int = 2):
    relpath = safe_relative_path(path)
    return index_page(relpath)

@router.get('/robots.txt')
def robots_txt():
    return Response("User-agent: *\nDisallow: /", media_type="text/plain")


@router.get('/file/{path:path}')
def file(path: str):
    relpath = safe_relative_path(path)
    if relpath.is_dir():
        return HTMLResponse(index_page(relpath))
    elif relpath.exists():
        return FileResponse(relpath)
    else:
        return Response('File not found', status_code=404)
