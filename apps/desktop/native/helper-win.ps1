# tabhush-helper for Windows (Q-71): the same JSON-lines protocol as native/helper.swift.
# Runs in Windows PowerShell 5.1 (built into Windows 10 and 11), so testers install nothing. The
# C# below is compiled on the fly by Add-Type, which only understands C# 5: keep it that way.
#
# Front window and its title: Win32 (no permission prompt, DSK-20). Browser address: UI
# Automation reads the address bar of Chromium browsers and Firefox. Closing a tab: focus that
# window and send Ctrl+W, only after re-checking it still shows the blocked page.

param([string]$App = "")

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

$code = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

public static class TH {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const uint GW_OWNER = 4;
  const int DWMWA_CLOAKED = 14;
  const byte VK_CONTROL = 0x11, VK_MENU = 0x12, VK_W = 0x57;
  const uint KEYUP = 2;

  // Chromium browsers and Firefox: the address bar can be read with UI Automation.
  static readonly HashSet<string> Browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
    "chrome.exe", "msedge.exe", "brave.exe", "opera.exe", "vivaldi.exe", "arc.exe", "firefox.exe", "zen.exe", "chromium.exe"
  };

  class Proc { public string Exe; public string Name; public string Path; }
  static readonly Dictionary<uint, Proc> procs = new Dictionary<uint, Proc>();
  static readonly Dictionary<string, string> urls = new Dictionary<string, string>(); // hwnd|title -> url

  // --------- JSON out (a small writer: strings, numbers, bools, null, lists, maps) ---------

  public static string Json(object v) {
    var sb = new StringBuilder();
    Write(sb, v);
    return sb.ToString();
  }

  static void Write(StringBuilder sb, object v) {
    if (v == null) { sb.Append("null"); return; }
    if (v is string) { Str(sb, (string)v); return; }
    if (v is bool) { sb.Append((bool)v ? "true" : "false"); return; }
    if (v is int || v is long || v is uint) { sb.Append(Convert.ToString(v, CultureInfo.InvariantCulture)); return; }
    var map = v as Dictionary<string, object>;
    if (map != null) {
      sb.Append('{');
      bool first = true;
      foreach (var kv in map) {
        if (!first) sb.Append(',');
        first = false;
        Str(sb, kv.Key);
        sb.Append(':');
        Write(sb, kv.Value);
      }
      sb.Append('}');
      return;
    }
    var list = v as System.Collections.IEnumerable;
    if (list != null) {
      sb.Append('[');
      bool first = true;
      foreach (var x in list) {
        if (!first) sb.Append(',');
        first = false;
        Write(sb, x);
      }
      sb.Append(']');
      return;
    }
    Str(sb, v.ToString());
  }

  static void Str(StringBuilder sb, string s) {
    sb.Append('"');
    foreach (char c in s) {
      if (c == '"') sb.Append("\\\"");
      else if (c == '\\') sb.Append("\\\\");
      else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
      else sb.Append(c);
    }
    sb.Append('"');
  }

  public static Dictionary<string, object> Map() { return new Dictionary<string, object>(); }

  // --------- windows and processes ---------

  static string Title(IntPtr h) {
    int n = GetWindowTextLength(h);
    if (n <= 0) return "";
    var sb = new StringBuilder(n + 1);
    GetWindowText(h, sb, sb.Capacity);
    return sb.ToString();
  }

  static Proc ProcOf(uint pid) {
    Proc p;
    if (procs.TryGetValue(pid, out p)) return p;
    p = new Proc();
    try {
      var pr = Process.GetProcessById((int)pid);
      p.Exe = pr.ProcessName.ToLowerInvariant() + ".exe";
      p.Name = pr.ProcessName;
      p.Path = "";
      try {
        p.Path = pr.MainModule.FileName;
        string d = pr.MainModule.FileVersionInfo.FileDescription;
        if (!string.IsNullOrEmpty(d)) p.Name = d.Trim();
      } catch (Exception) { }
    } catch (Exception) {
      p.Exe = "unknown.exe";
      p.Name = "Unknown";
      p.Path = "";
    }
    if (procs.Count > 500) procs.Clear();
    procs[pid] = p;
    return p;
  }

  static bool IsAppWindow(IntPtr h) {
    if (!IsWindowVisible(h)) return false;
    if (GetWindow(h, GW_OWNER) != IntPtr.Zero) return false;
    if ((GetWindowLong(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return false;
    int cloaked;
    if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return false;
    return GetWindowTextLength(h) > 0;
  }

  static List<IntPtr> AppWindows() {
    var list = new List<IntPtr>();
    EnumWindows(delegate (IntPtr h, IntPtr l) { if (IsAppWindow(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }

  static Dictionary<string, object> AppInfo(uint pid, IntPtr h) {
    var p = ProcOf(pid);
    var m = Map();
    // UWP apps run inside ApplicationFrameHost; the window title names the app.
    if (p.Exe == "applicationframehost.exe") {
      string t = Title(h);
      m["name"] = t;
      m["bundleId"] = "uwp:" + t.ToLowerInvariant();
    } else {
      m["name"] = p.Name;
      m["bundleId"] = p.Exe;
    }
    m["pid"] = (int)pid;
    m["path"] = p.Path ?? "";
    m["category"] = "";
    m["regular"] = true;
    return m;
  }

  static string StripBrowserName(string title) {
    int i = title.LastIndexOf(" - ", StringComparison.Ordinal);
    if (i < 0) i = title.LastIndexOf(" \u2014 ", StringComparison.Ordinal);
    return i > 0 ? title.Substring(0, i).Trim() : title.Trim();
  }

  // --------- browser address bar (UI Automation, with a timeout) ---------

  static string AddressBar(IntPtr h, string title) {
    string key = h.ToInt64().ToString() + "|" + title;
    string cached;
    if (urls.TryGetValue(key, out cached)) return cached;
    string result = null;
    var t = new Thread(delegate () {
      try {
        var root = AutomationElement.FromHandle(h);
        var cond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit);
        var edit = root.FindFirst(TreeScope.Descendants, cond);
        if (edit == null) return;
        object pat;
        if (!edit.TryGetCurrentPattern(ValuePattern.Pattern, out pat)) return;
        string v = ((ValuePattern)pat).Current.Value;
        if (string.IsNullOrEmpty(v) || v.IndexOf(' ') >= 0) return;
        if (v.IndexOf("://", StringComparison.Ordinal) < 0) {
          if (v.IndexOf('.') < 0 && !v.StartsWith("localhost", StringComparison.OrdinalIgnoreCase)) return;
          v = "https://" + v;
        }
        result = v;
      } catch (Exception) { }
    });
    t.IsBackground = true;
    t.Start();
    if (!t.Join(1500)) return null;
    if (urls.Count > 300) urls.Clear();
    if (result != null) urls[key] = result;
    return result;
  }

  // --------- commands ---------

  public static Dictionary<string, object> Front() {
    var r = Map();
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) { r["app"] = null; r["title"] = ""; return r; }
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    var app = AppInfo(pid, h);
    string title = Title(h);
    r["app"] = app;
    r["title"] = title;
    if (Browsers.Contains((string)app["bundleId"])) {
      string url = AddressBar(h, title);
      if (url != null) {
        r["url"] = url;
        r["tabTitle"] = StripBrowserName(title);
      }
    }
    return r;
  }

  public static Dictionary<string, object> Apps() {
    var seen = new HashSet<uint>();
    var list = new List<object>();
    foreach (var h in AppWindows()) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (seen.Add(pid)) list.Add(AppInfo(pid, h));
    }
    var r = Map();
    r["apps"] = list;
    return r;
  }

  // Each browser window's current tab (Windows can't list background tabs from outside).
  public static Dictionary<string, object> Tabs() {
    var list = new List<object>();
    foreach (var h in AppWindows()) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      var p = ProcOf(pid);
      if (!Browsers.Contains(p.Exe)) continue;
      string title = Title(h);
      string url = AddressBar(h, title);
      if (url == null) continue;
      var t = Map();
      t["bundleId"] = p.Exe;
      t["url"] = url;
      t["title"] = StripBrowserName(title);
      list.Add(t);
    }
    var r = Map();
    r["tabs"] = list;
    return r;
  }

  static void Focus(IntPtr h) {
    // Windows only lets the foreground app hand over focus; a tap of Alt lifts that lock.
    keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
    keybd_event(VK_MENU, 0, KEYUP, UIntPtr.Zero);
    if (IsIconic(h)) ShowWindow(h, 9);
    SetForegroundWindow(h);
    Thread.Sleep(120);
  }

  static void CtrlW() {
    keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
    keybd_event(VK_W, 0, 0, UIntPtr.Zero);
    keybd_event(VK_W, 0, KEYUP, UIntPtr.Zero);
    keybd_event(VK_CONTROL, 0, KEYUP, UIntPtr.Zero);
    Thread.Sleep(120);
  }

  static string Norm(string u) {
    if (u == null) return "";
    int i = u.IndexOf("://", StringComparison.Ordinal);
    if (i >= 0) u = u.Substring(i + 3);
    if (u.StartsWith("www.", StringComparison.OrdinalIgnoreCase)) u = u.Substring(4);
    return u.TrimEnd('/').ToLowerInvariant();
  }

  // Closes the tab showing one of these addresses in each window of that browser.
  public static Dictionary<string, object> CloseTabs(string exe, string[] targets) {
    var want = new HashSet<string>();
    foreach (var u in targets) want.Add(Norm(u));
    int closed = 0;
    foreach (var h in AppWindows()) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (!string.Equals(ProcOf(pid).Exe, exe, StringComparison.OrdinalIgnoreCase)) continue;
      string title = Title(h);
      string url = AddressBar(h, title);
      if (url == null || !want.Contains(Norm(url))) continue;
      Focus(h);
      if (GetForegroundWindow() != h || Title(h) != title) continue;
      CtrlW();
      closed++;
    }
    var r = Map();
    r["closed"] = closed;
    return r;
  }

  // A browser whose address can't be read: Ctrl+W, only if its window in front still shows that title.
  public static Dictionary<string, object> CloseFrontTab(string exe, string expected) {
    var r = Map();
    IntPtr h = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    bool ok = h != IntPtr.Zero && string.Equals(ProcOf(pid).Exe, exe, StringComparison.OrdinalIgnoreCase) && Title(h) == expected;
    if (ok) CtrlW();
    r["closed"] = ok;
    return r;
  }

  static string ProcName(string exe) {
    return exe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? exe.Substring(0, exe.Length - 4) : exe;
  }

  // Quit: ask every window of the app to close, as its close button would.
  public static Dictionary<string, object> Quit(string exe) {
    bool done = false;
    foreach (var p in Process.GetProcessesByName(ProcName(exe))) {
      try { if (p.MainWindowHandle != IntPtr.Zero) { p.CloseMainWindow(); done = true; } } catch (Exception) { }
    }
    var r = Map();
    r["done"] = done;
    return r;
  }

  // Hide: minimize every window of the app.
  public static Dictionary<string, object> Hide(string exe) {
    bool done = false;
    foreach (var h in AppWindows()) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (!string.Equals(ProcOf(pid).Exe, exe, StringComparison.OrdinalIgnoreCase)) continue;
      ShowWindow(h, 6);
      done = true;
    }
    var r = Map();
    r["done"] = done;
    return r;
  }
}
'@

try {
  Add-Type -TypeDefinition $code -Language CSharp -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase
} catch {
  $msg = ($_.Exception.Message -replace '[\r\n]+', ' ')
  [Console]::Out.WriteLine('{"id":0,"ok":false,"error":' + [TH]::Json($msg) + '}')
  exit 1
}

$relaunch = $false
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  # Skip anything before the JSON (a byte-order mark some pipes add to the first line).
  $start = $line.IndexOf('{')
  if ($start -lt 0) { continue }
  if ($start -gt 0) { $line = $line.Substring($start) }
  $id = 0
  try {
    $m = $line | ConvertFrom-Json
    $id = [int]$m.id
    switch ($m.cmd) {
      "trust" { $r = [TH]::Map(); $r["trusted"] = $true }
      "front" { $r = [TH]::Front() }
      "apps" { $r = [TH]::Apps() }
      "tabs" { $r = [TH]::Tabs() }
      "closeTabs" { $r = [TH]::CloseTabs([string]$m.bundleId, [string[]]@($m.urls)) }
      "closeFrontTab" { $r = [TH]::CloseFrontTab([string]$m.bundleId, [string]$m.title) }
      "quit" { $r = [TH]::Quit([string]$m.bundleId) }
      "hide" { $r = [TH]::Hide([string]$m.bundleId) }
      # Per-app volume isn't available here; music keeps its own volume on Windows.
      "volume" { $r = [TH]::Map(); $r["previous"] = $null }
      "relaunch" { $relaunch = [bool]$m.on; $r = [TH]::Map(); $r["on"] = $relaunch }
      default { $r = [TH]::Map(); $r["error"] = "unknown command " + $m.cmd }
    }
    $r["ok"] = -not $r.ContainsKey("error")
  } catch {
    $r = [TH]::Map()
    $r["ok"] = $false
    $r["error"] = ($_.Exception.Message -replace '[\r\n]+', ' ')
  }
  $r["id"] = $id
  [Console]::Out.WriteLine([TH]::Json($r))
  [Console]::Out.Flush()
}

# The app closed our stdin: it quit or was killed. Reopen it if a session was locked (Q-70).
if ($relaunch -and $App) {
  Start-Sleep -Milliseconds 1000
  Start-Process -FilePath $App
}
