using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Drawing;

namespace LanternEd
{
    public class MainForm : Form
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string targetUrl = "https://lantern-ed.vercel.app";
            if (args.Length > 0 && !string.IsNullOrEmpty(args[0]))
            {
                targetUrl = args[0];
            }

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string profileDir = Path.Combine(localAppData, "LanternEd", "NativeProfile");
            Directory.CreateDirectory(profileDir);

            // Launch Microsoft Edge in dedicated standalone application mode
            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edgePath))
            {
                edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            }

            if (File.Exists(edgePath))
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = edgePath,
                    Arguments = string.Format(
                        "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1280,800 --enable-features=OverlayScrollbar,DirectML --no-first-run --no-default-browser-check",
                        targetUrl, profileDir
                    ),
                    UseShellExecute = true
                };
                try
                {
                    Process.Start(psi);
                    return;
                }
                catch
                {
                    // Fallback to default browser
                }
            }

            // Fallback: Open in default browser
            Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
        }
    }
}
