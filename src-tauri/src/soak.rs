use serde::Serialize;
use std::time::{Duration, Instant};

use crate::domain::{
    ActionConfig, ConditionConfig, Event, GuardrailsConfig, Profile, Rect, Region, TriggerConfig,
};
use crate::fakes::{FakeAutomation, FakeCapture};

#[derive(Debug, Clone, Copy, Serialize)]
pub struct SoakConfig {
    pub ticks: u64,
    pub interval_ms: u64,
    pub stable_ms: u64,
    pub cooldown_ms: u64,
    pub max_runtime_ms: u64,
    pub downscale: u32,
}

impl Default for SoakConfig {
    fn default() -> Self {
        Self {
            ticks: 25_000,
            interval_ms: 100,
            stable_ms: 80,
            cooldown_ms: 50,
            max_runtime_ms: 2_000,
            downscale: 4,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SoakReport {
    pub tick_budget: u64,
    pub ticks_executed: u64,
    pub activations: u32,
    pub guardrail_trips: Vec<String>,
    pub error_events: Vec<String>,
    pub action_failures: u32,
    pub runtime_ms_simulated: u128,
}

impl SoakReport {
    fn new(budget: u64) -> Self {
        Self {
            tick_budget: budget,
            ticks_executed: 0,
            activations: 0,
            guardrail_trips: Vec::new(),
            error_events: Vec::new(),
            action_failures: 0,
            runtime_ms_simulated: 0,
        }
    }
}

pub fn run_soak(config: &SoakConfig) -> SoakReport {
    let profile = build_profile(config);
    let (mut monitor, regions) = crate::build_monitor_from_profile(&profile);
    let capture = FakeCapture;
    let automation = FakeAutomation;

    let mut report = SoakReport::new(config.ticks);
    let mut events = vec![];
    monitor.start(&mut events);
    process_events(&mut report, events);

    let mut now = Instant::now();
    for _ in 0..config.ticks {
        let mut tick_events = vec![];
        monitor.tick(now, &regions, &capture, &automation, &mut tick_events);
        report.ticks_executed += 1;
        process_events(&mut report, tick_events);
        if monitor.started_at.is_none() {
            break;
        }
        now += Duration::from_millis(config.interval_ms);
    }

    if monitor.started_at.is_some() {
        let shutdown = crate::finalize_monitor_shutdown(&mut monitor, false);
        process_events(&mut report, shutdown);
    }

    report.activations = monitor.activations;
    report.runtime_ms_simulated = (report.ticks_executed as u128) * (config.interval_ms as u128);
    report
}

fn build_profile(config: &SoakConfig) -> Profile {
    Profile {
        id: "soak-profile".into(),
        name: "Soak Profile".into(),
        regions: vec![Region {
            id: "soak-region".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 640,
                height: 400,
            },
            name: Some("Soak".into()),
        }],
        trigger: TriggerConfig {
            r#type: "IntervalTrigger".into(),
            interval_ms: config.interval_ms,
        },
        condition: ConditionConfig {
            r#type: "RegionCondition".into(),
            stable_ms: config.stable_ms,
            downscale: config.downscale,
        },
        actions: vec![
            ActionConfig::Type {
                text: "continue".into(),
            },
            ActionConfig::Key {
                key: "Enter".into(),
            },
        ],
        guardrails: Some(GuardrailsConfig {
            max_runtime_ms: Some(config.max_runtime_ms),
            max_activations_per_hour: Some((3_600_000u64 / config.cooldown_ms.max(1)).max(1) as u32),
            cooldown_ms: config.cooldown_ms,
        }),
    }
}

fn process_events(report: &mut SoakReport, events: Vec<Event>) {
    for event in events {
        match event {
            Event::WatchdogTripped { reason } => report.guardrail_trips.push(reason),
            Event::Error { message } => report.error_events.push(message),
            Event::ActionCompleted { success, .. } if !success => report.action_failures += 1,
            _ => {}
        }
    }
}
