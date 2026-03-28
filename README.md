# firefox-config

Firefox Nightly + Textfox + fx-autoconfig eigenhome module.

Standalone flake that bundles Firefox Nightly, Textfox theming, fx-autoconfig (userChromeJS), NUR extensions, and tridactyl into a single eigenhome home module.

## Integration

### NixOS flake input

In `~/.config/nixos/flake.nix`:

```nix
firefox-config = {
  url = "path:/home/eigenmage/dev/projects/firefox-config";
  inputs.nixpkgs.follows = "nixpkgs";
  inputs.eigenhome.follows = "eigenhome";
  inputs.home-manager.follows = "home-manager";
  inputs.nur.follows = "nur";
  inputs.nix-firefox-addons.follows = "nix-firefox-addons";
};
```

### Overlay

The `nix-firefox-addons` overlay is re-exported and applied in the NixOS config's overlay list:

```nix
firefox-config.overlays.nix-firefox-addons
```

This makes `pkgs.nur.repos.rycee.firefox-addons` available system-wide.

### Home module

The primary integration is a single line in the gaiagear eigenhome `extraModules`:

```nix
firefox-config.homeModules.firefox
```

This loads `modules/firefox.nix` with all dependencies pre-wired — no additional configuration needed in the NixOS config.

### HM compatibility

The flake constructs its own `wrapHmModule` from eigenhome's HM compat layer:

```nix
wrapHmModule = import "${eigenhome}/modules/hm-compat/wrap-hm-module.nix" { inherit hmExtLib; };
```

This is passed into the module as a special arg, so firefox-config wraps its internal HM module usage independently — the consuming flake doesn't need to handle HM wrapping for Firefox.

### `programs.firefox.package = null`

The module sets `programs.firefox.package = null` to bypass Home Manager's `.override` wrapping, which is incompatible with fx-autoconfig's custom Firefox wrapper. The Firefox package is added to `packages` directly instead.

## Flake inputs

| Input | Purpose |
|-------|---------|
| `eigenhome` | Home management framework + HM compat |
| `home-manager` | HM module source (wrapped, not used directly) |
| `textfox` | Minimal Firefox CSS theme |
| `firefox` (flake-firefox-nightly) | Firefox Nightly binary |
| `nur` | Nix User Repository |
| `nix-firefox-addons` | Declarative Firefox extension packaging |
| `fx-autoconfig` | userChromeJS loader (non-flake) |
| `firefox-scripts` | userChromeJS scripts collection (non-flake) |

## Structure

```
firefox-config/
├── flake.nix        # Flake definition + homeModules.firefox output
├── flake.lock
├── config/          # Firefox profile configuration files
└── modules/
    └── firefox.nix  # Main eigenhome module
```
