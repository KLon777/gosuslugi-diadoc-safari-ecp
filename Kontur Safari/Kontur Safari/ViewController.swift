//
//  ViewController.swift — Kontur Safari
//
//  Окно состояния: включено ли расширение в Safari, работает ли мост, установлен ли плагин.
//

import Cocoa
import SafariServices
import WebKit

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")
        webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!,
                            allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refresh()
    }

    private func js(_ code: String) {
        DispatchQueue.main.async { self.webView.evaluateJavaScript(code) }
    }

    private func refresh() {
        let plugin = NMAConfig.hostManifest(NMAConfig.mainHost) != nil
        js("setStatus('plugin', \(plugin))")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: NMAConfig.extensionID) { state, error in
            let value = (state != nil && error == nil) ? (state!.isEnabled ? "true" : "false") : "null"
            self.js("setStatus('extension', \(value))")
        }

        // Мост мог только что запуститься — даём ему пару попыток.
        pingBridge(attempts: 5)
    }

    private func pingBridge(attempts: Int) {
        var req = URLRequest(url: URL(string: "http://127.0.0.1:\(NMAConfig.port)/h")!, timeoutInterval: 2)
        req.httpMethod = "POST"
        req.setValue("1", forHTTPHeaderField: "X-NMA")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data(#"{"op":"ping"}"#.utf8)
        URLSession.shared.dataTask(with: req) { data, _, _ in
            let ok = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["ok"] as? Bool ?? false
            if !ok && attempts > 1 {
                DispatchQueue.global().asyncAfter(deadline: .now() + 1) { self.pingBridge(attempts: attempts - 1) }
            } else {
                self.js("setStatus('bridge', \(ok))")
            }
        }.resume()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.body as? String {
        case "open-preferences":
            SFSafariApplication.showPreferencesForExtension(withIdentifier: NMAConfig.extensionID) { _ in }
        case "refresh":
            refresh()
        case "uninstall":
            NMAAgent.uninstall()
            js("setStatus('bridge', false)")
        default:
            break
        }
    }
}
