{
  description = "firefox-config — Firefox Nightly + Textfox + fx-autoconfig hjem module";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    hjem-compat = {
      url = "git+file:///home/eigenmage/dev/projects/hjem-compat";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    textfox = {
      url = "github:adriankarlen/textfox";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    firefox = {
      url = "github:nix-community/flake-firefox-nightly";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nur = {
      url = "github:nix-community/NUR";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nix-firefox-addons = {
      url = "github:OsiPog/nix-firefox-addons";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    fx-autoconfig = {
      url = "github:MrOtherGuy/fx-autoconfig";
      flake = false;
    };

    firefox-scripts = {
      url = "github:xiaoxiaoflood/firefox-scripts";
      flake = false;
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      hjem-compat,
      home-manager,
      textfox,
      firefox,
      nur,
      nix-firefox-addons,
      fx-autoconfig,
      firefox-scripts,
      ...
    }:
    let
      system = "x86_64-linux";
      lib = nixpkgs.lib;

      hmExtLib = lib.extend (
        self: super: {
          hm = import "${home-manager}/modules/lib" { lib = self; };
        }
      );
      wrapHmModule = import "${hjem-compat}/modules/wrap-hm-module.nix" { inherit hmExtLib; };
      hmSrc = "${home-manager}";

      firefoxNightlyPkg = firefox.packages.${system}.firefox-nightly-bin;
      textfoxPkg = textfox.packages.${system}.default;
    in
    {
      # hjem module — add to hjem.extraModules
      # Consumer must provide srcery and theme via hjem.specialArgs
      # Consumer must have nur.overlays.default in nixpkgs overlays
      hjemModules.firefox = import ./modules/firefox.nix {
        inherit
          wrapHmModule
          hmSrc
          firefoxNightlyPkg
          textfoxPkg
          ;
        fxAutoconfigSrc = fx-autoconfig;
        firefoxScriptsSrc = firefox-scripts;
      };

      # Re-export overlays the consumer needs
      overlays.nur = nur.overlays.default;
      overlays.nix-firefox-addons = nix-firefox-addons.overlays.default;
    };
}
