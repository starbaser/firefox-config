// ==UserScript==
// @name            keymaps
// @author          starbased
// @include         main
// @startup         UC.keymaps.exec(win);
// @shutdown        UC.keymaps.destroy();
// @onlyonce
// ==/UserScript==

UC.keymaps = {
  exec: function (win) {
    if (win.location.href !== _uc.BROWSERCHROME) return;

    const { document } = win;

    if (document.readyState !== "complete") {
      win.addEventListener("load", () => this.loadCustomKeyset(win), { once: true });
    } else {
      this.loadCustomKeyset(win);
    }
  },

  loadCustomKeyset: function (win) {
    const { document } = win;

    try {
      const keysetFile = _uc.chromedir.clone();
      keysetFile.append("keyset.html");

      if (!keysetFile.exists()) {
        console.error("[keymaps] keyset.html not found at:", keysetFile.path);
        return;
      }

      const fstream = Cc["@mozilla.org/network/file-input-stream;1"]
        .createInstance(Ci.nsIFileInputStream);
      const cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
        .createInstance(Ci.nsIConverterInputStream);

      fstream.init(keysetFile, -1, 0, 0);
      cstream.init(fstream, "UTF-8", 0, 0);

      let str = {};
      let data = "";
      while (cstream.readString(0xffffffff, str) !== 0) {
        data += str.value;
      }
      cstream.close();

      const parser = new DOMParser();
      const keysetDoc = parser.parseFromString(data, "application/xml");

      const parserError = keysetDoc.querySelector("parsererror");
      if (parserError) {
        console.error("[keymaps] Error parsing keyset.html:", parserError.textContent);
        return;
      }

      const customKeyset = keysetDoc.documentElement;

      let mainKeyset = document.getElementById("mainKeyset");
      if (!mainKeyset) {
        console.error("[keymaps] mainKeyset not found");
        return;
      }

      const keys = customKeyset.querySelectorAll("key");
      console.log(`[keymaps] Loading ${keys.length} custom keybindings`);

      keys.forEach((key) => {
        const keyId = key.getAttribute("id");

        if (keyId) {
          const existingKey = document.getElementById(keyId);
          if (existingKey) {
            console.log(`[keymaps] Replacing existing key: ${keyId}`);
            existingKey.remove();
          }
        }

        const importedKey = document.importNode(key, true);
        mainKeyset.appendChild(importedKey);
      });

      console.log("[keymaps] Custom keyset loaded successfully");
    } catch (e) {
      console.error("[keymaps] Error loading keyset:", e);
    }
  },

  destroy: function () {
    delete UC.keymaps;
  }
};
