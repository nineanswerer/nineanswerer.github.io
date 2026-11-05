from pathlib import Path
import shutil

root = Path(__file__).resolve().parent / "cleanup-merge-fixture"
if root.exists():
    shutil.rmtree(root)
for name in ("Packages/app.bin", "Backups/app-copy.bin", "Archive/app-old.bin"):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"C" * (2 * 1024 * 1024))
print(root)
