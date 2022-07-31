from pathlib import Path

from fastapi import APIRouter, Body, Response
from fastapi.responses import HTMLResponse

from .html import HTML, div, span, body, script_inline, audio, header
from .paths import Links

router = APIRouter()


@router.post('/wavesurfer/{path:path}')
def spans_post(path: str, body: bytes = Body(b'')):
    spans = Path(path).with_suffix('.spans')
    spans.write_bytes(body)
    return Response()


@router.get('/spans/{path:path}', response_class=Response)
def spans_get(path: str):
    spans = Path(path).with_suffix('.spans')
    try:
        return spans.read_bytes()
    except FileNotFoundError:
        return b'[]'


@router.get('/wavesurfer/{path:path}', response_class=HTMLResponse)
def wavesurfer(path: str):
    path1 = Path(path)

    return body(
        header(
            Links(media_prefix='/file').breadcrumbs(path1),
            span(' ', id='subtitle', **{'class': 'hidden'}),
            audio(f"/file/{path}", **{'class': 'hidden'})
        ),
        HTML("""
<form role="form" name="edit" class="edit-region" style="opacity: 0;">
    <label for="note">Name</label>
    <input id="note" class="form-control" name="note" />
    <label for="start">Start</label>
    <input class="form-control" id="start" name="start" />
    <label for="end">End</label>
    <input class="form-control" id="end" name="end" />
    <button type="submit" class="btn btn-success btn-block">Save</button>
    <button type="button" class="btn btn-danger btn-block" data-action="delete-region">Delete</button>
</form>"""),
        div(id='wave-timeline'),
        div(id='waveform'),
        div(id='wave-spectrogram'),
        HTML("""
<div class="row">
    <div class="col-sm-10">
        <p>
            Drag to annotate. <br />
            Click on a region to enter an annotation.<br />
            Shift-click plays a region in a loop.
        </p>
    </div>

    <div class="col-sm-2">
        <button class="btn btn-primary btn-block" data-action="play">
            <span id="play">
                Play
            </span>

            <span id="pause" style="display: none">
                Pause
            </span>
        </button>
    </div>
</div>
        """),
        script_inline('annotation.js'),
        extrahead=HTML("""\
<script src="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/6.2.0/wavesurfer.min.js" integrity="sha512-YW1rLJ+bRJi6nmxz2o41EtNaxud/NTCh588hhF4E84hP3UW9nMgx8bDWZQAbvbe1vd+AU8SZw6xDPP/kgziNmA==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/6.2.0/wavesurfer-html-init.min.js" integrity="sha512-N66a4vosKtLGRxvjTRU/vrHxu99SV8TFfV3mJjHk7PQgQX8G7bDG7F8lsW+oKbT7SVoVrY+rUynwcDq95g7/4g==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/6.2.0/plugin/wavesurfer.minimap.min.js" integrity="sha512-psYUTQSxIFZsqXgyE+HTCoYA8ZyPyF5XjNlUBAZ8MOg7q43F5taQUdnMJaKZX6n3PETd1rMn+79nLlTweS77Xg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/6.2.0/plugin/wavesurfer.regions.min.js" integrity="sha512-g/kqhP92PgKH0RTwfIzW6RxqIP0cYE0AY3PGAE25geGmyULRDaivyPccgUa7fQfsKHwRRV9+ayMSnYXz19ezlw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/6.2.0/plugin/wavesurfer.spectrogram.min.js" integrity="sha512-3LBHQ5FEE8+C7TOZ1XiR6MduEb74lg0Y5BgE12ekYIR5ymINQrVHtQvL5MAdUzuZNfis475ZrkfvzGuQf0IZEw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/6.2.0/plugin/wavesurfer.timeline.min.js" integrity="sha512-WEgzy+HqxVJYBBlWbgJPJADJFdV8itVFdvLDCznr0VfnPDGNVWfklW5RpgMDOJvvksKG3fd4g8lA4h+YWFVP8w==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
"""))
