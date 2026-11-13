# Android 端

YiStarLine Account Unified App 的 Android 版本：界面与桌面版共用同一套 HTML/CSS/JS，
后端由 `android-api.js` 在 WebView 内以纯 JavaScript 实现，数据保存在应用私有存储，**完全离线**。

## 结构

```
android/
├─ build-apk.cmd                    离线构建脚本（javac → d8 → aapt2 → zipalign → apksigner）
├─ app/src/main/
│  ├─ AndroidManifest.xml           包名 com.yistarline.yaua，minSdk 23 / target 36
│  ├─ java/com/yistarline/yaua/
│  │  └─ MainActivity.java          WebView 外壳、资源拦截、系统栏安全区、备份导入导出
│  ├─ assets/www/                   界面（构建时从 web/ 复制，index.html 为 Android 专用）
│  │  └─ android-api.js             本地后端：账户、会话、授权、票据、审计
│  └─ res/
│     ├─ mipmap-anydpi-v26/         自适应图标（蓝底 + 白色 YAUA）
│     ├─ mipmap-nodpi/              传统图标（Android 5–7）
│     ├─ drawable/                  图标前景层
│     └─ values/colors.xml          图标背景色
├─ tools/
│  ├─ add_dex.py                    把 classes.dex 写入 APK
│  └─ make-foreground.mjs           生成自适应图标前景层
└─ out/                             构建产物
```

## 构建

需要本机已安装 Android SDK（build-tools 36 / platform android-37）与 JDK 17：

```bat
android\build-apk.cmd
```

脚本会自动：复制 `web/` 到 `assets/www`（保留 Android 版 `index.html`）→ 编译 Java → dex →
编译资源 → 链接 → 注入 `classes.dex` → 对齐 → 用 `android/keystore/yaua-release.jks` 签名。

产物：`android\out\YiStarLine Account Unified App.apk`
（首次构建会自动生成签名密钥，口令 `yaua123456`，仅用于本机安装）。

## 安装

1. 手机开启「允许安装未知来源应用」；
2. 把 APK 传到手机点击安装，或连接设备后执行 `adb install -r "android\out\YiStarLine Account Unified App.apk"`。

## 与桌面版的差异

| 项目 | 桌面版 | Android 版 |
| --- | --- | --- |
| 后端 | Python + SQLite | JavaScript + localStorage |
| 密码哈希 | scrypt + 本机密钥 | PBKDF2-SHA256（12 万次） |
| 本地 HTTP 服务 | 有（供其它产品调用） | 无（无跨进程调用） |
| 托盘 / 开机自启 | 有 | 无（对应设置项自动隐藏） |
| 备份 | 数据目录 + VACUUM INTO | 导出 / 恢复 JSON 文件 |
| 系统栏适配 | 无 | 状态栏与手势条安全区、44px 触摸目标、横向滚动导航 |

## 已知限制

- 没有跨应用单点登录：Android 端目前是独立的账户管理器，其它 App 若需共享身份，需要接入
  `AccountManager` / `ContentProvider` 适配层（尚未实现）。
- 应用被卸载或清除数据后，本地账户与恢复码不可找回；请用设置页的备份功能导出 JSON。
