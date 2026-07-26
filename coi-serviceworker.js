/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT
    https://github.com/gzuidhof/coi-serviceworker
    This is what makes video export work once this app is hosted on GitHub
    Pages (or any static host that can't set custom response headers): it
    intercepts every request through a Service Worker and adds the two
    headers (Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy) the
    browser requires before it will allow SharedArrayBuffer, which the video
    converter (ffmpeg.wasm) depends on.

    This file must be uploaded to the SAME repository/folder as index.html —
    it does nothing by itself, index.html loads it automatically. It also
    only works once the page is actually hosted at a real https:// address;
    it cannot do anything for a file opened directly from Downloads/Files. */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (!ev.data) {
      return;
    } else if (ev.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.navigate(client.url));
        });
    } else if (ev.data.type === "coepCredentialless") {
      coepCredentialless = ev.data.value;
    }
  });

  self.addEventListener("fetch", function (event) {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
      return;
    }

    const request = (coepCredentialless && r.mode === "no-cors")
      ? new Request(r, { credentials: "omit" })
      : r;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp"
          );
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");
    const coepDegrading = (reloadedBySelf === "coepdegrade");

    const coi = {
      shouldRegister: () => true,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => window.location.reload(),
      quiet: false,
      ...window.coi
    };

    const n = navigator;

    if (n.serviceWorker && n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({
        type: "coepCredentialless",
        value: coepDegrading ? false : coi.coepCredentialless(),
      });

      if (coi.shouldDeregister()) {
        n.serviceWorker.controller.postMessage({ type: "deregister" });
      }
    }

    if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

    if (!window.isSecureContext) {
      !coi.quiet && console.log("COOP/COEP Service Worker not registered: this page needs to be loaded over https:// (or localhost) for this to work.");
      return;
    }

    if (n.serviceWorker) {
      n.serviceWorker.register(window.document.currentScript.src).then(
        (registration) => {
          !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

          registration.addEventListener("updatefound", () => {
            !coi.quiet && console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
            window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
            coi.doReload();
          });

          if (registration.active && !n.serviceWorker.controller) {
            !coi.quiet && console.log("Reloading page to make use of COOP/COEP Service Worker.");
            window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolled");
            coi.doReload();
          }
        },
        (err) => {
          !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
        }
      );
    }
  })();
}
