import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Shopping", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = ShoppingViewController()
        self.window = window
        window.makeKeyAndVisible()
    }
}

final class ShoppingViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let home = URL(string: "https://yushui2022.github.io/Margin-X-Ray/#shop")!
    private let browser = WKWebView()
    private let paper = UIColor(red: 0.98, green: 0.96, blue: 0.93, alpha: 1)
    private var showingError = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = paper
        overrideUserInterfaceStyle = .light
        browser.isOpaque = false
        browser.backgroundColor = paper
        browser.scrollView.backgroundColor = paper
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.allowsBackForwardNavigationGestures = true
        #if DEBUG
        if #available(iOS 16.4, *) { browser.isInspectable = true }
        #endif
        browser.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(browser)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: safe.topAnchor),
            browser.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            browser.bottomAnchor.constraint(equalTo: safe.bottomAnchor)
        ])
        browser.load(URLRequest(url: home))
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame?.isMainFrame != false,
              let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if url.scheme == "https", url.host == home.host, url.pathComponents.starts(with: home.pathComponents) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated, ["https", "http"].contains(url.scheme) {
                UIApplication.shared.open(url)
            }
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled, !showingError, view.window != nil else { return }
        showingError = true
        let alert = UIAlertController(
            title: NSLocalizedString("connection.error.title", comment: "Network error title"),
            message: NSLocalizedString("connection.error.message", comment: "Network error explanation"),
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: NSLocalizedString("connection.retry", comment: "Try loading again"), style: .default) { [weak self] _ in
            guard let self else { return }
            self.showingError = false
            self.browser.load(URLRequest(url: self.browser.url ?? self.home))
        })
        present(alert, animated: true)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}
