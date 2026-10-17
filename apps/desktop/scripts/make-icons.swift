#!/usr/bin/env swift
// Renders the macOS app icon and the menu-bar (tray) icon from their SVG sources in build/.
// macOS only. Run after editing build/icon.svg or build/trayTemplate.svg:
//   swift scripts/make-icons.swift
// The Windows build/icon.ico is not made here.
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let build = root.appendingPathComponent("build")
let resources = root.appendingPathComponent("resources")

func render(_ svg: URL, size: Int, to out: URL) {
  guard let image = NSImage(contentsOf: svg) else { fatalError("cannot read \(svg.path)") }
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: out)
}

let appIcon = build.appendingPathComponent("icon.svg")
render(appIcon, size: 1024, to: build.appendingPathComponent("icon.png"))
render(appIcon, size: 512, to: resources.appendingPathComponent("icon.png"))

let iconset = FileManager.default.temporaryDirectory.appendingPathComponent("icon.iconset")
try? FileManager.default.removeItem(at: iconset)
try! FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
  render(appIcon, size: base, to: iconset.appendingPathComponent("icon_\(base)x\(base).png"))
  render(appIcon, size: base * 2, to: iconset.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
let iconutil = Process()
iconutil.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
iconutil.arguments = ["-c", "icns", iconset.path, "-o", build.appendingPathComponent("icon.icns").path]
try! iconutil.run()
iconutil.waitUntilExit()
guard iconutil.terminationStatus == 0 else { fatalError("iconutil failed") }

// Template images: only the alpha channel counts, so the background must stay transparent.
let tray = build.appendingPathComponent("trayTemplate.svg")
render(tray, size: 18, to: resources.appendingPathComponent("trayTemplate.png"))
render(tray, size: 36, to: resources.appendingPathComponent("trayTemplate@2x.png"))
