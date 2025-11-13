# CI/dev image for LoopAutoma (Rust + Tauri 2 + Bun)
# Base: Ubuntu 24.04 with Tauri Linux deps

FROM ubuntu:24.04

LABEL org.opencontainers.image.source="https://github.com/chrisgleissner/loopautoma"
LABEL org.opencontainers.image.description="LoopAutoma CI/dev image (Rust, Bun, Tauri deps)"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      wget \
    unzip \
      git \
      pkg-config \
      build-essential \
      libssl-dev \
      libgtk-3-dev \
      libwebkit2gtk-4.1-dev \
      libsoup-3.0-dev \
      librsvg2-dev \
      patchelf \
      libayatana-appindicator3-dev \
      clang \
      llvm-dev \
      libpipewire-0.3-dev \
      libspa-0.2-dev \
      libclang-dev \
      cmake \
      xz-utils \
      sudo \
      && rm -rf /var/lib/apt/lists/*

# Install Rust (stable) via rustup
ENV RUSTUP_HOME=/root/.rustup
ENV CARGO_HOME=/root/.cargo
ENV PATH=/root/.cargo/bin:$PATH
ENV CARGO_TARGET_DIR=/workspace/target
ENV BINDGEN_EXTRA_CLANG_ARGS="--sysroot=/usr -I/usr/lib/llvm-18/lib/clang/18/include -I/usr/include/x86_64-linux-gnu"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal && \
    rustup default stable

# Install Bun
ENV BUN_INSTALL=/root/.bun
ENV PATH=/root/.bun/bin:$PATH
ARG BUN_INSTALL_URL=https://bun.sh/install
RUN curl -fsSL "$BUN_INSTALL_URL" | bash && \
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> /etc/profile.d/bun.sh

# Optional: Coverage tool for Rust
RUN cargo install cargo-tarpaulin || true

RUN mkdir -p /workspace
WORKDIR /workspace

# Pre-warm UI deps cache (optional; speeds up bun install by priming cache)
COPY package.json bun.lock* ./
RUN if [ -f package.json ]; then bun install --frozen-lockfile || true; fi

# Prebuild Rust dependencies at the same path CI uses so compiled deps can be reused
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock /workspace/src-tauri/
RUN mkdir -p /workspace/src-tauri/src && \
  # Provide both bin and lib placeholders so Cargo can parse the manifest
  printf 'fn main() { println!("prebuild"); }\n' > /workspace/src-tauri/src/main.rs && \
  printf 'pub fn __prebuild() {}\n' > /workspace/src-tauri/src/lib.rs && \
  (cd /workspace/src-tauri && cargo build --locked --tests || cargo build --locked) && \
  rm -rf /workspace/src-tauri/src

# Default to a shell; CI runs will override with commands
CMD ["bash"]
