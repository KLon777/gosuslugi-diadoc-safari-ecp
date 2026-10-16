// Рисует фон окна DMG: swift tools/dmg/background.swift OUT_DIR
// Создаёт background.png (1x) и background@2x.png (2x). Размер фона 660x600 pt (запас снизу под строку состояния Finder).
import AppKit

let W: CGFloat = 660, H: CGFloat = 600
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

// Координаты — от левого верхнего угла (как у иконок в dmgbuild).
func y(_ top: CGFloat) -> CGFloat { H - top }

func text(_ s: String, _ rect: NSRect, size: CGFloat, weight: NSFont.Weight = .regular,
          color: NSColor = NSColor(calibratedWhite: 0.15, alpha: 1), align: NSTextAlignment = .center) {
    let p = NSMutableParagraphStyle(); p.alignment = align; p.lineBreakMode = .byWordWrapping
    let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: weight),
                                                .foregroundColor: color, .paragraphStyle: p]
    NSAttributedString(string: s, attributes: attrs).draw(in: rect)
}

func render(scale: CGFloat, to path: String) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W * scale), pixelsHigh: Int(H * scale),
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: W, height: H)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // фон: мягкий градиент
    NSGradient(colors: [NSColor(calibratedRed: 0.97, green: 0.98, blue: 1.0, alpha: 1),
                        NSColor(calibratedRed: 0.89, green: 0.92, blue: 0.97, alpha: 1)])!
        .draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)

    // цветная полоса сверху
    NSColor(calibratedRed: 0.0, green: 0.4, blue: 0.85, alpha: 1).setFill()
    NSRect(x: 0, y: H - 6, width: W / 2, height: 6).fill()
    NSColor(calibratedRed: 0.93, green: 0.23, blue: 0.23, alpha: 1).setFill()
    NSRect(x: W / 2, y: H - 6, width: W / 2, height: 6).fill()

    text("ЭЦП в Safari", NSRect(x: 0, y: y(62), width: W, height: 36), size: 26, weight: .bold)
    text("Госуслуги, Диадок, ФНС и другие сайты по электронной подписи", NSRect(x: 0, y: y(88), width: W, height: 22),
         size: 14, color: NSColor(calibratedWhite: 0.35, alpha: 1))

    // подложки под иконки
    NSColor(calibratedWhite: 1, alpha: 0.55).setFill()
    NSBezierPath(roundedRect: NSRect(x: 70, y: y(500), width: 160, height: 392), xRadius: 18, yRadius: 18).fill()
    NSBezierPath(roundedRect: NSRect(x: 430, y: y(365), width: 160, height: 160), xRadius: 18, yRadius: 18).fill()

    // стрелка
    let accent = NSColor(calibratedRed: 0.0, green: 0.4, blue: 0.85, alpha: 0.85)
    accent.setStroke(); accent.setFill()
    let line = NSBezierPath()
    line.move(to: NSPoint(x: 252, y: y(285)))
    line.line(to: NSPoint(x: 400, y: y(285)))
    line.lineWidth = 4; line.lineCapStyle = .round
    let dash: [CGFloat] = [10, 8]
    line.setLineDash(dash, count: 2, phase: 0)
    line.stroke()
    let head = NSBezierPath()
    head.move(to: NSPoint(x: 414, y: y(285)))
    head.line(to: NSPoint(x: 396, y: y(274)))
    head.line(to: NSPoint(x: 396, y: y(296)))
    head.close(); head.fill()
    text("Перетащите\nв «Программы»", NSRect(x: 252, y: y(267), width: 150, height: 40), size: 13,
         weight: .semibold, color: accent)

    // подсказка внизу
    text("Затем запустите нужные приложения. Чтобы Safari загружал расширение, подпишите его своим "
         + "сертификатом Apple Development или включите «Разработка → Разрешить неподписанные расширения». "
         + "Инструкция: github.com/KLon777/gosuslugi-diadoc-safari-ecp",
         NSRect(x: 40, y: y(570), width: W - 80, height: 56), size: 11.5,
         color: NSColor(calibratedWhite: 0.3, alpha: 1))

    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

render(scale: 1, to: out + "/background.png")
render(scale: 2, to: out + "/background@2x.png")
print("ok")
