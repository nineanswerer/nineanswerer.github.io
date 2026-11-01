"""Build a local, content-specific LXGW WenKai subset.

Requires fonttools and brotli. The source font is not committed; see
public/fonts/OFL.txt for the upstream font license.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "font-source" / "package" / "LXGWWenKai-Regular.woff2"
TARGET = ROOT / "public" / "fonts" / "workshop-hand.woff2"
TEXT_SUFFIXES = {".astro", ".ts", ".css", ".md", ".mjs", ".json"}

text = "".join(
    path.read_text(encoding="utf-8")
    for path in (ROOT / "src").rglob("*")
    if path.is_file() and path.suffix in TEXT_SUFFIXES
)
text += "".join(chr(codepoint) for codepoint in range(32, 127))
text += "，。：；、？！“”‘’（）——……《》「」·→↗←↓↑✓×％"

font = TTFont(SOURCE)
options = subset.Options()
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
options.notdef_outline = True
options.recalc_bounds = True
options.layout_features = []
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
font.flavor = "woff2"
font.save(TARGET)
print(f"Subset font: {TARGET.stat().st_size:,} bytes, {len(text)} source characters")
