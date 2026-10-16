//
//  AppDelegate.swift — CryptoPro Safari
//
//  Приложение работает в двух режимах:
//   * обычный запуск — окно с состоянием и установка фонового моста в автозапуск;
//   * запуск с аргументом --bridge (его делает launchd) — фоновый мост без окна.
//
//  Мост: HTTP на 127.0.0.1:9107. Принимает запросы от модуля Safari-расширения
//  и передаёт их официальному плагину по протоколу Chrome Native Messaging (stdio).
//

import Cocoa
import Network

enum NMAConfig {
    static let appName = "CryptoPro Safari"
    static let pluginName = "КриптоПро ЭЦП Browser plug-in"
    static let port: UInt16 = 9107
    static let allowedHosts: Set<String> = ["ru.cryptopro.nmcades"]
    static let mainHost = "ru.cryptopro.nmcades"
    static let nmhDirs = [
        "/Library/Google/Chrome/NativeMessagingHosts",
        NSHomeDirectory() + "/Library/Application Support/Google/Chrome/NativeMessagingHosts",
    ]
    static var bundleID: String { Bundle.main.bundleIdentifier ?? "local.safaricrypto" }
    static var extensionID: String { bundleID + ".Extension" }
    static var agentLabel: String { bundleID + ".bridge" }
    static var isBridgeMode: Bool { CommandLine.arguments.contains("--bridge") }

    static func hostManifest(_ name: String) -> [String: Any]? {
        for dir in nmhDirs {
            let url = URL(fileURLWithPath: dir).appendingPathComponent(name + ".json")
            if let data = try? Data(contentsOf: url),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return obj
            }
        }
        return nil
    }
}

/// Точка входа. В режиме моста приложение стартует без storyboard и окна (быстро и легко
/// при входе в систему); в обычном режиме — как обычное приложение с окном.
@main
enum NMAMain {
    static func main() {
        if NMAConfig.isBridgeMode {
            let app = NSApplication.shared
            let delegate = AppDelegate()
            app.delegate = delegate
            app.setActivationPolicy(.accessory)
            withExtendedLifetime(delegate) { app.run() }
        } else {
            _ = NSApplicationMain(CommandLine.argc, CommandLine.unsafeArgv)
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationWillFinishLaunching(_ notification: Notification) {
        if NMAConfig.isBridgeMode {
            // без значка в Dock, но окно показать можно (см. applicationShouldHandleReopen)
            NSApp.setActivationPolicy(.accessory)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        signal(SIGPIPE, SIG_IGN)
        if NMAConfig.isBridgeMode {
            NMAAgent.refreshPlistIfNeeded()
            do {
                try NMABridge.shared.start()
            } catch {
                NSLog("NMA bridge: не удалось запуститься: \(error)")
                exit(1)
            }
        } else {
            NMAAgent.install()
        }
    }

    /// Если мост уже работает, повторный запуск приложения из Finder приходит сюда —
    /// в процесс моста. Показываем окно состояния из него же.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if NMAConfig.isBridgeMode && !flag {
            showWindow()
            return false
        }
        return true
    }

    private var windowController: NSWindowController?

    /// В режиме моста приложение запускается без storyboard, а значит и без строки меню —
    /// тогда Cmd+W/Cmd+Q некуда отправить. Ставим минимальное меню перед показом окна.
    /// Cmd+Q здесь закрывает только окно: процесс — это мост, он должен продолжать работать.
    private func installBridgeMenu() {
        guard NSApp.mainMenu == nil || NSApp.mainMenu?.items.isEmpty == true else { return }
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: NMAConfig.appName)
        appMenu.addItem(withTitle: "Закрыть окно", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Правка")
        editMenu.addItem(withTitle: "Копировать", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Выбрать все", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        main.addItem(editItem)

        let winItem = NSMenuItem()
        let winMenu = NSMenu(title: "Окно")
        winMenu.addItem(withTitle: "Закрыть", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = winMenu
        main.addItem(winItem)
        NSApp.windowsMenu = winMenu

        NSApp.mainMenu = main
    }

    private func showWindow() {
        installBridgeMenu()
        NSApp.setActivationPolicy(.regular)
        if windowController == nil {
            windowController = NSStoryboard(name: "Main", bundle: nil).instantiateInitialController() as? NSWindowController
            NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification,
                                                   object: windowController?.window, queue: .main) { [weak self] _ in
                self?.windowController = nil
                NSApp.setActivationPolicy(.accessory)
            }
        }
        windowController?.showWindow(nil)
        windowController?.window?.center()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return !NMAConfig.isBridgeMode
    }
}

// MARK: - Автозапуск моста (LaunchAgent)

enum NMAAgent {
    static var plistURL: URL {
        URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/LaunchAgents/\(NMAConfig.agentLabel).plist")
    }

    static var logPath: String { NSHomeDirectory() + "/Library/Logs/\(NMAConfig.appName) bridge.log" }

    @discardableResult
    static func launchctl(_ args: [String]) -> Int32 {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        p.arguments = args
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        do { try p.run(); p.waitUntilExit(); return p.terminationStatus } catch { return -1 }
    }

    static func wantedPlist() -> [String: Any]? {
        guard let exe = Bundle.main.executablePath else { return nil }
        return [
            "Label": NMAConfig.agentLabel,
            "ProgramArguments": [exe, "--bridge"],
            "RunAtLoad": true,
            "KeepAlive": true,
            "ProcessType": "Interactive",
            "StandardErrorPath": logPath,
        ]
    }

    /// Вызывается из процесса моста: если после обновления приложения настройки автозапуска
    /// устарели, переписывает файл (вступит в силу при следующем входе), не перезапуская себя.
    static func refreshPlistIfNeeded() {
        guard let wanted = wantedPlist(), let current = NSDictionary(contentsOf: plistURL),
              !current.isEqual(to: wanted) else { return }
        (wanted as NSDictionary).write(to: plistURL, atomically: true)
    }

    /// Ставит (или обновляет) LaunchAgent, который держит запущенным `<это приложение> --bridge`.
    static func install() {
        guard let wanted = wantedPlist() else { return }
        let domain = "gui/\(getuid())"
        let current = NSDictionary(contentsOf: plistURL)
        let loaded = launchctl(["print", "\(domain)/\(NMAConfig.agentLabel)"]) == 0
        if let current = current, current.isEqual(to: wanted), loaded { return }

        try? FileManager.default.createDirectory(at: plistURL.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        (wanted as NSDictionary).write(to: plistURL, atomically: true)
        launchctl(["bootout", "\(domain)/\(NMAConfig.agentLabel)"])
        launchctl(["enable", "\(domain)/\(NMAConfig.agentLabel)"])
        launchctl(["bootstrap", domain, plistURL.path])
    }

    /// Убирает мост из автозапуска.
    static func uninstall() {
        launchctl(["bootout", "gui/\(getuid())/\(NMAConfig.agentLabel)"])
        try? FileManager.default.removeItem(at: plistURL)
    }
}

// MARK: - Сессия с native host плагина

enum NMAError: Error { case message(String) }

final class NMASession {
    let id = UUID().uuidString
    let host: String
    private let proc = Process()
    private let stdinPipe = Pipe()
    private let stdoutPipe = Pipe()
    private let cond = NSCondition()
    private var msgs: [Any] = []
    private(set) var closed = false
    var touched = Date()

    init(host: String) throws {
        self.host = host
        guard let man = NMAConfig.hostManifest(host), let path = man["path"] as? String else {
            throw NMAError.message("native host not installed: \(host)")
        }
        let caller = (man["allowed_origins"] as? [String])?.first ?? "chrome-extension://unknown/"
        let exe = URL(fileURLWithPath: path)
        proc.executableURL = exe
        proc.arguments = [caller]
        proc.currentDirectoryURL = exe.deletingLastPathComponent()
        proc.standardInput = stdinPipe
        proc.standardOutput = stdoutPipe
        proc.standardError = FileHandle.nullDevice
        try proc.run()
        let t = Thread { [self] in self.readLoop() }
        t.start()
    }

    private func readExactly(_ h: FileHandle, _ n: Int) -> Data? {
        var d = Data()
        while d.count < n {
            guard let chunk = try? h.read(upToCount: n - d.count), !chunk.isEmpty else { return nil }
            d.append(chunk)
        }
        return d
    }

    private func readLoop() {
        let h = stdoutPipe.fileHandleForReading
        while true {
            guard let lenData = readExactly(h, 4) else { break }
            let b = [UInt8](lenData)
            let n = Int(UInt32(b[0]) | UInt32(b[1]) << 8 | UInt32(b[2]) << 16 | UInt32(b[3]) << 24)
            guard let body = readExactly(h, n) else { break }
            let obj = (try? JSONSerialization.jsonObject(with: body, options: [.fragmentsAllowed]))
                ?? ["__raw": String(decoding: body, as: UTF8.self)]
            cond.lock(); msgs.append(obj); cond.broadcast(); cond.unlock()
        }
        cond.lock(); closed = true; cond.broadcast(); cond.unlock()
    }

    func send(_ text: String) throws {
        touched = Date()
        let body = Data(text.utf8)
        let n = UInt32(body.count)
        var frame = Data([UInt8(n & 0xff), UInt8((n >> 8) & 0xff), UInt8((n >> 16) & 0xff), UInt8(n >> 24)])
        frame.append(body)
        try stdinPipe.fileHandleForWriting.write(contentsOf: frame)
    }

    func take(wait: TimeInterval) -> ([Any], Bool) {
        touched = Date()
        cond.lock()
        if msgs.isEmpty && !closed && wait > 0 {
            _ = cond.wait(until: Date().addingTimeInterval(wait))
        }
        // ответ может прийти несколькими сообщениями подряд — даём им 30 мс собраться
        if !msgs.isEmpty && !closed {
            var count = msgs.count
            while cond.wait(until: Date().addingTimeInterval(0.03)), msgs.count > count, !closed {
                count = msgs.count
            }
        }
        let out = msgs
        msgs = []
        let c = closed
        cond.unlock()
        return (out, c)
    }

    func close() {
        if proc.isRunning { proc.terminate() }
        cond.lock(); closed = true; cond.broadcast(); cond.unlock()
    }
}

// MARK: - HTTP-мост на 127.0.0.1
//
// API (POST /h, JSON, обязателен заголовок X-NMA: 1, заголовка Origin быть не должно):
//   {op:"open",  host}            -> {sid}
//   {op:"send",  sid, data, wait} -> {ok, msgs, closed}
//   {op:"poll",  sid, wait}       -> {msgs, closed}
//   {op:"close", sid}             -> {ok}
//   {op:"ping"}                   -> {ok, plugin}
//
// Почему это безопасно: страница в браузере не может отправить запрос с нестандартным
// заголовком X-NMA без CORS-preflight, а preflight (OPTIONS) мост отклоняет; к тому же
// браузер всегда добавляет Origin, а такие запросы мост тоже отклоняет.

final class NMABridge {
    static let shared = NMABridge()
    private var listener: NWListener?
    private var sessions: [String: NMASession] = [:]
    private let lock = NSLock()
    private let maxBody = 64 * 1024 * 1024

    func start() throws {
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: NMAConfig.port)!)
        let l = try NWListener(using: params)
        l.stateUpdateHandler = { state in
            switch state {
            case .ready: NSLog("NMA bridge: слушаю 127.0.0.1:\(NMAConfig.port)")
            case .failed(let e): NSLog("NMA bridge: ошибка listener: \(e)"); exit(1)
            default: break
            }
        }
        l.newConnectionHandler = { [weak self] c in self?.accept(c) }
        l.start(queue: DispatchQueue(label: "nma.listener"))
        listener = l

        exeDate = executableDate()
        Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in self?.reap() }
    }

    private var exeDate: Date?

    private func executableDate() -> Date? {
        guard let path = Bundle.main.executablePath else { return nil }
        return (try? FileManager.default.attributesOfItem(atPath: path))?[.modificationDate] as? Date
    }

    /// Приложение удалили — убираем мост из автозапуска; обновили — перезапускаемся
    /// (launchd поднимет новую версию).
    private func checkSelf(idle: Bool) {
        guard let path = Bundle.main.executablePath else { return }
        if !FileManager.default.fileExists(atPath: path) {
            NSLog("NMA bridge: приложение удалено, убираю мост из автозапуска")
            NMAAgent.uninstall()
            exit(0)
        }
        if idle, let d = exeDate, executableDate() != d {
            NSLog("NMA bridge: приложение обновлено, перезапускаюсь")
            exit(0)
        }
    }

    private func reap() {
        let now = Date()
        lock.lock()
        // Safari периодически перезапускает фоновую часть расширения, и старые соединения остаются
        // без хозяина — закрываем всё, чем не пользовались 2 минуты (при нужде откроется заново).
        for (sid, s) in sessions where now.timeIntervalSince(s.touched) > 120 || (s.closed && now.timeIntervalSince(s.touched) > 30) {
            s.close()
            sessions.removeValue(forKey: sid)
        }
        let idle = sessions.isEmpty
        lock.unlock()
        checkSelf(idle: idle)
    }

    private func session(_ sid: Any?) -> NMASession? {
        guard let sid = sid as? String else { return nil }
        lock.lock(); defer { lock.unlock() }
        return sessions[sid]
    }

    private func api(_ req: [String: Any]) -> [String: Any] {
        let op = req["op"] as? String ?? ""
        switch op {
        case "ping":
            return ["ok": true, "plugin": NMAConfig.hostManifest(NMAConfig.mainHost) != nil]
        case "diag":
            NSLog("NMA ext: \(String(describing: req["text"] ?? "").prefix(200))")
            return ["ok": true]
        case "open":
            guard let host = req["host"] as? String, NMAConfig.allowedHosts.contains(host) else {
                return ["error": "host not allowed"]
            }
            do {
                let s = try NMASession(host: host)
                lock.lock(); sessions[s.id] = s; lock.unlock()
                return ["sid": s.id]
            } catch NMAError.message(let m) {
                return ["error": m]
            } catch {
                return ["error": "\(error)"]
            }
        default: break
        }
        guard let s = session(req["sid"]) else { return ["error": "no session", "closed": true, "msgs": []] }
        let wait = min((req["wait"] as? Double) ?? 0, 25)
        switch op {
        case "send":
            if s.closed { return ["error": "closed", "closed": true, "msgs": s.take(wait: 0).0] }
            do { try s.send(req["data"] as? String ?? "") } catch { return ["error": "write failed", "closed": true, "msgs": []] }
            let (m, c) = s.take(wait: wait)
            return ["ok": true, "msgs": m, "closed": c]
        case "poll":
            let (m, c) = s.take(wait: wait > 0 ? wait : 2)
            return ["msgs": m, "closed": c]
        case "close":
            s.close()
            lock.lock(); sessions.removeValue(forKey: s.id); lock.unlock()
            return ["ok": true]
        default:
            return ["error": "bad op"]
        }
    }

    // --- минимальный HTTP/1.1

    private func accept(_ c: NWConnection) {
        c.start(queue: DispatchQueue.global())
        receive(c, Data())
    }

    private func receive(_ c: NWConnection, _ buffer: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, done, err in
            guard let self = self else { return }
            var buf = buffer
            if let data = data { buf.append(data) }
            switch self.parse(buf) {
            case .complete(let method, let path, let headers, let body):
                DispatchQueue.global().async { self.handle(c, method, path, headers, body) }
            case .incomplete where !done && err == nil && buf.count <= self.maxBody + 65536:
                self.receive(c, buf)
            default:
                c.cancel()
            }
        }
    }

    private enum Parsed { case incomplete, bad, complete(String, String, [String: String], Data) }

    private func parse(_ buf: Data) -> Parsed {
        guard let sep = buf.range(of: Data("\r\n\r\n".utf8)) else {
            return buf.count > 65536 ? .bad : .incomplete
        }
        let head = String(decoding: buf[buf.startIndex..<sep.lowerBound], as: UTF8.self)
        var lines = head.components(separatedBy: "\r\n")
        let first = lines.removeFirst().split(separator: " ")
        guard first.count >= 2 else { return .bad }
        var headers: [String: String] = [:]
        for l in lines {
            if let i = l.firstIndex(of: ":") {
                headers[l[..<i].trimmingCharacters(in: .whitespaces).lowercased()] =
                    l[l.index(after: i)...].trimmingCharacters(in: .whitespaces)
            }
        }
        let len = Int(headers["content-length"] ?? "0") ?? 0
        if len > maxBody { return .bad }
        let body = buf[sep.upperBound...]
        if body.count < len { return .incomplete }
        return .complete(String(first[0]), String(first[1]), headers, Data(body.prefix(len)))
    }

    private func handle(_ c: NWConnection, _ method: String, _ path: String, _ h: [String: String], _ body: Data) {
        guard method == "POST", path.split(separator: "?").first == "/h",
              h["x-nma"] == "1", h["origin"] == nil else {
            NSLog("NMA bridge: отклонён запрос \(method) \(path.prefix(40)) origin=\(h["origin"] ?? "-")")
            respond(c, 403, ["error": "forbidden"])
            return
        }
        guard let req = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] else {
            respond(c, 400, ["error": "bad json"])
            return
        }
        respond(c, 200, api(req))
    }

    private func respond(_ c: NWConnection, _ code: Int, _ obj: [String: Any]) {
        let body = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{}".utf8)
        var resp = Data("HTTP/1.1 \(code) X\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".utf8)
        resp.append(body)
        c.send(content: resp, completion: .contentProcessed { _ in c.cancel() })
    }
}
