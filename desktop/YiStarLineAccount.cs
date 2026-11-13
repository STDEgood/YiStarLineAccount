// YiStarLine Account · Windows 桌面客户端
// 原生 WinForms 窗口 + 内嵌 WebView2（Chromium），无浏览器地址栏、无控制台窗口。
// 编译：见 desktop/build-desktop.cmd（使用系统自带 .NET Framework 4.8 编译器，无需联网）
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace YiStarLineAccount
{
    internal static class Log
    {
        private static readonly object Gate = new object();
        private static string _path;

        public static void Init(string directory)
        {
            try
            {
                Directory.CreateDirectory(directory);
                _path = Path.Combine(directory, "desktop.log");
            }
            catch (Exception) { }
        }

        public static void Write(string message)
        {
            if (_path == null)
            {
                return;
            }
            try
            {
                lock (Gate)
                {
                    FileInfo info = new FileInfo(_path);
                    if (info.Exists && info.Length > 768 * 1024)
                    {
                        File.Move(_path, _path + ".old");
                    }
                    File.AppendAllText(_path,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "  " + message + Environment.NewLine,
                        Encoding.UTF8);
                }
            }
            catch (Exception) { }
        }
    }

    internal static class Program
    {
        private const string MutexName = "YiStarLineAccount.Desktop.SingleInstance";

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetDllDirectory(string path);

        [DllImport("shcore.dll")]
        private static extern int SetProcessDpiAwareness(int value);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main()
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("YiStarLine Account 已经在运行。\n请查看任务栏或系统托盘中的图标。",
                        "YiStarLine Account", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e)
                {
                    Log.Write("ThreadException: " + e.Exception);
                    MessageBox.Show("发生未处理的错误：\n" + e.Exception.Message, "YiStarLine Account",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                };
                AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
                {
                    Log.Write("UnhandledException: " + e.ExceptionObject);
                };
                try
                {
                    SetProcessDpiAwareness(2);
                }
                catch (Exception)
                {
                    try { SetProcessDPIAware(); }
                    catch (Exception) { }
                }

                string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
                string libDir = Path.Combine(exeDir, "desktop", "lib");
                if (Directory.Exists(libDir))
                {
                    SetDllDirectory(libDir);
                }

                Application.Run(new MainForm(exeDir));
            }
        }
    }

    internal sealed class DarkMenuColorTable : ProfessionalColorTable
    {
        private static readonly Color Background = Color.FromArgb(22, 24, 30);
        private static readonly Color BorderColor = Color.FromArgb(52, 56, 66);
        private static readonly Color Accent = Color.FromArgb(37, 99, 235);

        public override Color ToolStripDropDownBackground { get { return Background; } }
        public override Color ImageMarginGradientBegin { get { return Background; } }
        public override Color ImageMarginGradientMiddle { get { return Background; } }
        public override Color ImageMarginGradientEnd { get { return Background; } }
        public override Color MenuBorder { get { return BorderColor; } }
        public override Color MenuItemBorder { get { return Accent; } }
        public override Color MenuItemSelected { get { return Accent; } }
        public override Color MenuItemSelectedGradientBegin { get { return Accent; } }
        public override Color MenuItemSelectedGradientEnd { get { return Accent; } }
        public override Color MenuItemPressedGradientBegin { get { return Accent; } }
        public override Color MenuItemPressedGradientEnd { get { return Accent; } }
        public override Color SeparatorDark { get { return BorderColor; } }
        public override Color SeparatorLight { get { return BorderColor; } }
    }

    internal sealed class DarkMenuRenderer : ToolStripProfessionalRenderer
    {
        public DarkMenuRenderer() : base(new DarkMenuColorTable())
        {
            RoundedEdges = false;
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            if (!e.Item.Enabled)
            {
                e.TextColor = Color.FromArgb(122, 130, 142);
            }
            else
            {
                e.TextColor = e.Item.Selected ? Color.White : Color.FromArgb(220, 225, 232);
            }
            base.OnRenderItemText(e);
        }

        protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
        {
            e.ArrowColor = e.Item.Selected ? Color.White : Color.FromArgb(150, 158, 172);
            base.OnRenderArrow(e);
        }

        protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
        {
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
        }
    }

    internal sealed class MainForm : Form
    {
        private const string AppTitle = "YiStarLine Account Unified App";

        private readonly string _root;
        private readonly string _dataDir;
        private readonly string _logDir;
        private WebView2 _web;
        private NotifyIcon _tray;
        private Process _server;
        private bool _ownServer;
        private string _baseUrl = "http://127.0.0.1:8600";
        private bool _exiting;
        private bool _balloonShown;
        private Icon _iconLarge;
        private Icon _iconSmall;
        private System.Windows.Forms.Timer _themeTimer;
        private bool _titleBarDark;
        private bool _syncingTheme;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        public MainForm(string root)
        {
            _root = root;
            _dataDir = Path.Combine(root, "data");
            _logDir = Path.Combine(root, "logs");
            Directory.CreateDirectory(_dataDir);
            Directory.CreateDirectory(_logDir);
            Log.Init(_logDir);
            Log.Write("---- desktop client start, pid=" + Process.GetCurrentProcess().Id + " root=" + root);

            BuildWindow();
            BuildTray();
            RestoreWindowBounds();

            Shown += delegate { Log.Write("Shown event"); StartAsync(); };
            FormClosing += OnFormClosing;
        }

        // ------------------------------------------------------------ 窗口
        private void BuildWindow()
        {
            Text = AppTitle;
            ClientSize = new Size(1600, 1000);
            MinimumSize = new Size(900, 600);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(7, 8, 12);
            DoubleBuffered = true;
            LoadIcons();

            _web = new WebView2();
            _web.Dock = DockStyle.Fill;
            _web.DefaultBackgroundColor = Color.White;
            Controls.Add(_web);
        }

        private void LoadIcons()
        {
            try
            {
                Assembly asm = Assembly.GetExecutingAssembly();
                using (Stream stream = asm.GetManifestResourceStream("app.ico"))
                {
                    if (stream != null)
                    {
                        _iconLarge = new Icon(stream, 256, 256);
                        Icon = _iconLarge;
                    }
                }
                using (Stream stream = asm.GetManifestResourceStream("app.ico"))
                {
                    if (stream != null)
                    {
                        _iconSmall = new Icon(stream, 16, 16);
                    }
                }
            }
            catch (Exception)
            {
                try
                {
                    Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                    _iconSmall = Icon;
                }
                catch (Exception) { }
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyTitleBarTheme(false);
        }

        private void ApplyTitleBarTheme(bool dark)
        {
            if (_titleBarDark == dark)
            {
                return;
            }
            try
            {
                int value = dark ? 1 : 0;
                DwmSetWindowAttribute(Handle, 20, ref value, sizeof(int));
                _titleBarDark = dark;
            }
            catch (Exception) { }
        }

        private async System.Threading.Tasks.Task SyncTitleBarAsync()
        {
            if (_web == null || _web.CoreWebView2 == null || _syncingTheme)
            {
                return;
            }
            _syncingTheme = true;
            try
            {
                string raw = await _web.CoreWebView2.ExecuteScriptAsync(
                    "document.documentElement.getAttribute('data-theme') || 'light'");
                bool dark = raw != null && raw.IndexOf("dark", StringComparison.OrdinalIgnoreCase) >= 0;
                ApplyTitleBarTheme(dark);
            }
            catch (Exception) { }
            finally
            {
                _syncingTheme = false;
            }
        }

        private void StartThemeWatcher()
        {
            if (_themeTimer != null)
            {
                return;
            }
            _themeTimer = new System.Windows.Forms.Timer();
            _themeTimer.Interval = 1500;
            _themeTimer.Tick += delegate { SyncTitleBarAsync(); };
            _themeTimer.Start();
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            try
            {
                Rectangle work = Screen.FromControl(this).WorkingArea;
                int maxWidth = (int)(work.Width * 0.96);
                int maxHeight = (int)(work.Height * 0.96);
                if (WindowState == FormWindowState.Normal &&
                    (Width > maxWidth || Height > maxHeight))
                {
                    Size = new Size(Math.Min(Width, maxWidth), Math.Min(Height, maxHeight));
                    Location = new Point(
                        work.X + (work.Width - Width) / 2,
                        work.Y + (work.Height - Height) / 2);
                }
                Log.Write("window " + Width + "x" + Height + " work " + work.Width + "x" + work.Height);
            }
            catch (Exception) { }
        }

        // ------------------------------------------------------------ 托盘
        private void BuildTray()
        {
            _tray = new NotifyIcon();
            _tray.Icon = _iconSmall ?? Icon;
            _tray.Text = AppTitle;
            _tray.Visible = true;

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Renderer = new DarkMenuRenderer();
            menu.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            menu.ShowImageMargin = false;
            menu.Padding = new Padding(4, 6, 4, 6);
            menu.ForeColor = Color.FromArgb(220, 225, 232);
            menu.DropShadowEnabled = true;

            ToolStripMenuItem header = new ToolStripMenuItem("  " + AppTitle);
            header.Enabled = false;
            header.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold, GraphicsUnit.Point);
            menu.Items.Add(header);
            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem open = new ToolStripMenuItem("打开管理界面");
            open.DropDown = BuildSubMenu(new string[,] {
                { "概览", "#/dashboard" },
                { "账户安全", "#/security" },
                { "登录设备", "#/devices" },
                { "已登录软件", "#/apps" },
                { "登录记录", "#/activity" },
                { "数据与备份", "#/data" },
                { "关于", "#/about" }
            });
            menu.Items.Add(open);

            ToolStripMenuItem demo = new ToolStripMenuItem("打开示例产品");
            demo.Click += delegate { OpenExternal(_baseUrl + "/demo/"); };
            menu.Items.Add(demo);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem developer = new ToolStripMenuItem("开发者");
            developer.DropDown = BuildSubMenuActions(new string[,] {
                { "开发者页面", "developer" },
                { "复制服务地址", "copy" },
                { "打开接入文档", "docs" }
            });
            menu.Items.Add(developer);

            ToolStripMenuItem data = new ToolStripMenuItem("数据");
            data.DropDown = BuildSubMenuActions(new string[,] {
                { "打开数据目录", "data" },
                { "查看服务日志", "logs" },
                { "打开备份目录", "backups" }
            });
            menu.Items.Add(data);

            ToolStripMenuItem service = new ToolStripMenuItem("服务");
            service.DropDown = BuildSubMenuActions(new string[,] {
                { "在浏览器中打开", "browser" },
                { "重新连接本地服务", "reconnect" },
                { "停止本地服务", "stop" }
            });
            menu.Items.Add(service);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem about = new ToolStripMenuItem("关于 " + AppTitle);
            about.Click += delegate { NavigateTo("#/about"); };
            menu.Items.Add(about);

            ToolStripMenuItem exit = new ToolStripMenuItem("退出");
            exit.Click += delegate { ExitApp(); };
            menu.Items.Add(exit);

            menu.Opening += delegate
            {
                Size preferred = menu.GetPreferredSize(Size.Empty);
                menu.Region = RoundedRegion(preferred.Width, preferred.Height, 8);
            };
            menu.Opened += delegate
            {
                menu.Region = RoundedRegion(menu.Width, menu.Height, 8);
            };

            _tray.ContextMenuStrip = menu;
            _tray.DoubleClick += delegate { ShowWindow(); };
        }

        private ContextMenuStrip BuildSubMenu(string[,] items)
        {
            ContextMenuStrip sub = NewSubMenu();
            for (int i = 0; i < items.GetLength(0); i += 1)
            {
                string hash = items[i, 1];
                ToolStripMenuItem item = new ToolStripMenuItem(items[i, 0]);
                item.Click += delegate { NavigateTo(hash); };
                sub.Items.Add(item);
            }
            return sub;
        }

        private ContextMenuStrip BuildSubMenuActions(string[,] items)
        {
            ContextMenuStrip sub = NewSubMenu();
            for (int i = 0; i < items.GetLength(0); i += 1)
            {
                string action = items[i, 1];
                ToolStripMenuItem item = new ToolStripMenuItem(items[i, 0]);
                item.Click += delegate { RunAction(action); };
                sub.Items.Add(item);
            }
            return sub;
        }

        private static ContextMenuStrip NewSubMenu()
        {
            ContextMenuStrip sub = new ContextMenuStrip();
            sub.Renderer = new DarkMenuRenderer();
            sub.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            sub.ShowImageMargin = false;
            sub.Padding = new Padding(4, 6, 4, 6);
            sub.ForeColor = Color.FromArgb(220, 225, 232);
            sub.Opening += delegate
            {
                Size preferred = sub.GetPreferredSize(Size.Empty);
                sub.Region = RoundedRegion(preferred.Width, preferred.Height, 8);
            };
            return sub;
        }

        private static Region RoundedRegion(int width, int height, int radius)
        {
            if (width < radius * 2 || height < radius * 2)
            {
                return new Region(new Rectangle(0, 0, Math.Max(1, width), Math.Max(1, height)));
            }
            using (System.Drawing.Drawing2D.GraphicsPath path = new System.Drawing.Drawing2D.GraphicsPath())
            {
                int d = radius * 2;
                path.AddArc(0, 0, d, d, 180, 90);
                path.AddArc(width - d - 1, 0, d, d, 270, 90);
                path.AddArc(width - d - 1, height - d - 1, d, d, 0, 90);
                path.AddArc(0, height - d - 1, d, d, 90, 90);
                path.CloseFigure();
                return new Region(path);
            }
        }

        private void NavigateTo(string hash)
        {
            ShowWindow();
            try
            {
                if (_web != null && _web.CoreWebView2 != null)
                {
                    _web.CoreWebView2.ExecuteScriptAsync(
                        "location.hash = " + "\"" + hash + "\";");
                }
            }
            catch (Exception) { }
        }

        private void RunAction(string action)
        {
            switch (action)
            {
                case "developer":
                    NavigateTo("#/developer");
                    break;
                case "copy":
                    try { Clipboard.SetText(_baseUrl); } catch (Exception) { }
                    break;
                case "docs":
                    OpenExternal(_baseUrl + "/docs/integration.md");
                    break;
                case "data":
                    OpenFolder(_dataDir);
                    break;
                case "logs":
                    OpenFolder(_logDir);
                    break;
                case "backups":
                    OpenFolder(Path.Combine(_dataDir, "backups"));
                    break;
                case "browser":
                    OpenExternal(_baseUrl);
                    break;
                case "reconnect":
                    Reconnect();
                    break;
                case "stop":
                    StopServer();
                    try { _web.CoreWebView2.NavigateToString(BuildNoticePage("本地服务已停止", true, "可通过托盘菜单重新连接。")); }
                    catch (Exception) { }
                    break;
            }
        }

        private void ShowWindow()
        {
            Show();
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }
            Activate();
            BringToFront();
            try
            {
                if (_web != null)
                {
                    _web.Visible = true;
                    _web.BringToFront();
                }
            }
            catch (Exception) { }
        }

        private void ExitApp()
        {
            _exiting = true;
            if (_themeTimer != null)
            {
                _themeTimer.Stop();
                _themeTimer.Dispose();
                _themeTimer = null;
            }
            SaveBounds();
            if (_tray != null)
            {
                _tray.Visible = false;
                _tray.Dispose();
            }
            StopServer();
            Close();
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (!_exiting && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                SaveBounds();
                Hide();
                if (!_balloonShown && _tray != null)
                {
                    _balloonShown = true;
                    _tray.ShowBalloonTip(3200, "YiStarLine Account 仍在后台运行",
                        "你的产品可以继续使用快速登录。双击托盘图标可重新打开管理界面。",
                        ToolTipIcon.Info);
                }
                return;
            }
            if (_exiting)
            {
                StopServer();
            }
        }

        // ------------------------------------------------------------ WebView2
        private async void StartAsync()
        {
            try
            {
                string profile = Path.Combine(_dataDir, "webview2");
                Directory.CreateDirectory(profile);
                Log.Write("creating WebView2 environment, profile=" + profile);
                // 黑屏/白屏兜底：部分机器（远程桌面、虚拟显卡、驱动异常）下 GPU 合成不出画面，
                // 默认关闭 GPU，可用环境变量 YAUA_WEBVIEW_ARGS 覆盖。
                // 仅在需要排查渲染问题时通过环境变量追加参数，默认不干预 GPU
                string browserArgs = Environment.GetEnvironmentVariable("YAUA_WEBVIEW_ARGS");
                CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions();
                if (!string.IsNullOrWhiteSpace(browserArgs))
                {
                    options.AdditionalBrowserArguments = browserArgs;
                }
                Log.Write("webview args: " + browserArgs);
                CoreWebView2Environment environment = null;
                Exception lastError = null;
                foreach (string runtimeFolder in WebViewRuntimes())
                {
                    try
                    {
                        environment = await CoreWebView2Environment.CreateAsync(runtimeFolder, profile, options);
                        Log.Write("environment ready, runtime=" + environment.BrowserVersionString
                            + (runtimeFolder == null ? " (evergreen)" : " (" + runtimeFolder + ")"));
                        break;
                    }
                    catch (Exception ex)
                    {
                        lastError = ex;
                        Log.Write("environment failed for " + (runtimeFolder ?? "evergreen") + ": " + ex.Message);
                    }
                }
                if (environment == null)
                {
                    throw new InvalidOperationException("没有可用的 WebView2 运行时", lastError);
                }
                Log.Write("EnsureCoreWebView2Async ...");
                Task ensure = _web.EnsureCoreWebView2Async(environment);
                Task timeout = Task.Delay(20000);
                if (await Task.WhenAny(ensure, timeout) != ensure)
                {
                    throw new TimeoutException("WebView2 初始化超时（20 秒）。请确认已安装 Edge WebView2 运行时。");
                }
                await ensure;
                Log.Write("WebView2 control ready");
                ConfigureWebView();
                NavigateLoading("正在启动本地服务…");
                Log.Write("loading page navigated");

                await EnsureServerAsync();
                Log.Write("server ready at " + _baseUrl + " own=" + _ownServer);
                _web.CoreWebView2.Navigate(_baseUrl);
                Text = AppTitle;
                Log.Write("main page navigated");
            }
            catch (Exception ex)
            {
                Log.Write("StartAsync failed: " + ex);
                ShowFailure(ex);
            }
        }

        // 已安装的 WebView2 运行时，优先 Evergreen，其次按版本从新到旧逐个尝试
        private static System.Collections.Generic.List<string> WebViewRuntimes()
        {
            var list = new System.Collections.Generic.List<string>();
            list.Add(null);
            var roots = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    "Microsoft", "EdgeWebView", "Application"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Microsoft", "EdgeWebView", "Application"),
            };
            var found = new System.Collections.Generic.List<Version>();
            foreach (var root in roots)
            {
                try
                {
                    if (!Directory.Exists(root))
                    {
                        continue;
                    }
                    foreach (var dir in Directory.GetDirectories(root))
                    {
                        var exe = Path.Combine(dir, "msedgewebview2.exe");
                        if (!File.Exists(exe))
                        {
                            continue;
                        }
                        Version v;
                        if (Version.TryParse(Path.GetFileName(dir), out v))
                        {
                            found.Add(v);
                        }
                    }
                }
                catch (Exception)
                {
                    // 忽略无法读取的目录
                }
            }
            found.Sort();
            found.Reverse();
            foreach (var version in found)
            {
                foreach (var root in roots)
                {
                    var dir = Path.Combine(root, version.ToString());
                    if (File.Exists(Path.Combine(dir, "msedgewebview2.exe")))
                    {
                        list.Add(dir);
                        break;
                    }
                }
            }
            return list;
        }

        private void ConfigureWebView()
        {
            CoreWebView2Settings settings = _web.CoreWebView2.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.AreDevToolsEnabled = false;
            settings.IsZoomControlEnabled = false;
            settings.IsBuiltInErrorPageEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;

            _web.CoreWebView2.ProcessFailed += delegate(object s2, CoreWebView2ProcessFailedEventArgs e2)
            {
                Log.Write("webview process failed: " + e2.ProcessFailedKind);
                if (e2.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited)
                {
                    ShowFailure(new InvalidOperationException("WebView2 浏览器进程已退出"));
                }
            };

            _web.CoreWebView2.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs e)
            {
                e.Handled = true;
                OpenExternal(e.Uri);
            };
            _web.CoreWebView2.NavigationCompleted += delegate(object s, CoreWebView2NavigationCompletedEventArgs e)
            {
                Log.Write("navigation completed ok=" + e.IsSuccess + " status=" + e.WebErrorStatus);
                if (!e.IsSuccess && !_exiting)
                {
                    // ERR_ABORTED：这次导航被后一次导航顶掉了（例如加载页 → 主页面），
                    // 属于正常现象，绝不能当成失败，否则会陷入「失败→显示加载页→再被顶掉」的死循环。
                    if (e.WebErrorStatus == CoreWebView2WebErrorStatus.ConnectionAborted
                        || e.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled)
                    {
                        Log.Write("navigation superseded (ignored)");
                        return;
                    }
                    NavigateLoading("页面加载失败，正在重试…");
                    return;
                }
                try
                {
                    _web.Visible = true;
                    _web.BringToFront();
                    _web.Invalidate();
                }
                catch (Exception) { }
            };
            _web.CoreWebView2.ProcessFailed += delegate { /* 让 WebView2 自行恢复 */ };
            StartThemeWatcher();
            _web.CoreWebView2.DocumentTitleChanged += delegate
            {
                string title = _web.CoreWebView2.DocumentTitle;
                Text = string.IsNullOrEmpty(title) ? AppTitle : title;
            };
        }

        private void NavigateLoading(string message)
        {
            if (_web.CoreWebView2 == null)
            {
                return;
            }
            _web.CoreWebView2.NavigateToString(BuildNoticePage(message, false, null));
        }

        private void ShowFailure(Exception ex)
        {
            string detail = ex == null ? "" : ex.ToString();
            Log.Write("ShowFailure: " + detail);
            if (_web.CoreWebView2 != null)
            {
                _web.CoreWebView2.NavigateToString(BuildNoticePage("本地服务启动失败", true, detail));
            }
            else
            {
                MessageBox.Show("本地服务启动失败：\n" + detail, AppTitle,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static string BuildNoticePage(string message, bool failed, string detail)
        {
            string accent = failed ? "#ff5f6d" : "#7c6cff";
            string safeMessage = WebUtility.HtmlEncode(message);
            string safeDetail = WebUtility.HtmlEncode(detail ?? "");
            StringBuilder html = new StringBuilder();
            html.Append("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">");
            html.Append("<style>html,body{height:100%;margin:0;background:#07080c;color:#eef0f6;");
            html.Append("font-family:'Segoe UI','Microsoft YaHei UI',sans-serif;display:grid;place-items:center}");
            html.Append(".card{text-align:center;max-width:460px;padding:36px}");
            html.Append(".mark{width:58px;height:58px;border-radius:16px;margin:0 auto 20px;font-weight:800;");
            html.Append("font-size:12px;letter-spacing:.06em;color:#fff;display:grid;place-items:center;");
            html.Append("background:#2563eb;");
            html.Append("h1{font-size:18px;font-weight:650;margin:0 0 8px}");
            html.Append("p{color:#98a1b2;font-size:13px;margin:0}");
            html.Append(".bar{margin:22px auto 0;width:180px;height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}");
            html.Append(".bar i{display:block;width:40%;height:100%;border-radius:3px;background:");
            html.Append(failed ? accent : "#7c6cff");
            html.Append(";animation:slide 1.15s ease-in-out infinite}");
            html.Append("@keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}");
            html.Append("pre{white-space:pre-wrap;word-break:break-all;margin:18px 0 0;font-size:11.5px;color:#ffb3ba;");
            html.Append("text-align:left;background:rgba(255,95,109,.08);border:1px solid rgba(255,95,109,.25);");
            html.Append("padding:10px 12px;border-radius:10px}");
            html.Append("</style></head><body><div class=\"card\"><div class=\"mark\">YAUA</div>");
            html.Append("<h1>").Append(safeMessage).Append("</h1>");
            html.Append("<p>").Append(failed
                ? "请双击 run\\start-console.cmd 查看详细日志，或检查本机是否安装 Python 3.9+。"
                : "首次启动需要几秒钟，请稍候。").Append("</p>");
            if (failed && safeDetail.Length > 0)
            {
                html.Append("<pre>").Append(safeDetail).Append("</pre>");
            }
            if (!failed)
            {
                html.Append("<div class=\"bar\"><i></i></div>");
            }
            html.Append("</div></body></html>");
            return html.ToString();
        }

        // ------------------------------------------------------------ 服务进程
        private async Task EnsureServerAsync()
        {
            string running = FindRunningServer();
            Log.Write("FindRunningServer -> " + (running == null ? "null" : running));
            if (running != null)
            {
                _baseUrl = running;
                _ownServer = false;
                return;
            }
            StartServer();
            _ownServer = true;
            for (int i = 0; i < 120; i++)
            {
                await Task.Delay(250);
                string url = FindRunningServer();
                if (url != null)
                {
                    _baseUrl = url;
                    return;
                }
            }
            throw new InvalidOperationException(
                "本地服务在 30 秒内没有就绪。请确认 app\\server.py 存在且 Python 可用。");
        }

        private void Reconnect()
        {
            ShowWindow();
            ReconnectAsync();
        }

        private async Task ReconnectAsync()
        {
            try
            {
                NavigateLoading("正在重新连接本地服务…");
                await EnsureServerAsync();
                _web.CoreWebView2.Navigate(_baseUrl);
            }
            catch (Exception ex)
            {
                ShowFailure(ex);
            }
        }

        private void StartServer()
        {
            string exe = FindPython();
            if (exe == null)
            {
                throw new FileNotFoundException(
                    "没有找到 Python 3。请安装 Python 3.9+ 并勾选 Add to PATH，或使用 run\\start-console.cmd 手动启动。");
            }
            string script = Path.Combine(_root, "app", "server.py");
            if (!File.Exists(script))
            {
                throw new FileNotFoundException("找不到 app\\server.py：" + script);
            }
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = exe;
            info.Arguments = "\"" + script + "\" --quiet";
            info.WorkingDirectory = _root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
            Log.Write("starting server process: " + exe + " " + info.Arguments);
            _server = Process.Start(info);
            Log.Write("server process pid=" + (_server == null ? 0 : _server.Id));
        }

        private void StopServer()
        {
            if (!_ownServer || _server == null)
            {
                return;
            }
            try
            {
                if (!_server.HasExited)
                {
                    _server.Kill();
                    _server.WaitForExit(3000);
                }
            }
            catch (Exception) { }
            finally
            {
                _server = null;
            }
        }

        private static string[] PythonCandidates()
        {
            System.Collections.Generic.List<string> list = new System.Collections.Generic.List<string>();
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            string[] dirs = path.Split(';');
            foreach (string dir in dirs)
            {
                if (string.IsNullOrEmpty(dir))
                {
                    continue;
                }
                try
                {
                    list.Add(Path.Combine(dir.Trim(), "pythonw.exe"));
                }
                catch (ArgumentException) { }
            }
            string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "Python");
            if (Directory.Exists(local))
            {
                foreach (string dir in Directory.GetDirectories(local, "Python3*"))
                {
                    list.Add(Path.Combine(dir, "pythonw.exe"));
                    list.Add(Path.Combine(dir, "python.exe"));
                }
            }
            list.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "Python", "Python313", "pythonw.exe"));
            return list.ToArray();
        }

        private string FindPython()
        {
            foreach (string candidate in PythonCandidates())
            {
                try
                {
                    if (!string.IsNullOrEmpty(candidate) && File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
                catch (ArgumentException) { }
            }
            foreach (string name in new string[] { "pythonw.exe", "python.exe" })
            {
                string resolved = SearchPath(name);
                if (resolved != null)
                {
                    return resolved;
                }
            }
            return null;
        }

        [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
        private static extern int SearchPathW(string path, string fileName, string extension,
            int bufferLength, StringBuilder buffer, IntPtr filePart);

        private static string SearchPath(string fileName)
        {
            try
            {
                StringBuilder buffer = new StringBuilder(1024);
                int result = SearchPathW(null, fileName, null, buffer.Capacity, buffer, IntPtr.Zero);
                return result > 0 ? buffer.ToString() : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        // ------------------------------------------------------------ 服务发现
        private string FindRunningServer()
        {
            string runtime = Path.Combine(_dataDir, "runtime.json");
            if (File.Exists(runtime))
            {
                try
                {
                    string text = File.ReadAllText(runtime, Encoding.UTF8);
                    Match match = Regex.Match(text, "\"port\"\\s*:\\s*(\\d+)");
                    if (match.Success)
                    {
                        string url = "http://127.0.0.1:" + match.Groups[1].Value;
                        if (IsAlive(url))
                        {
                            return url;
                        }
                    }
                }
                catch (Exception) { }
            }
            // 兜底：默认端口（runtime.json 被手动删除时）
            if (IsAlive("http://127.0.0.1:8600"))
            {
                return "http://127.0.0.1:8600";
            }
            return null;
        }

        private static bool PortOpen(string host, int port, int timeoutMs)
        {
            try
            {
                using (System.Net.Sockets.TcpClient client = new System.Net.Sockets.TcpClient())
                {
                    IAsyncResult result = client.BeginConnect(host, port, null, null);
                    if (!result.AsyncWaitHandle.WaitOne(timeoutMs))
                    {
                        return false;
                    }
                    client.EndConnect(result);
                    return client.Connected;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static bool IsAlive(string url)
        {
            try
            {
                Uri uri = new Uri(url);
                if (!PortOpen(uri.Host, uri.Port, 250))
                {
                    return false;
                }
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url + "/api/v1/health");
                request.Timeout = 800;
                request.ReadWriteTimeout = 800;
                request.Proxy = null;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.StatusCode != HttpStatusCode.OK)
                    {
                        return false;
                    }
                    using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    {
                        string body = reader.ReadToEnd();
                        return body.IndexOf("YiStarLine Account", StringComparison.Ordinal) >= 0;
                    }
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        // ------------------------------------------------------------ 杂项
        private static void OpenExternal(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception)
            {
                try
                {
                    Process.Start("explorer.exe", "\"" + url + "\"");
                }
                catch (Exception) { }
            }
        }

        private static void OpenFolder(string path)
        {
            try
            {
                Process.Start("explorer.exe", "\"" + path + "\"");
            }
            catch (Exception) { }
        }

        private void SaveBounds()
        {
            try
            {
                Rectangle bounds = RestoreBounds;
                if (bounds.Width < 200 || bounds.Height < 200)
                {
                    bounds = Bounds;
                }
                string payload = string.Format("{0},{1},{2},{3},{4}", bounds.X, bounds.Y,
                    bounds.Width, bounds.Height, WindowState == FormWindowState.Maximized ? 1 : 0);
                File.WriteAllText(Path.Combine(_dataDir, "desktop-window.txt"), payload, Encoding.UTF8);
            }
            catch (Exception) { }
        }

        private void RestoreWindowBounds()
        {
            try
            {
                string file = Path.Combine(_dataDir, "desktop-window.txt");
                if (!File.Exists(file))
                {
                    return;
                }
                string[] parts = File.ReadAllText(file, Encoding.UTF8).Split(',');
                if (parts.Length < 5)
                {
                    return;
                }
                int x = int.Parse(parts[0]);
                int y = int.Parse(parts[1]);
                int w = int.Parse(parts[2]);
                int h = int.Parse(parts[3]);
                Rectangle screen = Screen.PrimaryScreen.WorkingArea;
                if (w < 900 || h < 600 || x < -w * 2 || y < -h * 2 || x > screen.Right || y > screen.Bottom)
                {
                    return;
                }
                StartPosition = FormStartPosition.Manual;
                Bounds = new Rectangle(x, y, w, h);
                if (parts[4].Trim() == "1")
                {
                    WindowState = FormWindowState.Maximized;
                }
            }
            catch (Exception) { }
        }
    }
}
