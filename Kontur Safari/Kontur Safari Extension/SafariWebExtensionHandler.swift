//
//  SafariWebExtensionHandler.swift — Kontur Safari Extension
//
//  Модуль Safari-расширения. Safari не пускает JS расширений на localhost,
//  поэтому JS шлёт сюда browser.runtime.sendNativeMessage, а модуль
//  пересылает запрос во встроенный мост приложения на 127.0.0.1:9106.
//

import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    static let endpoint = URL(string: "http://127.0.0.1:9106/h")!
    /// Замеры времени в nma_diag.log: включаются файлом nma_timing в контейнере расширения.
    static let timing = FileManager.default.fileExists(atPath: NSHomeDirectory() + "/nma_timing")

    private func log(_ s: String) {
        let line = "\(Date()) \(s)\n"
        let url = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("nma_diag.log")
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile(); h.write(Data(line.utf8)); h.closeFile()
        } else {
            try? line.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private func callBridge(_ body: [String: Any], timeout: TimeInterval) -> [String: Any] {
        var req = URLRequest(url: Self.endpoint, timeoutInterval: timeout)
        req.httpMethod = "POST"
        req.setValue("1", forHTTPHeaderField: "X-NMA")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        let sem = DispatchSemaphore(value: 0)
        var result: [String: Any] = ["error": "bridge timeout"]
        URLSession.shared.dataTask(with: req) { data, _, err in
            if let err = err {
                result = ["error": "мост не отвечает (откройте приложение Kontur Safari): \(err.localizedDescription)"]
            } else if let data = data, let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                result = obj
            } else {
                result = ["error": "bad bridge response"]
            }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + timeout + 2)
        return result
    }

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey]
        var reply: [String: Any] = ["error": "bad message"]

        if let dict = message as? [String: Any] {
            if let d = dict["diag"] {
                log("js: \(d)")
                reply = ["ok": true]
            } else if let op = dict["op"] as? String {
                let wait = (dict["wait"] as? Double) ?? 0
                let started = Date()
                reply = callBridge(dict, timeout: max(10, wait + 10))
                if let e = reply["error"], op != "poll" { log("op \(op): \(e)") }
                if Self.timing {
                    let n = (reply["msgs"] as? [Any])?.count ?? 0
                    let t0 = started.timeIntervalSince1970, t1 = Date().timeIntervalSince1970
                    log("t \(op) wait=\(wait) msgs=\(n) start=\(String(format: "%.3f", t0)) end=\(String(format: "%.3f", t1)) \(Int((t1 - t0) * 1000))ms")
                }
            }
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
