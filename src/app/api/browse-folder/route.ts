import { withErrorHandling } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Opens a native OS folder-picker dialog on the server machine (works for local installs).
// Query param: ?current=<path> to pre-select a folder.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const current = new URL(req.url).searchParams.get("current") ?? "";

  try {
    const platform = process.platform;

    if (platform === "win32") {
      const script = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Select PDF storage folder'
$f.ShowNewFolderButton = $true
${current ? `$f.SelectedPath = '${current.replace(/'/g, "''")}'` : ""}
$result = $f.ShowDialog()
if ($result -eq 'OK') { Write-Output $f.SelectedPath }
`.trim();

      const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script], {
        timeout: 60_000,
      });
      const selected = stdout.trim();
      if (!selected) return NextResponse.json({ cancelled: true });
      return NextResponse.json({ path: selected });

    } else if (platform === "darwin") {
      const appleScript = current
        ? `choose folder with prompt "Select PDF storage folder" default location POSIX file "${current}"`
        : `choose folder with prompt "Select PDF storage folder"`;
      const { stdout } = await execFileAsync("osascript", ["-e", appleScript], { timeout: 60_000 });
      const alias = stdout.trim();
      // Convert "alias Macintosh HD:Users:foo:bar:" → POSIX path
      const { stdout: posix } = await execFileAsync("osascript", ["-e", `POSIX path of ("${alias}" as alias)`], { timeout: 5000 });
      const selected = posix.trim().replace(/\/$/, "");
      if (!selected) return NextResponse.json({ cancelled: true });
      return NextResponse.json({ path: selected });

    } else {
      // Linux — try zenity, fall back to kdialog
      try {
        const args = ["--file-selection", "--directory", "--title=Select PDF storage folder"];
        if (current) args.push(`--filename=${current}/`);
        const { stdout } = await execFileAsync("zenity", args, { timeout: 60_000 });
        const selected = stdout.trim();
        if (!selected) return NextResponse.json({ cancelled: true });
        return NextResponse.json({ path: selected });
      } catch (zenityErr) {
        console.error("[browse-folder] zenity unavailable, trying kdialog:", zenityErr);
        const args = ["--getexistingdirectory", current || (process.env.HOME ?? "/")];
        const { stdout } = await execFileAsync("kdialog", args, { timeout: 60_000 });
        const selected = stdout.trim();
        if (!selected) return NextResponse.json({ cancelled: true });
        return NextResponse.json({ path: selected });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // User cancelled or dialog not available
    if (msg.includes("User cancelled") || msg.includes("(-128)")) {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
