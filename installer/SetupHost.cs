using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

// YiStarLine Account Unified App - self-extracting setup host.
// The ZIP payload is embedded as a managed resource named "payload.zip".
internal static class Program
{
    [STAThread]
    private static void Main()
    {
        try
        {
            string temp = Path.Combine(Path.GetTempPath(), "yaua-setup-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(temp);
            string zipPath = Path.Combine(temp, "payload.zip");
            Assembly self = Assembly.GetExecutingAssembly();
            using (Stream input = self.GetManifestResourceStream("payload.zip"))
            {
                if (input == null)
                {
                    MessageBox.Show("Setup payload is missing.", "YiStarLine Account Setup",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
                using (FileStream output = File.Create(zipPath))
                {
                    input.CopyTo(output);
                }
            }
            ZipFile.ExtractToDirectory(zipPath, temp);
            string root = Path.Combine(temp, "YiStarLineAccount");
            string cmd = Path.Combine(root, "Setup.cmd");
            if (!File.Exists(cmd))
            {
                MessageBox.Show("Setup script not found in payload.", "YiStarLine Account Setup",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            if (Environment.GetEnvironmentVariable("YAUA_SETUP_DRYRUN") == "1")
            {
                return;
            }
            Process.Start(new ProcessStartInfo("cmd.exe", "/c \"" + cmd + "\"")
            {
                WorkingDirectory = root,
                UseShellExecute = true
            });
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "YiStarLine Account Setup",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
