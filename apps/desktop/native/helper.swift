// tabhush-helper: the macOS layer (docs/11 DSK-10, Q-70). The Electron app talks to it over
// stdin/stdout, one JSON object per line: {"id":1,"cmd":"front"} → {"id":1,"ok":true,...}.
//
// Front app: NSWorkspace. Window titles: the Accessibility API (needs the Accessibility
// permission; without it titles are empty). Browser tabs: Apple Events to Chrome-family browsers
// and Safari (macOS asks once per browser). Nothing here takes screenshots or reads keystrokes.

import ApplicationServices
import Cocoa
import IOKit.pwr_mgt

// Browsers whose tabs can be read and closed with Apple Events.
let chromeFamily: Set<String> = [
  "com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.dev", "com.google.Chrome.canary",
  "org.chromium.Chromium", "com.brave.Browser", "com.brave.Browser.beta", "com.microsoft.edgemac",
  "com.microsoft.edgemac.Beta", "com.vivaldi.Vivaldi", "com.operasoftware.Opera", "company.thebrowser.Browser",
]
let safariFamily: Set<String> = ["com.apple.Safari", "com.apple.SafariTechnologyPreview"]

// Q-70: while a session is locked, the app turns this on. If the app then disappears (force quit),
// our stdin closes and we reopen it; a normal end or quit turns it off first.
var relaunchOnExit = false
let appPath: String? = {
  let args = CommandLine.arguments
  guard let i = args.firstIndex(of: "--app"), i + 1 < args.count else { return nil }
  return args[i + 1]
}()

func out(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj), let line = String(data: data, encoding: .utf8) else { return }
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

func appleScriptString(_ s: String) -> String {
  "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
}

/// Runs AppleScript; returns the result descriptor or throws the script's error message.
func runScript(_ source: String) throws -> NSAppleEventDescriptor {
  var err: NSDictionary?
  guard let script = NSAppleScript(source: source) else { throw NSError(domain: "script", code: 1) }
  let result = script.executeAndReturnError(&err)
  if let err = err { throw NSError(domain: "script", code: (err[NSAppleScript.errorNumber] as? Int) ?? 1, userInfo: [NSLocalizedDescriptionKey: (err[NSAppleScript.errorMessage] as? String) ?? "AppleScript error"]) }
  return result
}

func strings(_ d: NSAppleEventDescriptor) -> [String] {
  guard d.numberOfItems > 0 else { return [] }
  return (1...d.numberOfItems).map { d.atIndex($0)?.stringValue ?? "" }
}

func isRunning(_ bundleId: String) -> NSRunningApplication? {
  NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first
}

func appInfo(_ app: NSRunningApplication) -> [String: Any] {
  var info: [String: Any] = [
    "name": app.localizedName ?? "", "bundleId": app.bundleIdentifier ?? "", "pid": Int(app.processIdentifier),
    "regular": app.activationPolicy == .regular,
    "path": app.bundleURL?.path ?? app.executableURL?.path ?? "",
  ]
  if let url = app.bundleURL, let bundle = Bundle(url: url) {
    info["category"] = (bundle.infoDictionary?["LSApplicationCategoryType"] as? String) ?? ""
  }
  return info
}

func focusedWindowTitle(_ pid: pid_t) -> String {
  let axApp = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(axApp, 0.25)
  var win: CFTypeRef?
  guard AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &win) == .success, let w = win else { return "" }
  var title: CFTypeRef?
  guard AXUIElementCopyAttributeValue(w as! AXUIElement, kAXTitleAttribute as CFString, &title) == .success else { return "" }
  return (title as? String) ?? ""
}

/// Is the app keeping the display awake? A playing video or a call asserts that; a paused one, or a
/// page just sitting there, doesn't (Q-84). From the system's power assertions, no permission needed.
/// Browsers and Electron apps assert from their main process; Safari's web content processes don't match.
func keepsDisplayAwake(_ pid: pid_t) -> Bool {
  var raw: Unmanaged<CFDictionary>?
  guard IOPMCopyAssertionsByProcess(&raw) == kIOReturnSuccess, let dict = raw?.takeRetainedValue() as? [AnyHashable: Any] else { return false }
  let displayTypes: Set<String> = ["PreventUserIdleDisplaySleep", "NoDisplaySleepAssertion"]
  for (key, value) in dict {
    let owner: Int32? = (key as? NSNumber)?.int32Value ?? Int32((key as? String) ?? "")
    guard owner == pid, let list = value as? [[String: Any]] else { continue }
    for a in list where displayTypes.contains((a["AssertType"] as? String) ?? (a["AssertionType"] as? String) ?? "") { return true }
  }
  return false
}

/// URL and title of the active tab of a running browser's front window, or nil.
func activeTab(_ bundleId: String) -> (url: String, title: String)? {
  guard isRunning(bundleId) != nil else { return nil }
  let src: String
  if chromeFamily.contains(bundleId) {
    src = "tell application id \(appleScriptString(bundleId)) to if (count of windows) > 0 then return {URL, title} of active tab of front window"
  } else if safariFamily.contains(bundleId) {
    src = "tell application id \(appleScriptString(bundleId)) to if (count of windows) > 0 then return {URL, name} of current tab of front window"
  } else { return nil }
  guard let d = try? runScript(src) else { return nil }
  let v = strings(d)
  return v.count == 2 ? (v[0], v[1]) : nil
}

func handle(_ msg: [String: Any]) -> [String: Any] {
  let cmd = msg["cmd"] as? String ?? ""
  switch cmd {
  case "trust":
    // prompt=true shows the system's Accessibility request once.
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: (msg["prompt"] as? Bool) ?? false] as CFDictionary
    return ["trusted": AXIsProcessTrustedWithOptions(opts)]

  case "front":
    guard let app = NSWorkspace.shared.frontmostApplication else { return ["app": NSNull()] }
    var r: [String: Any] = ["app": appInfo(app), "title": focusedWindowTitle(app.processIdentifier), "playing": keepsDisplayAwake(app.processIdentifier)]
    if let bid = app.bundleIdentifier, let tab = activeTab(bid) {
      r["url"] = tab.url
      r["tabTitle"] = tab.title
    }
    return r

  case "apps":
    let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }.map(appInfo)
    return ["apps": apps]

  case "tabs":
    // Every tab of every running scriptable browser, for the sweep at Start (LOOP-04).
    var tabs: [[String: Any]] = []
    for bid in chromeFamily.union(safariFamily) where isRunning(bid) != nil {
      let titleProp = safariFamily.contains(bid) ? "name" : "title"
      let src = """
        tell application id \(appleScriptString(bid))
          set out to {}
          repeat with w in windows
            repeat with t in tabs of w
              set end of out to (URL of t) & (ASCII character 31) & (\(titleProp) of t)
            end repeat
          end repeat
          return out
        end tell
        """
      guard let d = try? runScript(src) else { continue }
      for item in strings(d) {
        let parts = item.components(separatedBy: "\u{1F}")
        tabs.append(["bundleId": bid, "url": parts.first ?? "", "title": parts.count > 1 ? parts[1] : ""])
      }
    }
    return ["tabs": tabs]

  case "closeTabs":
    // Closes every tab whose URL is in the list (Q-67: blocked tabs are closed).
    guard let bid = msg["bundleId"] as? String, let urls = msg["urls"] as? [String], !urls.isEmpty, isRunning(bid) != nil else { return ["closed": 0] }
    let list = "{" + urls.map(appleScriptString).joined(separator: ", ") + "}"
    let src = """
      tell application id \(appleScriptString(bid))
        set closed to 0
        set targets to \(list)
        repeat with w in windows
          set n to count of tabs of w
          repeat with i from n to 1 by -1
            if (URL of tab i of w) is in targets then
              close tab i of w
              set closed to closed + 1
            end if
          end repeat
        end repeat
        return closed
      end tell
      """
    do { return ["closed": Int(try runScript(src).int32Value)] } catch { return ["closed": 0, "error": error.localizedDescription] }

  case "closeFrontTab":
    // Browsers without Apple Events tabs (Firefox and others): Cmd+W to that app, only if its
    // focused window still shows the expected title. Needs Accessibility.
    guard let bid = msg["bundleId"] as? String, let app = isRunning(bid), let expect = msg["title"] as? String else { return ["closed": false] }
    guard focusedWindowTitle(app.processIdentifier) == expect else { return ["closed": false] }
    let src = CGEventSource(stateID: .hidSystemState)
    for down in [true, false] {
      let e = CGEvent(keyboardEventSource: src, virtualKey: 13, keyDown: down) // 13 = W
      e?.flags = .maskCommand
      e?.postToPid(app.processIdentifier)
    }
    return ["closed": true]

  case "quit", "hide":
    guard let bid = msg["bundleId"] as? String, let app = isRunning(bid) else { return ["done": false] }
    return ["done": cmd == "quit" ? app.terminate() : app.hide()]

  case "volume":
    // Q-63 music at 30%: Spotify and Music have their own volume (0-100).
    guard let bid = msg["bundleId"] as? String, isRunning(bid) != nil, let level = msg["level"] as? Int else { return ["previous": NSNull()] }
    let target = "application id \(appleScriptString(bid))"
    guard let prev = try? runScript("tell \(target) to get sound volume") else { return ["previous": NSNull()] }
    _ = try? runScript("tell \(target) to set sound volume to \(max(0, min(100, level)))")
    return ["previous": Int(prev.int32Value)]

  case "relaunch":
    relaunchOnExit = (msg["on"] as? Bool) ?? false
    return ["on": relaunchOnExit]

  default:
    return ["error": "unknown command \(cmd)"]
  }
}

// stdin → main thread (AppKit and NSAppleScript want the main thread) → stdout.
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
Thread.detachNewThread {
  while let line = readLine() {
    guard let data = line.data(using: .utf8), let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
    DispatchQueue.main.async {
      var reply = handle(msg)
      reply["id"] = msg["id"] ?? NSNull()
      if reply["ok"] == nil { reply["ok"] = reply["error"] == nil }
      out(reply)
    }
  }
  // The app closed our stdin: it quit or was killed. Reopen it if a session was locked.
  DispatchQueue.main.async {
    if relaunchOnExit, let path = appPath {
      Thread.sleep(forTimeInterval: 1.0) // let the old process finish exiting
      let p = Process()
      p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
      p.arguments = [path]
      try? p.run()
      p.waitUntilExit()
    }
    exit(0)
  }
}
app.run()
