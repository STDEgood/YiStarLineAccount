"""把 d8 生成的 classes.dex 写入 APK（不改动已有资源）。"""
import sys
import zipfile

apk_path, dex_path = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk_path, "a", zipfile.ZIP_DEFLATED) as apk:
    apk.write(dex_path, "classes.dex")
print("added classes.dex ->", apk_path)
