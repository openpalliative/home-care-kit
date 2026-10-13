import json
import sys
from pathlib import Path

import yaml
from markupsafe import escape

ROOT = Path(__file__).resolve().parent.parent


def public(root: Path) -> bool:
    gates = root / "content" / "gates.yaml"
    data = yaml.safe_load(gates.read_text(encoding="utf-8")) if gates.is_file() else {}
    return (data or {}).get("indications_public") in (True, "true")


def leaks(root: Path) -> list[str]:
    page = root / "_site" / "conclusion" / "index.html"
    view = root / "_site" / "data" / "v1" / "norm-view.json"
    if not page.is_file() or not view.is_file():
        return ["нет _site/conclusion/index.html или _site/data/v1/norm-view.json, сначала соберите сайт"]
    html = page.read_text(encoding="utf-8")
    out = []
    if 'class="hc-ind"' in html or 'class="hc-inds"' in html:
        out.append("на странице есть список показаний (hc-ind)")
    items = json.loads(view.read_text(encoding="utf-8"))["items"]
    for it in items:
        text = it.get("text_verbatim") or ""
        if it.get("kind") == "indication" and len(text) >= 40 and str(escape(text[:60])) in html:
            out.append(f"дословный текст показания {it['id']}")
    return out


def main() -> int:
    if public(ROOT):
        print("Показания открыты в content/gates.yaml, проверка не нужна")
        return 0
    found = leaks(ROOT)
    for f in found:
        print(f"conclusion/: {f}")
    if found:
        print("Показания закрыты (indications_public: false), а попали в сборку. Соберите с OP_TARGET=pages")
        return 1
    print("conclusion/: показаний в сборке нет, как и должно быть на Pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
