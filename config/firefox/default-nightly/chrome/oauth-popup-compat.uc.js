// Preserve the opener channel used by popup OAuth on login documents whose
// server policy would otherwise isolate the provider popup.
(() => {
  const observer = {
    observe(subject) {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      const uri = channel.URI;

      if (
        channel.loadInfo.externalContentPolicyType !== Ci.nsIContentPolicy.TYPE_DOCUMENT ||
        uri.scheme !== "https" ||
        uri.host !== "claude.ai" ||
        !uri.pathQueryRef.startsWith("/login")
      ) {
        return;
      }

      channel.setResponseHeader(
        "Cross-Origin-Opener-Policy",
        "same-origin-allow-popups",
        false,
      );
    },
  };

  Services.obs.addObserver(observer, "http-on-examine-response");
  window.addEventListener(
    "unload",
    () => Services.obs.removeObserver(observer, "http-on-examine-response"),
    { once: true },
  );
})();
