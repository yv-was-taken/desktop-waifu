{
  description = "Animated 3D VRM characters with AI-powered conversational chat";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        packages = {
          default = pkgs.callPackage ./packaging/nix/default.nix { };
          desktop-waifu = self.packages.${system}.default;
        };

        apps.default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/desktop-waifu";
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            rustc
            cargo
            pkg-config
            gtk4
            webkitgtk_6_0
            cairo
            glib
            pango
            wayland
            wayland-protocols
            dbus
            meson
            ninja
            gobject-introspection
            vala
          ];

          shellHook = ''
            echo "Desktop Waifu development shell"
            echo "Run 'bun install' to install dependencies"
            echo "Run 'bun dev' to start development server"
          '';
        };
      }
    );
}
