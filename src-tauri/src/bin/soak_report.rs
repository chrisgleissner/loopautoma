use std::env;
use std::process::ExitCode;

use loopautoma_lib::{run_soak, SoakConfig};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    match run_with_args(&args) {
        Ok(_) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("{err}");
            eprintln!("Usage: cargo run --bin soak_report -- [--ticks N] [--interval-ms N] [--stable-ms N] [--cooldown-ms N] [--max-runtime-ms N] [--downscale N]");
            ExitCode::FAILURE
        }
    }
}

fn run_with_args(args: &[String]) -> Result<(), String> {
    let mut cfg = SoakConfig::default();
    let mut i = 0;
    while i < args.len() {
        let flag = &args[i];
        let value = args
            .get(i + 1)
            .ok_or_else(|| format!("Missing value for {flag}"))?;
        match flag.as_str() {
            "--ticks" => cfg.ticks = parse_u64(value, flag)?,
            "--interval-ms" => cfg.interval_ms = parse_u64(value, flag)?,
            "--stable-ms" => cfg.stable_ms = parse_u64(value, flag)?,
            "--cooldown-ms" => cfg.cooldown_ms = parse_u64(value, flag)?,
            "--max-runtime-ms" => cfg.max_runtime_ms = parse_u64(value, flag)?,
            "--downscale" => cfg.downscale = parse_u32(value, flag)?,
            _ => return Err(format!("Unknown flag {flag}")),
        }
        i += 2;
    }

    let report = run_soak(&cfg);
    let json = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;
    println!("{json}");
    Ok(())
}

fn parse_u64(value: &str, flag: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|_| format!("Invalid numeric value for {flag}: {value}"))
}

fn parse_u32(value: &str, flag: &str) -> Result<u32, String> {
    value
        .parse::<u32>()
        .map_err(|_| format!("Invalid numeric value for {flag}: {value}"))
}
