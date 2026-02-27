// ==UserScript==
// @name            keymaps
// @author          firefox-config
// @include         main
// @startup         UC.keymaps.exec(win);
// @shutdown        UC.keymaps.destroy();
// @onlyonce
// ==/UserScript==

UC.keymaps = {
  exec: function (win) {
    if (win.location.href !== _uc.BROWSERCHROME) return;

    const { document } = win;

    // Wait for browser to be fully loaded
    if (document.readyState !== "complete") {
      win.addEventListener("load", () => this.loadCustomKeyset(win), { once: true });
    } else {
      this.loadCustomKeyset(win);
    }
  },

  loadCustomKeyset: function (win) {
    const { document } = win;

    try {
      // Get path to keyset.html
      const keysetFile = _uc.chromedir.clone();
      keysetFile.append("keyset.html");

      if (!keysetFile.exists()) {
        console.error("[keymaps] keyset.html not found at:", keysetFile.path);
        return;
      }

      // Read keyset.html
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

      // Parse XML
      const parser = new DOMParser();
      const keysetDoc = parser.parseFromString(data, "application/xml");

      // Check for parsing errors
      const parserError = keysetDoc.querySelector("parsererror");
      if (parserError) {
        console.error("[keymaps] Error parsing keyset.html:", parserError.textContent);
        return;
      }

      // Get the keyset element
      const customKeyset = keysetDoc.documentElement;

      // Find main keyset or create one
      let mainKeyset = document.getElementById("mainKeyset");
      if (!mainKeyset) {
        console.error("[keymaps] mainKeyset not found");
        return;
      }

      // Import and append all key elements from custom keyset
      const keys = customKeyset.querySelectorAll("key");
      console.log(`[keymaps] Loading ${keys.length} custom keybindings`);

      keys.forEach((key) => {
        const keyId = key.getAttribute("id");

        // Remove existing key with same ID if it exists
        if (keyId) {
          const existingKey = document.getElementById(keyId);
          if (existingKey) {
            console.log(`[keymaps] Replacing existing key: ${keyId}`);
            existingKey.remove();
          }
        }

        // Import the key element
        const importedKey = document.importNode(key, true);
        mainKeyset.appendChild(importedKey);
      });

      console.log("[keymaps] Custom keyset loaded successfully");
    } catch (e) {
      console.error("[keymaps] Error loading keyset:", e);
    }
  },

  destroy: function () {
    // Cleanup if needed
    delete UC.keymaps;
  }
};
