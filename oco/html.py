from pathlib import Path
from html import escape

def static() -> Path:
    return Path(__file__).parent / 'static'

def _make_attr(k):
    return k # TODO

def _render_attr(k, v):
    return f"{_make_attr(k)}=\"{escape(str(v))}\"" if v is not None else f"{_make_attr(k)}"

def _render_attrs(attrs):
    return " ".join(_render_attr(k, attrs[k]) for k in attrs)

def div(*x, tag="div", **attrs):
    return f"<{tag} {_render_attrs(attrs)}>" + "\n".join(x) + f"</{tag}>"

def audio(x, **attrs):
    return f"""
<audio id=audio controls preload="metadata" playsinline width="100%" {_render_attrs(attrs)}>
    <source src="{x}">
</audio>
"""

def p(*x, **attrs):
    return div(*map(str, x), tag="p", **attrs)

def span(*x, **attrs):
    return div(*map(str, x), tag="span", **attrs)

def h2(*x, **attrs):
    return div(*map(str, x), tag="h2", **attrs)

def a(x, href=None, **attrs):
    href = escape(href or x)
    return f"""<a href="{href}" {_render_attrs(attrs)}>{x}</a>"""

def article(*x, **kwargs):
    return div(*x, tag="article", **kwargs)

def section(*x, **kwargs):
    return div(*x, tag="section", **kwargs)

def header(*x, **kwargs):
    return div(*x, tag="header", **kwargs)

def script_inline(script_filename: str):
    return div((static() / script_filename).read_text(), tag="script")

def script(x):
    return div(x, tag="script")

def input(*, type="search", **kwargs):
    return div(tag="input", type=type, **kwargs)

def body(*x, title="oco", extrahead=""):
    return """
<!doctype html>
<html lang=uk>
<head>
<meta charset=utf-8>
<title>""" + escape(str(title)) + """</title>
<meta name="twitter:card" content="summary" />
<meta property="og:title" content="oco" />
<meta property="og:type" content="website" />
""" + extrahead + """
<style>""" + (static() / 'style.css').read_text() + """</style>
</head>
<body>""" + "\n".join(x)
