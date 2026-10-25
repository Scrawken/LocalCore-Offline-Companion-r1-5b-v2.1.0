# LocalCore Native C# .exe Compiler Script
$source = @"
using System;
using System.Diagnostics;
using System.Windows.Forms;
using System.IO;

public class Program {
    [STAThread]
    public static void Main() {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string htmlPath = Path.Combine(baseDir, "renderer", "index.html");
        
        // Start Node daemon if node is available
        try {
            ProcessStartInfo daemonInfo = new ProcessStartInfo("node", "engine/local-inference-daemon.js --port 11434");
            daemonInfo.WorkingDirectory = baseDir;
            daemonInfo.CreateNoWindow = true;
            daemonInfo.UseShellExecute = false;
            Process.Start(daemonInfo);
        } catch {}

        // Launch UI window
        Process.Start(new ProcessStartInfo("cmd", "/c start " + htmlPath) { CreateNoWindow = true, UseShellExecute = false });
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly (Join-Path $PSScriptRoot "..LocalCore.exe") -OutputType WindowsApplication
Write-Host "LocalCore.exe compiled successfully."
