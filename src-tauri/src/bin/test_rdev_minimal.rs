// Minimal test of rdev to diagnose the issue

fn main() {
    eprintln!("Testing rdev minimal...");
    eprintln!("DISPLAY: {:?}", std::env::var("DISPLAY"));
    eprintln!("XDG_SESSION_TYPE: {:?}", std::env::var("XDG_SESSION_TYPE"));
    
    #[cfg(feature = "os-linux-input")]
    {
        eprintln!("\nCalling rdev::listen()...");
        eprintln!("MOVE YOUR MOUSE AND TYPE KEYS NOW!");
        let result = rdev::listen(|event| {
            eprintln!("=====> EVENT: {:?}", event.event_type);
        });
        
        match result {
            Ok(()) => eprintln!("rdev::listen() returned Ok - this should never happen!"),
            Err(e) => eprintln!("rdev::listen() returned Err: {:?}", e),
        }
    }
    
    #[cfg(not(feature = "os-linux-input"))]
    {
        eprintln!("Feature os-linux-input not enabled!");
    }
}
