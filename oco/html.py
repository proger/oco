from collections.abc import Iterable
from pathlib import Path
from html import escape
from typing import Literal


Tag = Literal["a", "article", "audio", "div", "footer", "h2",
              "header", "input", "p", "script", "section", "span"]


def static(arg) -> Path:
    return Path(__file__).parent / 'static' / arg


class HTML(str):
    pass


def html(x) -> HTML:
    if isinstance(x, HTML):
        return x
    elif isinstance(x, str):
        return HTML(escape(x))
    elif isinstance(x, Iterable):
        return HTML("".join(map(html, x)))
    else:
        return HTML(escape(repr(x)))


def attr_pair(k, v):
    return f"{k}=\"{escape(str(v))}\"" if v is not None else f"{k}"


def attr_list(attrs):
    return " ".join(attr_pair(k, attrs[k]) for k in attrs)


def a(x, href=None, **attrs) -> HTML:
    href = escape(href or x)
    return HTML(f"""<a href="{href}" {attr_list(attrs)}>{html(x)}</a>""")


def div(*x, tag: Tag = "div", **attrs) -> HTML:
    return HTML(f"<{tag} {attr_list(attrs)}>" + html(x) + f"</{tag}>")


def audio(x, **attrs) -> HTML:
    return HTML(f"""
<audio id=audio controls preload="metadata" playsinline {attr_list(attrs)}>
    <source src="{x}">
</audio>
""")


def p(*x, **attrs) -> HTML:
    return div(*x, tag="p", **attrs)


def span(*x, **attrs) -> HTML:
    return div(*x, tag="span", **attrs)


def h2(*x, **attrs) -> HTML:
    return div(*x, tag="h2", **attrs)


def article(*x, **kwargs) -> HTML:
    return div(*x, tag="article", **kwargs)


def section(*x, **kwargs) -> HTML:
    return div(*x, tag="section", **kwargs)


def header(*x, **kwargs) -> HTML:
    return div(*x, tag="header", **kwargs)

def footer(*x, **kwargs) -> HTML:
    return div(*x, tag="footer", **kwargs)


def script_inline(script_filename: str) -> HTML:
    return div(HTML(static(script_filename).read_text()), tag="script")


def input(*, type="search", **kwargs) -> HTML:
    return div(tag="input", type=type, **kwargs)


def body(*x, title="oco", extrahead="") -> HTML:
    return HTML("""\
<!doctype html>
<html lang=uk>
<head>
<meta charset=utf-8>
<title>""" + html(title) + """</title>
<meta name="twitter:card" content="summary" />
<meta property="og:title" content="oco" />
<meta property="og:type" content="website" />
""" + html(extrahead) + """
<style>""" + static('style.css').read_text() + """</style>
</head>
<body>""" + html(x))
