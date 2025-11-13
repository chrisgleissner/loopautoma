#[cfg(any(feature = "os-linux-capture", feature = "os-linux-input"))]
pub mod linux;
#[cfg(feature = "os-macos")]
pub mod macos;
#[cfg(feature = "os-windows")]
pub mod windows;
