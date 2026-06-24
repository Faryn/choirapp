import os
import shutil
import zipfile

OUT_BASE = "/home/paul/.openclaw/workspace/choir-app/data/repertoire"
OUT_ROOT = os.path.join(OUT_BASE, "01_Aktuelles_Repertoire")
ZIP_PATHS = [
    "/home/paul/01_Aktuelles_Repertoire-20260328T202625Z-1-001.zip",
    "/home/paul/01_Aktuelles_Repertoire-20260328T202625Z-1-002.zip",
]

shutil.rmtree(OUT_ROOT, ignore_errors=True)
os.makedirs(OUT_ROOT, exist_ok=True)

for zpath in ZIP_PATHS:
    with zipfile.ZipFile(zpath) as zf:
        for info in zf.infolist():
            name = info.filename
            if not name or name.endswith('/'):
                continue
            target = os.path.join(OUT_BASE, name)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(info) as src, open(target, 'wb') as dst:
                shutil.copyfileobj(src, dst)

print('merged zip contents into', OUT_BASE)
