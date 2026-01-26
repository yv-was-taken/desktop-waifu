{
  lib,
  stdenv,
  fetchFromGitHub,
  rustPlatform,
  bun,
  cacert,
  pkg-config,
  gtk4,
  webkitgtk_6_0,
  cairo,
  glib,
  pango,
  wayland,
  wayland-protocols,
  wayland-scanner,
  dbus,
  meson,
  ninja,
  gobject-introspection,
  vala,
  makeWrapper,
}:

let
  # Build gtk4-layer-shell from source (not yet in nixpkgs)
  gtk4-layer-shell = stdenv.mkDerivation rec {
    pname = "gtk4-layer-shell";
    version = "0.2.5";

    src = fetchFromGitHub {
      owner = "wmww";
      repo = "gtk4-layer-shell";
      rev = "v${version}";
      hash = "sha256-UGhFeaBBIfC4ToWdyoX+oUzLlqJsjF++9U7mtszE0y0=";
    };

    nativeBuildInputs = [
      meson
      ninja
      pkg-config
      gobject-introspection
      vala
      wayland-scanner
    ];

    mesonFlags = [
      "-Dexamples=false"
      "-Ddocs=false"
      "-Dtests=false"
    ];

    buildInputs = [
      gtk4
      wayland
      wayland-protocols
    ];

    meta = with lib; {
      description = "A library for creating Wayland layer shell surfaces with GTK4";
      homepage = "https://github.com/wmww/gtk4-layer-shell";
      license = licenses.mit;
      platforms = platforms.linux;
    };
  };

  src = lib.cleanSource ../../.;

  # Fixed-Output Derivation to fetch npm dependencies
  # This is allowed network access because the output hash is verified
  npmDeps = stdenv.mkDerivation {
    pname = "desktop-waifu-npm-deps";
    version = "0.2.5";

    inherit src;

    nativeBuildInputs = [ bun cacert ];

    # FOD: fixed-output derivation allows network access
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
    # This hash will need to be updated when dependencies change
    # Run with lib.fakeHash first, then update with the correct hash from the error
    outputHash = "sha256-GcC4GjgPO8YUfyYxrm9B3KMmfX9wUZ6j8Q37eAPWvAU=";

    buildPhase = ''
      runHook preBuild

      export HOME=$(mktemp -d)
      bun install --frozen-lockfile

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out
      cp -r node_modules $out/

      runHook postInstall
    '';

    dontFixup = true;
  };
in
rustPlatform.buildRustPackage {
  pname = "desktop-waifu";
  version = "0.2.5";

  inherit src;

  cargoLock = {
    lockFile = ../../desktop-waifu-overlay/Cargo.lock;
  };

  buildAndTestSubdir = "desktop-waifu-overlay";

  # Copy Cargo.lock to root as rustPlatform expects it there
  postUnpack = ''
    cp $sourceRoot/desktop-waifu-overlay/Cargo.lock $sourceRoot/
  '';

  nativeBuildInputs = [
    pkg-config
    bun
    makeWrapper
  ];

  buildInputs = [
    gtk4
    gtk4-layer-shell
    webkitgtk_6_0
    cairo
    glib
    pango
    wayland
    dbus
  ];

  # Skip cargo tests
  doCheck = false;

  # Build frontend before Rust build using pre-fetched dependencies
  preBuild = ''
    # Link pre-fetched node_modules
    ln -s ${npmDeps}/node_modules node_modules

    # Build frontend using bun's module resolution
    export HOME=$(mktemp -d)
    bun run ./node_modules/typescript/bin/tsc
    bun run ./node_modules/vite/bin/vite.js build
  '';

  postInstall = ''
    # Rename binary from desktop-waifu-overlay to desktop-waifu
    mv $out/bin/desktop-waifu-overlay $out/bin/desktop-waifu

    # Install frontend assets
    mkdir -p $out/share/desktop-waifu/dist
    cp -r dist/* $out/share/desktop-waifu/dist/

    # Install desktop entry
    install -Dm644 packaging/desktop-waifu.desktop $out/share/applications/desktop-waifu.desktop

    # Install icon
    install -Dm644 src-tauri/icons/128x128.png $out/share/icons/hicolor/128x128/apps/desktop-waifu.png
    install -Dm644 src-tauri/icons/32x32.png $out/share/icons/hicolor/32x32/apps/desktop-waifu.png

    # Install license
    install -Dm644 LICENSE $out/share/licenses/desktop-waifu/LICENSE

    # Wrap binary to find libraries
    wrapProgram $out/bin/desktop-waifu \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath [ gtk4-layer-shell webkitgtk_6_0 ]}"
  '';

  meta = with lib; {
    description = "Animated 3D VRM characters with AI-powered conversational chat";
    homepage = "https://github.com/yv-was-taken/desktop-waifu";
    license = licenses.mit;
    maintainers = [ ];
    platforms = platforms.linux;
    mainProgram = "desktop-waifu";
  };
}
