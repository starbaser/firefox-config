# firefox-config

Firefox Nightly + Textfox + fx-autoconfig eigenhome module.

Standalone flake that bundles Firefox Nightly, Textfox theming, fx-autoconfig (userChromeJS), NUR
extensions, and tridactyl into a single eigenhome home module.

## Integration

### NixOS flake input

In `~/.config/nixos/flake.nix`:

```nix
firefox-config = {
  url = "github:starbaser/firefox-config";
  inputs.nixpkgs.follows = "nixpkgs";
  # inputs.eigenhome.follows = "eigenhome"; # only if you use starbaser/eigenhome (Home Manager emulator)
  inputs.home-manager.follows = "home-manager";
  inputs.nur.follows = "nur";
  inputs.nix-firefox-addons.follows = "nix-firefox-addons";
};
```

### Overlay

The `nix-firefox-addons` overlay is re-exported and applied in the NixOS config’s overlay list:

```nix
firefox-config.overlays.nix-firefox-addons
```

This makes `pkgs.nur.repos.rycee.firefox-addons` available system-wide.

### Home module

The primary integration is a single line in the gaiagear eigenhome `extraModules`:

```nix
firefox-config.homeModules.firefox
```

This loads `modules/firefox.nix` with all dependencies pre-wired — no additional configuration
needed in the NixOS config.

### HM compatibility

The flake constructs its own `wrapHmModule` from eigenhome’s HM compat layer:

```nix
wrapHmModule = import "${eigenhome}/modules/hm-compat/wrap-hm-module.nix" { inherit hmExtLib; };
```

This is passed into the module as a special arg, so firefox-config wraps its internal HM module
usage independently — the consuming flake doesn’t need to handle HM wrapping for Firefox.

### `programs.firefox.package = null`

The module sets `programs.firefox.package = null` to bypass Home Manager’s `.override` wrapping,
which is incompatible with fx-autoconfig’s custom Firefox wrapper.
The Firefox package is added to `packages` directly instead.
``
