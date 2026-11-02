from pathlib import Path
import shutil

root = Path(__file__).resolve().parent / "cleanup-ui-fixture"
if root.exists():
    shutil.rmtree(root)

files = {
    "Videos/large-render.mov": (5, b"A"),
    "Downloads/setup.exe": (3, b"B"),
    "Packages/app.bin": (2, b"C"),
    "Backups/app-copy.bin": (2, b"C"),
    "Archive/app-old.bin": (2, b"C"),
    "cache/today.tmp": (1, b"D"),
    "node_modules/package/index.js": (1, b"E"),
}
for name, (mib, token) in files.items():
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(token * (mib * 1024 * 1024))
logs = root / "logs/latest.log"
logs.parent.mkdir(parents=True, exist_ok=True)
logs.write_text("StorageScope cleanup UI fixture\n", encoding="utf-8")
print(root)
