use std::error::Error;
use std::io::{self, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use loopautoma_lib::domain::{InputCapture, InputEvent, KeyState, MouseButton, MouseEventType};
#[cfg(feature = "os-linux-input")]
use loopautoma_lib::os::linux::LinuxInputCapture;

#[cfg(not(feature = "os-linux-input"))]
fn main() {
    eprintln!(
        "The input recorder helper requires the os-linux-input feature. Rebuild with --features os-linux-input."
    );
    std::process::exit(1);
}

#[cfg(feature = "os-linux-input")]
fn main() -> Result<(), Box<dyn Error>> {
    println!("LoopAutoma input recorder helper\n===============================");
    println!("This tool reuses the Linux input recorder backend.\n");
    prompt("Press Enter to start recording...");
    wait_for_enter()?;

    let mut capture = LinuxInputCapture::default();
    let events = Arc::new(Mutex::new(Vec::<InputEvent>::new()));
    let events_sink = events.clone();
    
    eprintln!("[DEBUG] Starting capture...");
    capture.start(Arc::new(move |event| {
        eprintln!("[DEBUG] Event received: {:?}", event);
        if let Ok(mut guard) = events_sink.lock() {
            guard.push(event);
        }
    }))?;
    eprintln!("[DEBUG] Capture started successfully!");

    println!("Recording... move mouse, type keys, click. Press Enter to stop.");
    wait_for_enter()?;
    capture.stop()?;
    
    // Give the capture thread time to flush any pending events
    thread::sleep(Duration::from_millis(100));

    let snapshot = {
        let guard = events.lock().expect("event buffer poisoned");
        guard.clone()
    };
    if snapshot.is_empty() {
        println!("\n⚠️  Captured 0 events!");
        println!("\nPossible issues:");
        println!("  • Did you interact with the system BEFORE pressing Enter?");
        println!("  • Are you running on an X11 session? (Check: echo $XDG_SESSION_TYPE)");
        println!("  • Is LOOPAUTOMA_BACKEND=fake set? (Should be unset)");
        println!("  • Do you have the required X11 packages installed?");
        return Ok(());
    }
    
    println!(
        "Captured {} events. Replaying to stdout in 5 seconds...",
        snapshot.len()
    );
    thread::sleep(Duration::from_secs(5));

    println!("keyboard: {}", summarize_keyboard(&snapshot));
    println!("mouse: {}", summarize_mouse(&snapshot));

    Ok(())
}

#[cfg(feature = "os-linux-input")]
fn prompt(message: &str) {
    print!("{}", message);
    let _ = io::stdout().flush();
}

#[cfg(feature = "os-linux-input")]
fn wait_for_enter() -> io::Result<()> {
    let mut buf = String::new();
    io::stdin().read_line(&mut buf).map(|_| ())
}

#[cfg(feature = "os-linux-input")]
fn summarize_keyboard(events: &[InputEvent]) -> String {
    let mut output = String::new();
    for event in events {
        if let InputEvent::Keyboard(key) = event {
            if key.state != KeyState::Down {
                continue;
            }
            if let Some(text) = &key.text {
                output.push_str(text);
                continue;
            }
            let fragment = match key.key.as_str() {
                "Return" | "Enter" => "[Enter]".to_string(),
                "Space" => " ".to_string(),
                "Tab" => "[Tab]".to_string(),
                other if other.len() == 1 => other.to_string(),
                other => format!("[{other}]"),
            };
            output.push_str(&fragment);
        }
    }
    if output.trim().is_empty() {
        "(no key presses)".to_string()
    } else {
        output
    }
}

#[cfg(feature = "os-linux-input")]
fn summarize_mouse(events: &[InputEvent]) -> String {
    let mut clicks = Vec::new();
    for event in events {
        if let InputEvent::Mouse(mouse) = event {
            if let MouseEventType::ButtonDown(button) = mouse.event_type {
                clicks.push(format!(
                    "x={:.0}, y={:.0}, {}",
                    mouse.x,
                    mouse.y,
                    button_label(button)
                ));
            }
        }
    }
    if clicks.is_empty() {
        "(no clicks)".to_string()
    } else {
        clicks.join(" | ")
    }
}

#[cfg(feature = "os-linux-input")]
fn button_label(button: MouseButton) -> &'static str {
    match button {
        MouseButton::Left => "left click",
        MouseButton::Right => "right click",
        MouseButton::Middle => "middle click",
    }
}
