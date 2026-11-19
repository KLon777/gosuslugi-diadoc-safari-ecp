// Значок мастера установки: swift tools/dmg/installer_icon.swift OUT.icns
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "installer.icns"
let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("nma-installer.iconset")
try? FileManager.default.removeItem(at: tmp)
try! FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    let S = CGFloat(px)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    // плитка в сетке значков macOS: 824/1024 с тенью
    let inset = S * 100 / 1024, side = S - 2 * inset
    let tile = NSRect(x: inset, y: inset * 1.15, width: side, height: side)
    let path = NSBezierPath(roundedRect: tile, xRadius: side * 0.225, yRadius: side * 0.225)
    let shadow = NSShadow(); shadow.shadowColor = NSColor(white: 0, alpha: 0.3)
    shadow.shadowBlurRadius = S * 0.02; shadow.shadowOffset = NSSize(width: 0, height: -S * 0.01)
    NSGraphicsContext.saveGraphicsState(); shadow.set()
    NSColor.white.setFill(); path.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.saveGraphicsState(); path.addClip()
    NSGradient(colors: [NSColor(calibratedRed: 0.0, green: 0.42, blue: 0.88, alpha: 1),
                        NSColor(calibratedRed: 0.36, green: 0.30, blue: 0.80, alpha: 1),
                        NSColor(calibratedRed: 0.93, green: 0.25, blue: 0.27, alpha: 1)])!.draw(in: tile, angle: -45)
    NSGraphicsContext.restoreGraphicsState()
    // надпись «ЭЦП»
    let p = NSMutableParagraphStyle(); p.alignment = .center
    let font = NSFont.systemFont(ofSize: side * 0.27, weight: .heavy)
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: p]
    NSAttributedString(string: "ЭЦП", attributes: attrs)
        .draw(in: NSRect(x: tile.minX, y: tile.minY + side * 0.50, width: side, height: side * 0.36))
    // стрелка «установить» вниз в лоток
    NSColor.white.setStroke(); NSColor.white.setFill()
    let cx = tile.midX, lw = side * 0.06
    let shaft = NSBezierPath(); shaft.lineWidth = lw; shaft.lineCapStyle = .round
    shaft.move(to: NSPoint(x: cx, y: tile.minY + side * 0.47)); shaft.line(to: NSPoint(x: cx, y: tile.minY + side * 0.27)); shaft.stroke()
    let head = NSBezierPath()
    head.move(to: NSPoint(x: cx - side * 0.11, y: tile.minY + side * 0.31))
    head.line(to: NSPoint(x: cx, y: tile.minY + side * 0.19))
    head.line(to: NSPoint(x: cx + side * 0.11, y: tile.minY + side * 0.31))
    head.lineWidth = lw; head.lineCapStyle = .round; head.lineJoinStyle = .round; head.stroke()
    let tray = NSBezierPath(); tray.lineWidth = lw; tray.lineCapStyle = .round; tray.lineJoinStyle = .round
    tray.move(to: NSPoint(x: cx - side * 0.24, y: tile.minY + side * 0.22))
    tray.line(to: NSPoint(x: cx - side * 0.24, y: tile.minY + side * 0.11))
    tray.line(to: NSPoint(x: cx + side * 0.24, y: tile.minY + side * 0.11))
    tray.line(to: NSPoint(x: cx + side * 0.24, y: tile.minY + side * 0.22))
    tray.stroke()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for (name, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128),
                   ("128x128@2x", 256), ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    try! render(px).write(to: tmp.appendingPathComponent("icon_\(name).png"))
}
let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
p.arguments = ["-c", "icns", tmp.path, "-o", out]; try! p.run(); p.waitUntilExit()
try? FileManager.default.removeItem(at: tmp)
print(p.terminationStatus == 0 ? "ok" : "iconutil failed")
