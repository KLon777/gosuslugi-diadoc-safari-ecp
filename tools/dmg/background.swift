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

    // подложки: автоматическая установка и ручная
    NSColor(calibratedWhite: 1, alpha: 0.6).setFill()
    NSBezierPath(roundedRect: NSRect(x: 40, y: y(292), width: W - 80, height: 180), xRadius: 18, yRadius: 18).fill()
    NSColor(calibratedWhite: 1, alpha: 0.4).setFill()
    NSBezierPath(roundedRect: NSRect(x: 40, y: y(530), width: W - 80, height: 222), xRadius: 18, yRadius: 18).fill()

    let accent = NSColor(calibratedRed: 0.0, green: 0.4, blue: 0.85, alpha: 1)
    let ink = NSColor(calibratedWhite: 0.2, alpha: 1), muted = NSColor(calibratedWhite: 0.38, alpha: 1)
    text("Автоматическая установка", NSRect(x: 245, y: y(152), width: 360, height: 24), size: 17, weight: .bold,
         color: accent, align: .left)
    text("Дважды щёлкните «Установка ЭЦП в Safari». Мастер установит все или только выбранные приложения, "
         + "поможет подписать их вашим сертификатом и подскажет, что включить в Safari.",
         NSRect(x: 245, y: y(236), width: 355, height: 80), size: 13, color: ink, align: .left)
    text("Если macOS не даёт открыть: правый щелчок → «Открыть».",
         NSRect(x: 245, y: y(270), width: 355, height: 34), size: 11.5, color: muted, align: .left)

    text("Или вручную: перетащите нужные приложения в «Программы»", NSRect(x: 60, y: y(336), width: W - 120, height: 22),
         size: 14, weight: .semibold, color: ink)

    // стрелка к «Программам»
    accent.withAlphaComponent(0.85).setStroke(); accent.withAlphaComponent(0.85).setFill()
    let line = NSBezierPath()
    line.move(to: NSPoint(x: 400, y: y(425)))
    line.line(to: NSPoint(x: 470, y: y(425)))
    line.lineWidth = 4; line.lineCapStyle = .round
    let dash: [CGFloat] = [9, 7]
    line.setLineDash(dash, count: 2, phase: 0)
    line.stroke()
    let head = NSBezierPath()
    head.move(to: NSPoint(x: 484, y: y(425)))
    head.line(to: NSPoint(x: 466, y: y(414)))
    head.line(to: NSPoint(x: 466, y: y(436)))
    head.close(); head.fill()

    // подсказка внизу
    text("При ручной установке подпишите приложения сами или включите «Разработка → Разрешить неподписанные "
         + "расширения». Инструкция: github.com/KLon777/gosuslugi-diadoc-safari-ecp",
         NSRect(x: 30, y: y(592), width: W - 60, height: 50), size: 11, color: muted)

    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

render(scale: 1, to: out + "/background.png")
render(scale: 2, to: out + "/background@2x.png")
print("ok")
