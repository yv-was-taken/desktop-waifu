# Homebrew formula for desktop-waifu
# Maintainer: yv-was-taken <yvmail@proton.me>

class DesktopWaifu < Formula
  desc "Animated 3D VRM characters with AI-powered conversational chat"
  homepage "https://github.com/yv-was-taken/desktop-waifu"
  url "https://github.com/yv-was-taken/desktop-waifu/archive/refs/tags/v0.1.3.tar.gz"
  sha256 "5a3e4635e60b2556c378890d9e9243b24153efc6898bd6f445e548261df9e4dd"
  license "MIT"
  head "https://github.com/yv-was-taken/desktop-waifu.git", branch: "master"

  depends_on "rust" => :build
  depends_on "node" => :build

  on_macos do
    # macOS uses the Tauri app bundle
    depends_on xcode: ["14.0", :build]
  end

  on_linux do
    depends_on "gtk4"
    depends_on "webkitgtk"
    depends_on "cairo"
    depends_on "glib"
    depends_on "pango"
    depends_on "wayland"
    depends_on "dbus"
  end

  def install
    # Install bun for building
    system "npm", "install", "-g", "bun"

    # Build frontend
    system "bun", "install", "--frozen-lockfile"
    system "bun", "run", "build:web"

    if OS.mac?
      # Build Tauri app for macOS
      cd "src-tauri" do
        system "cargo", "build", "--release"
      end
      # Install the Tauri binary
      bin.install "src-tauri/target/release/desktop-waifu-tauri" => "desktop-waifu"
    else
      # Build Wayland overlay for Linux
      cd "desktop-waifu-overlay" do
        system "cargo", "build", "--release"
      end
      bin.install "desktop-waifu-overlay/target/release/desktop-waifu-overlay" => "desktop-waifu"
    end

    # Install frontend assets
    (share/"desktop-waifu/dist").install Dir["dist/*"]
  end

  def caveats
    if OS.mac?
      <<~EOS
        Desktop Waifu on macOS runs in windowed mode.
        Full Wayland overlay support is available on Linux.
      EOS
    else
      <<~EOS
        Desktop Waifu requires a Wayland compositor for full overlay support.
        The app will detect and notify you if running on an unsupported environment.
      EOS
    end
  end

  test do
    assert_predicate bin/"desktop-waifu", :executable?
  end
end
