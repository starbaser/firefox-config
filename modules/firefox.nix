# Firefox Nightly + Textfox + fx-autoconfig — hybrid HM + raw hjem module
#
# Closed over by flake.nix:
#   wrapHmModule, hmSrc       — hjem-compat HM module wrapper
#   firefoxNightlyPkg         — firefox nightly binary
#   textfoxPkg                — textfox CSS package
#   fxAutoconfigSrc           — github:MrOtherGuy/fx-autoconfig (flake = false)
#   firefoxScriptsSrc         — github:xiaoxiaoflood/firefox-scripts (flake = false)
#
# From consumer's hjem.specialArgs:
#   srcery, theme             — color palette and UI symbols
#
# Requires consumer to have nix-firefox-addons overlay (pkgs.firefoxAddons)
{
  wrapHmModule,
  hmSrc,
  firefoxNightlyPkg,
  textfoxPkg,
  fxAutoconfigSrc,
  firefoxScriptsSrc,
}:
{ config, pkgs, lib, srcery, theme, ... }:

let
  # ── fx-autoconfig: wrap nightly binary with program-level config ──────────
  firefoxNightlyAutoconfig = pkgs.runCommand "firefox-nightly-autoconfig" {
    nativeBuildInputs = [ pkgs.rsync ];
    meta = firefoxNightlyPkg.meta or { };
  } ''
    mkdir -p $out
    rsync -aL ${firefoxNightlyPkg}/ $out/

    firefoxLib=$(find $out/lib -name "application.ini" -printf "%h" -quit 2>/dev/null || true)
    if [ -z "$firefoxLib" ]; then
      firefoxLib=$(find $out/lib -maxdepth 2 -type d -name "firefox*" | head -1)
    fi

    if [ -z "$firefoxLib" ]; then
      echo "ERROR: Could not find firefox lib directory in ${firefoxNightlyPkg}"
      find $out/lib -maxdepth 3 -type f | head -20
      exit 1
    fi

    chmod u+w "$firefoxLib"
    cp ${fxAutoconfigSrc}/program/config.js "$firefoxLib/config.js"

    mkdir -p "$firefoxLib/defaults/pref"
    chmod u+w "$firefoxLib/defaults" "$firefoxLib/defaults/pref" 2>/dev/null || true
    cp ${fxAutoconfigSrc}/program/defaults/pref/config-prefs.js \
       "$firefoxLib/defaults/pref/config-prefs.js"
  '';

  # ── Srcery dark browser theme (not in nix-firefox-addons) ───────────────
  srceryDark = pkgs.stdenv.mkDerivation {
    pname = "srcery-dark";
    version = "1.0";
    src = pkgs.fetchurl {
      url = "https://addons.mozilla.org/firefox/downloads/file/3731469/srcery_dark-1.0.xpi";
      sha256 = "0lbz571xrz229kgsj0jgg1hc4fhaq5g653a0lgzpczv1sh7kf1jx";
    };
    dontUnpack = true;
    installPhase = ''
      dst="$out/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
      mkdir -p "$dst"
      install -v -m644 "$src" "$dst/{6db4bb2a-7699-46c4-89d2-56143e486116}.xpi"
    '';
  };

  # ── Legacy XPI derivations ──────────────────────────────────────────────
  legacyBootstrapLoader = pkgs.stdenv.mkDerivation {
    pname = "bootstrapLoader-xpi";
    version = "1.0";
    src = "${firefoxScriptsSrc}/extensions/bootstrapLoader/bootstrapLoader.xpi";
    dontUnpack = true;
    installPhase = ''
      dst="$out/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
      mkdir -p "$dst"
      install -v -m644 "$src" "$dst/bootstrapLoader@Off.JustOff.xpi"
    '';
  };

  legacyKeyconfig = pkgs.stdenv.mkDerivation {
    pname = "keyconfig-xpi";
    version = "1.0";
    src = "${firefoxScriptsSrc}/extensions/keyconfig/keyconfig.xpi";
    dontUnpack = true;
    installPhase = ''
      dst="$out/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
      mkdir -p "$dst"
      install -v -m644 "$src" "$dst/keyconfig@Off.JustOff.xpi"
    '';
  };

  # ── Textfox CSS generation ─────────────────────────────────────────────
  textfoxBaseVars = ''
      --tf-font-family: "Iosevka Custom", Consolas, monospace;
      --tf-font-size: 14px;
      --tf-accent: #${srcery.primary.bright_white.hex};
      --tf-background: #${srcery.base00};
      --tf-border-color: #${srcery.primary.white.hex};
      --tf-border-transition: 0.2s ease;
      --tf-border-width: 2px;
      --tf-border-radius: 4px;
  '';

  textfoxContentVars = ''
    :root {
    ${textfoxBaseVars}
      --tf-tabs-vertical-margin: 0.8rem;
    }
  '';

  textfoxOverwrites = builtins.readFile "${textfoxPkg}/chrome/overwrites.css";
  textfoxDefaults = builtins.readFile "${textfoxPkg}/chrome/defaults.css";
  customSidebery = builtins.readFile ../config/firefox/sidebery.css;
  customChromeCss = builtins.readFile ../config/firefox/default-nightly/chrome/custom.css;

  userContentCss = ''
    /*    __            __  ____            */
     /*   / /____  _  __/ /_/ __/___  _  __  */
     /*  / __/ _ \| |/_/ __/ /_/ __ \| |/_/  */
     /* / /_/  __/>  </ /_/ __/ /_/ />  <    */
     /* \__/\___/_/|_|\__/_/  \____/_/|_|    */

    ${textfoxDefaults}
    ${textfoxContentVars}
    ${textfoxOverwrites}
    ${customSidebery}

    /* Other content styles */
    @import url("content/about.css");
    @import url("content/newtab.css");

    /* configurations - DO NOT CHANGE ORDER */
    @import url("defaults.css");
    @import url("config.css");
  '';

  textfoxUserChrome = builtins.readFile "${textfoxPkg}/chrome/userChrome.css";
  userChromeCss = ''
    ${textfoxUserChrome}

    /* Custom overrides */
    ${customChromeCss}
  '';

  textfoxConfigCss = ''
    :root {
    ${textfoxBaseVars}
      --tf-tabs-horizontal-enabled: false;
      --tf-tabs-vertical-enabled: true;
      --tf-tabs-vertical-margin: 0.8rem;
      --tf-display-window-controls: false;
      --tf-display-nav-buttons: true;
      --tf-display-urlbar-icons: false;
      --tf-display-sidebar-tools: true;
      --tf-display-titles: true;
    }
  '';

  # Textfox passthrough CSS files (symlinked as-is from textfox package)
  textfoxPassthroughFiles = [
    "browser.css"
    "defaults.css"
    "findbar.css"
    "icons.css"
    "menus.css"
    "navbar.css"
    "overwrites.css"
    "sidebar.css"
    "tabs.css"
    "urlbar.css"
  ];

  profilePath = "default-nightly";

  # ── Extension packages (deployed as individual XPI files via hjem) ──────
  allExtensionPackages =
    (with pkgs.firefoxAddons; [
      ublock-origin
      sidebery
      clearurls
      darkreader
      istilldontcareaboutcookies
      tampermonkey
      refined-github-
      sponsorblock
      stylus
      reddit-enhancement-suite
      tridactyl-vim
      cookie-editor
      translate-web-pages
      youtube-nonstop
      open-multiple-urls
      view-image
      cliget
      userchrome-toggle-extended
      claude-exporter
      markdown-here
      export-tabs-urls-and-titles
      widegithub
    ])
    ++ [
      pkgs.firefoxAddons."1password-x-password-manager"
      srceryDark
      legacyBootstrapLoader
      legacyKeyconfig
    ];

  # Flat derivation: all XPIs in one directory, dereferenced from store paths
  extensionsFlat = pkgs.runCommand "firefox-extensions-flat" { } ''
    mkdir -p $out
    ${lib.concatMapStringsSep "\n" (pkg: ''
      for xpi in ${pkg}/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/*.xpi; do
        [ -f "$xpi" ] && cp -L "$xpi" "$out/$(basename "$xpi")"
      done
    '') allExtensionPackages}
  '';

  firefoxConfigPath = "${config.xdg.configHome}/mozilla/firefox";
  firefoxHomePath = lib.removePrefix "${config.home.homeDirectory}/" firefoxConfigPath;

  # IFD: enumerate XPI filenames at eval time → individual hjem file entries
  extensionFileEntries = lib.mapAttrs' (name: _: {
    name = "${firefoxHomePath}/${profilePath}/extensions/${name}";
    value = { source = "${extensionsFlat}/${name}"; };
  }) (builtins.readDir extensionsFlat);

  chromePath = "${firefoxHomePath}/${profilePath}/chrome";
in
{
  # ── HM module imports ────────────────────────────────────────────────────
  imports = [
    (wrapHmModule "${hmSrc}/modules/programs/firefox/default.nix")
    (wrapHmModule "${hmSrc}/modules/misc/mozilla-messaging-hosts.nix")
  ];

  # ── Package: fx-autoconfig wrapped nightly ───────────────────────────────
  # programs.firefox.package = null bypasses HM's wrapPackage (.override)
  # which would discard the injected autoconfig files
  packages = [ firefoxNightlyAutoconfig ];

  programs.firefox = {
    enable = true;
    configPath = firefoxConfigPath;
    package = null;
    nativeMessagingHosts = [
      pkgs.tridactyl-native
      (pkgs.writeTextDir "lib/mozilla/native-messaging-hosts/com.1password.1password.json"
        (builtins.toJSON {
          name = "com.1password.1password";
          description = "1Password";
          path = "/run/wrappers/bin/1Password-BrowserSupport";
          type = "stdio";
          allowed_extensions = [ "{d634138d-c276-4fc8-924b-40a0ea21d284}" ];
        }))
    ];

    policies = {
      DisableTelemetry = true;
      DisableFirefoxStudies = true;
      DontCheckDefaultBrowser = true;
      DisablePocket = true;
      LegacyProfiles = true;
    };

    profiles.${profilePath} = {
      isDefault = true;

      userChrome = userChromeCss;
      userContent = userContentCss;

      settings = {
        # ── FASTFOX ──────────────────────────────────────────────────────
        "content.notify.interval" = 100000;
        "gfx.canvas.accelerated.cache-size" = 512;
        "gfx.content.skia-font-cache-size" = 20;
        "browser.cache.disk.enable" = false;
        "media.memory_cache_max_size" = 65536;
        "media.cache_readahead_limit" = 7200;
        "media.cache_resume_threshold" = 3600;
        "image.mem.decode_bytes_at_a_time" = 32768;
        "network.http.max-connections" = 1800;
        "network.http.max-persistent-connections-per-server" = 10;
        "network.http.max-urgent-start-excessive-connections-per-host" = 5;
        "network.http.pacing.requests.enabled" = false;
        "network.dnsCacheExpiration" = 3600;
        "network.trr.excluded-domains" = "mcp.eigenmage.com,www.mcp.eigenmage.com,ts.eigenmage.com";
        "network.ssl_tokens_cache_capacity" = 10240;
        "layout.css.grid-template-masonry-value.enabled" = true;

        # ── SECUREFOX ────────────────────────────────────────────────────
        "browser.contentblocking.category" = "standard";
        "urlclassifier.trackingSkipURLs" = "*.reddit.com, *.twitter.com, *.twimg.com, *.tiktok.com";
        "urlclassifier.features.socialtracking.skipURLs" = "*.instagram.com, *.twitter.com, *.twimg.com";
        "browser.download.start_downloads_in_tmp_dir" = true;
        "browser.helperApps.deleteTempFileOnExit" = true;
        "browser.uitour.enabled" = false;
        "privacy.globalprivacycontrol.enabled" = true;
        "security.OCSP.enabled" = 0;
        "security.remote_settings.crlite_filters.enabled" = true;
        "security.pki.crlite_mode" = 2;
        "security.ssl.treat_unsafe_negotiation_as_broken" = true;
        "browser.xul.error_pages.expert_bad_cert" = true;
        "security.tls.enable_0rtt_data" = false;
        "browser.privatebrowsing.forceMediaMemoryCache" = true;
        "browser.sessionstore.interval" = 60000;
        "browser.privatebrowsing.resetPBM.enabled" = true;
        "privacy.history.custom" = true;
        "browser.urlbar.trimHttps" = true;
        "browser.urlbar.untrimOnUserInteraction.featureGate" = true;
        "browser.search.separatePrivateDefault.ui.enabled" = true;
        "browser.urlbar.update2.engineAliasRefresh" = true;
        "browser.search.suggest.enabled" = true;
        "browser.urlbar.quicksuggest.enabled" = true;
        "browser.urlbar.groupLabels.enabled" = false;
        "browser.formfill.enable" = false;
        "security.insecure_connection_text.enabled" = true;
        "security.insecure_connection_text.pbmode.enabled" = true;
        "network.IDN_show_punycode" = true;
        "dom.security.https_first" = true;
        "signon.formlessCapture.enabled" = false;
        "signon.privateBrowsingCapture.enabled" = false;
        "signon.rememberSignons" = false;
        "network.auth.subresource-http-auth-allow" = 1;
        "editor.truncate_user_pastes" = false;
        "security.mixed_content.block_display_content" = true;
        "pdfjs.enableScripting" = false;
        "extensions.enabledScopes" = 5;
        "extensions.autoDisableScopes" = 0;
        "network.http.referer.XOriginTrimmingPolicy" = 2;
        "privacy.userContext.ui.enabled" = true;
        "privacy.userContext.enabled" = true;
        "browser.safebrowsing.downloads.remote.enabled" = false;
        "permissions.default.desktop-notification" = 2;
        "permissions.default.geo" = 2;
        "browser.search.update" = false;
        "permissions.manager.defaultsUrl" = "";

        # ── Telemetry disabled ───────────────────────────────────────────
        "datareporting.policy.dataSubmissionEnabled" = false;
        "datareporting.healthreport.uploadEnabled" = false;
        "toolkit.telemetry.unified" = false;
        "toolkit.telemetry.enabled" = false;
        "toolkit.telemetry.server" = "data:,";
        "toolkit.telemetry.archive.enabled" = false;
        "toolkit.telemetry.newProfilePing.enabled" = false;
        "toolkit.telemetry.shutdownPingSender.enabled" = false;
        "toolkit.telemetry.updatePing.enabled" = false;
        "toolkit.telemetry.bhrPing.enabled" = false;
        "toolkit.telemetry.firstShutdownPing.enabled" = false;
        "toolkit.telemetry.coverage.opt-out" = true;
        "toolkit.coverage.opt-out" = true;
        "toolkit.coverage.endpoint.base" = "";
        "browser.newtabpage.activity-stream.feeds.telemetry" = false;
        "browser.newtabpage.activity-stream.telemetry" = false;
        "app.shield.optoutstudies.enabled" = false;
        "app.normandy.enabled" = false;
        "app.normandy.api_url" = "";
        "breakpad.reportURL" = "";
        "browser.tabs.crashReporting.sendReport" = false;
        "captivedetect.canonicalURL" = "";
        "network.captive-portal-service.enabled" = false;
        "network.connectivity-service.enabled" = false;

        # ── PESKYFOX ─────────────────────────────────────────────────────
        "browser.privatebrowsing.vpnpromourl" = "";
        "extensions.getAddons.showPane" = false;
        "extensions.htmlaboutaddons.recommendations.enabled" = false;
        "browser.discovery.enabled" = false;
        "browser.shell.checkDefaultBrowser" = false;
        "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons" = false;
        "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features" = false;
        "browser.preferences.moreFromMozilla" = false;
        "browser.aboutConfig.showWarning" = false;
        "browser.aboutwelcome.enabled" = false;
        "browser.profiles.enabled" = true;
        "toolkit.legacyUserProfileCustomizations.stylesheets" = true;
        "browser.compactmode.show" = true;
        "browser.privateWindowSeparation.enabled" = false;
        "cookiebanners.service.mode" = 1;
        "cookiebanners.service.mode.privateBrowsing" = 1;
        "full-screen-api.transition-duration.enter" = "0 0";
        "full-screen-api.transition-duration.leave" = "0 0";
        "full-screen-api.warning.timeout" = 0;
        "browser.urlbar.suggest.calculator" = true;
        "browser.urlbar.unitConversion.enabled" = true;
        "browser.urlbar.trending.featureGate" = false;
        "browser.newtabpage.activity-stream.feeds.topsites" = false;
        "browser.newtabpage.activity-stream.showWeather" = false;
        "browser.newtabpage.activity-stream.feeds.section.topstories" = false;
        "extensions.pocket.enabled" = false;
        "browser.download.manager.addToRecentDocs" = false;
        "browser.download.open_pdf_attachments_inline" = true;
        "browser.bookmarks.openInTabClosesMenu" = false;
        "browser.menu.showViewImageInfo" = true;
        "findbar.highlightAll" = true;
        "layout.word_select.eat_space_to_next_word" = false;

        # ── Font rendering ───────────────────────────────────────────────
        "gfx.font_rendering.cleartype_params.rendering_mode" = 5;
        "gfx.font_rendering.cleartype_params.cleartype_level" = 100;
        "gfx.font_rendering.directwrite.use_gdi_table_loading" = false;

        # ── GPU acceleration ─────────────────────────────────────────────
        "webgl.force-enabled" = true;
        "webgl.disabled" = false;
        "layers.acceleration.force-enabled" = true;
        "gfx.webrender.all" = true;
        "gfx.webrender.enabled" = true;
        "media.hardware-video-decoding.enabled" = true;
        "media.hardware-video-decoding.force-enabled" = true;
        "media.ffmpeg.vaapi.enabled" = true;
        "widget.dmabuf.force-enabled" = true;
        "media.av1.enabled" = true;
        "gfx.canvas.accelerated" = true;
        "layers.gpu-process.enabled" = true;
        "layers.gpu-process.force-enabled" = true;

        # ── Personal overrides ───────────────────────────────────────────
        "identity.fxaccounts.enabled" = true;
        "browser.firefox-view.feature-tour" = "{\"screen\":\"\",\"complete\":true}";
        "extensions.formautofill.addresses.enabled" = false;
        "extensions.formautofill.creditCards.enabled" = false;
        "svg.context-properties.content.enabled" = true;
        "layout.css.has-selector.enabled" = true;
        "network.dns.disablePrefetch" = false;
        "network.dns.disablePrefetchFromHTTPS" = false;
        "network.prefetch-next" = true;
        "network.predictor.enabled" = true;
        "network.predictor.enable-prefetch" = true;
        "devtools.chrome.enabled" = true;
        "devtools.debugger.remote-enabled" = true;
        "devtools.debugger.prompt-connection" = false;
        "browser.urlbar.autoFill.adaptiveHistory.enabled" = true;
        "browser.urlbar.quicksuggest.contextualOptIn" = true;
        "services.sync.prefs.sync-seen.browser.urlbar.showSearchSuggestionsFirst" = true;
        "devtools.selfxss.count" = 5;
        "dom.ipc.processCount" = 8;
        "browser.preferences.defaultPerformanceSettings.enabled" = false;
        "browser.crashReports.requestedNeverShowAgain" = true;
        "browser.crashReports.unsubmittedCheck.enabled" = false;
      };
    };
  };

  # ── Raw hjem files: textfox CSS, userChromeJS, fx-autoconfig utils ──────
  files = lib.mkMerge [

    # Individual extension XPI files (IFD-enumerated, avoids symlinked directory bug)
    extensionFileEntries

    # Textfox passthrough CSS files — symlinked from package
    (lib.listToAttrs (
      map (name: {
        name = "${chromePath}/${name}";
        value = {
          source = "${textfoxPkg}/chrome/${name}";
        };
      }) textfoxPassthroughFiles
    ))

    # Textfox subdirs — symlinked whole
    {
      "${chromePath}/content" = {
        source = "${textfoxPkg}/chrome/content";
        type = "symlink";
      };
      "${chromePath}/icons" = {
        source = "${textfoxPkg}/chrome/icons";
        type = "symlink";
      };
    }

    # config.css — generated from textfox options
    { "${chromePath}/config.css".text = textfoxConfigCss; }

    # userChromeJS scripts
    {
      "${chromePath}/extensionOptionsMenu.uc.js".source =
        "${firefoxScriptsSrc}/chrome/extensionOptionsMenu.uc.js";
      "${chromePath}/keymaps.uc.js".source =
        ../config/firefox/default-nightly/chrome/keymaps.uc.js;
      "${chromePath}/keyset.html".source =
        ../config/firefox/default-nightly/chrome/keyset.html;
      "${chromePath}/rebuild_userChrome.uc.js".source =
        "${firefoxScriptsSrc}/chrome/rebuild_userChrome.uc.js";
      "${chromePath}/styloaix.uc.js".source =
        "${firefoxScriptsSrc}/chrome/styloaix.uc.js";
    }

    # Legacy bootstrap utils (for bootstrapLoader.xpi)
    {
      "${chromePath}/utils/BootstrapLoader.js".source =
        "${firefoxScriptsSrc}/chrome/utils/BootstrapLoader.js";
      "${chromePath}/utils/RDFDataSource.sys.mjs".source =
        "${firefoxScriptsSrc}/chrome/utils/RDFDataSource.sys.mjs";
      "${chromePath}/utils/RDFManifestConverter.sys.mjs".source =
        "${firefoxScriptsSrc}/chrome/utils/RDFManifestConverter.sys.mjs";
      "${chromePath}/utils/userChrome.jsm".source =
        "${firefoxScriptsSrc}/chrome/utils/userChrome.jsm";
      "${chromePath}/utils/xPref.jsm".source =
        "${firefoxScriptsSrc}/chrome/utils/xPref.jsm";
    }

    # StyloaiX editor UI
    {
      "${chromePath}/utils/styloaix" = {
        source = "${firefoxScriptsSrc}/chrome/utils/styloaix";
        type = "symlink";
      };
    }

    # fx-autoconfig profile utils — loaded at startup via chrome.manifest
    {
      "${chromePath}/utils/boot.sys.mjs".source =
        "${fxAutoconfigSrc}/profile/chrome/utils/boot.sys.mjs";
      "${chromePath}/utils/utils.sys.mjs".source =
        "${fxAutoconfigSrc}/profile/chrome/utils/utils.sys.mjs";
      "${chromePath}/utils/fs.sys.mjs".source =
        "${fxAutoconfigSrc}/profile/chrome/utils/fs.sys.mjs";
      "${chromePath}/utils/uc_api.sys.mjs".source =
        "${fxAutoconfigSrc}/profile/chrome/utils/uc_api.sys.mjs";
      "${chromePath}/utils/module_loader.mjs".source =
        "${fxAutoconfigSrc}/profile/chrome/utils/module_loader.mjs";
      "${chromePath}/utils/chrome.manifest".source =
        "${fxAutoconfigSrc}/profile/chrome/utils/chrome.manifest";
    }
  ];

  # ── Tridactyl ────────────────────────────────────────────────────────────
  xdg.config.files = {
    "tridactyl/tridactylrc".source = ../config/tridactyl/tridactylrc;
    "tridactyl/themes/srcery.css".source = ../config/tridactyl/themes/srcery.css;
  };
}
