// Stand-in for https://accounts.google.com/gsi/client in tests: a button that asks the test server for a
// signed ID token (as Google's popup would) and hands it to the page's callback.
(function () {
  let cb = null, opts = null
  window.google = {
    accounts: {
      id: {
        initialize(o) { opts = o; cb = o.callback; window.__gsiInit = (window.__gsiInit || 0) + 1 },
        renderButton(el) {
          el.innerHTML = ""
          const b = document.createElement("button")
          b.type = "button"
          b.textContent = "Continue with Google (test)"
          b.onclick = async () => {
            const sub = window.__gsub || localStorage.getItem("__gsub") || "user-1"
            const r = await fetch("/__google/token?sub=" + encodeURIComponent(sub) + "&aud=" + encodeURIComponent(opts.client_id))
            const { credential } = await r.json()
            cb && cb({ credential, select_by: "btn" })
          }
          el.appendChild(b)
        },
        disableAutoSelect() {},
        prompt() {},
      },
    },
  }
})()
