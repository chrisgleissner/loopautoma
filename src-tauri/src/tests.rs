#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use crate::action::{Click, Key, MoveCursor, TypeText};
    use crate::build_monitor_from_profile;
    use crate::condition::RegionCondition;
    use crate::domain::{
        Action, ActionSequence, Automation, BackendError, Condition, DisplayInfo, Guardrails,
        MouseButton, Rect, Region, ScreenCapture, ScreenFrame, Trigger,
    };
    use crate::domain::{ActionConfig, ConditionConfig, GuardrailsConfig, Profile, TriggerConfig};
    use crate::finalize_monitor_shutdown;
    use crate::monitor::Monitor;
    use crate::trigger::IntervalTrigger;

    fn capture_region_stub() -> Result<ScreenFrame, BackendError> {
        Err(BackendError::new(
            "fake_capture",
            "hash-only test capture stub",
        ))
    }
    fn displays_stub() -> Result<Vec<DisplayInfo>, BackendError> {
        Ok(vec![])
    }

    struct FakeCap {
        seq: Vec<u64>,
    }
    impl ScreenCapture for FakeCap {
        fn hash_region(&self, _region: &Region, _downscale: u32) -> u64 {
            self.seq[0]
        }
        fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
            capture_region_stub()
        }
        fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
            displays_stub()
        }
    }

    struct FakeAuto {
        pub calls: std::sync::Mutex<Vec<String>>,
    }
    impl FakeAuto {
        fn new() -> Self {
            Self {
                calls: std::sync::Mutex::new(vec![]),
            }
        }
    }
    impl Automation for FakeAuto {
        fn move_cursor(&self, x: u32, y: u32) -> Result<(), String> {
            self.calls.lock().unwrap().push(format!("move:{x},{y}"));
            Ok(())
        }
        fn click(&self, button: MouseButton) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("click:{:?}", button));
            Ok(())
        }
        fn type_text(&self, text: &str) -> Result<(), String> {
            self.calls.lock().unwrap().push(format!("type:{text}"));
            Ok(())
        }
        fn key(&self, key: &str) -> Result<(), String> {
            self.calls.lock().unwrap().push(format!("key:{key}"));
            Ok(())
        }
    }

    #[test]
    fn interval_trigger_fires_on_interval() {
        let mut t = IntervalTrigger::new(Duration::from_millis(100));
        let t0 = Instant::now();
        assert!(t.should_fire(t0));
        assert!(!t.should_fire(t0 + Duration::from_millis(50)));
        assert!(t.should_fire(t0 + Duration::from_millis(100)));
    }

    #[test]
    fn region_condition_reports_stable_after_duration() {
        let mut c = RegionCondition::new(Duration::from_millis(200), 4);
        let r = Region {
            id: "r1".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            },
            name: None,
        };
        let cap = FakeCap { seq: vec![42] };
        let t0 = Instant::now();
        // first evaluate: not yet stable
        assert!(!c.evaluate(t0, &[r.clone()], &cap));
        // before stable duration
        assert!(!c.evaluate(t0 + Duration::from_millis(150), &[r.clone()], &cap));
        // after stable duration
        assert!(c.evaluate(t0 + Duration::from_millis(250), &[r], &cap));
    }

    #[test]
    fn action_sequence_runs_all_actions() {
        let auto = FakeAuto::new();
        let seq = ActionSequence::new(vec![
            Box::new(MoveCursor { x: 10, y: 20 }) as Box<dyn Action + Send + Sync>,
            Box::new(Click {
                button: MouseButton::Left,
            }),
            Box::new(TypeText {
                text: "continue".into(),
            }),
            Box::new(Key {
                key: "Enter".into(),
            }),
        ]);
        let mut events = vec![];
        let ok = seq.run(&auto, &mut events);
        assert!(ok);
        let calls = auto.calls.lock().unwrap().clone();
        assert_eq!(
            calls,
            vec!["move:10,20", "click:Left", "type:continue", "key:Enter"]
        );
        // Each action emits started and completed
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, crate::domain::Event::ActionStarted { .. }))
                .count(),
            4
        );
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(
                    e,
                    crate::domain::Event::ActionCompleted { success: true, .. }
                ))
                .count(),
            4
        );
    }

    struct AlwaysTrigger; // fires on every tick
    impl Trigger for AlwaysTrigger {
        fn should_fire(&mut self, _now: Instant) -> bool {
            true
        }
    }

    #[test]
    fn monitor_activates_once_when_condition_true() {
        let mut monitor = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(Duration::from_millis(50), 4)),
            ActionSequence::new(vec![
                Box::new(TypeText {
                    text: "continue".into(),
                }) as Box<dyn Action + Send + Sync>,
                Box::new(Key {
                    key: "Enter".into(),
                }),
            ]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: Some(10),
            },
        );
        let r = Region {
            id: "r1".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            },
            name: None,
        };
        let cap = FakeCap { seq: vec![123] };
        let auto = FakeAuto::new();
        let mut events = vec![];
        let t0 = Instant::now();
        monitor.start(&mut events);
        // first ticks: condition not yet stable
        monitor.tick(t0, &[r.clone()], &cap, &auto, &mut events);
        monitor.tick(
            t0 + Duration::from_millis(40),
            &[r.clone()],
            &cap,
            &auto,
            &mut events,
        );
        // after stable period
        monitor.tick(
            t0 + Duration::from_millis(60),
            &[r],
            &cap,
            &auto,
            &mut events,
        );
        assert_eq!(monitor.activations, 1);
        let calls = auto.calls.lock().unwrap().clone();
        assert_eq!(calls, vec!["type:continue", "key:Enter"]);
    }

    #[test]
    fn profile_driven_monitor_emits_events_and_respects_cooldown() {
        // Build a Profile matching the architecture schema (simplified)
        let profile = Profile {
            id: "p1".into(),
            name: "MVP".into(),
            regions: vec![Region {
                id: "r1".into(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                },
                name: None,
            }],
            trigger: TriggerConfig {
                r#type: "IntervalTrigger".into(),
                check_interval_sec: 0.1,
            },
            condition: ConditionConfig {
                r#type: "RegionCondition".into(),
                stable_ms: 30,
                downscale: 4,
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
                max_runtime_ms: Some(10_000),
                max_activations_per_hour: Some(5),
                cooldown_ms: 100,
            }),
        };

        let (mut mon, regions) = build_monitor_from_profile(&profile);

        // Use our fakes just like the runtime path
        struct Cap;
        impl ScreenCapture for Cap {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                1
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        struct Auto;
        impl Automation for Auto {
            fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> {
                Ok(())
            }
            fn click(&self, _b: MouseButton) -> Result<(), String> {
                Ok(())
            }
            fn type_text(&self, _t: &str) -> Result<(), String> {
                Ok(())
            }
            fn key(&self, _k: &str) -> Result<(), String> {
                Ok(())
            }
        }
        let cap = Cap;
        let auto = Auto;

        let mut events = vec![];
        mon.start(&mut events);
        assert!(matches!(
            events.last(),
            Some(crate::domain::Event::MonitorStateChanged { .. })
        ));
        let t0 = Instant::now();
        // tick until stable
        mon.tick(t0, &regions, &cap, &auto, &mut events);
        mon.tick(
            t0 + Duration::from_millis(200),
            &regions,
            &cap,
            &auto,
            &mut events,
        );
        mon.tick(
            t0 + Duration::from_millis(400),
            &regions,
            &cap,
            &auto,
            &mut events,
        );
        // After cooldown, second activation still rate-limited by max/hour and cooldown
        mon.tick(
            t0 + Duration::from_millis(700),
            &regions,
            &cap,
            &auto,
            &mut events,
        );
        // Ensure at least one activation and appropriate events exist
        assert!(events
            .iter()
            .any(|e| matches!(e, crate::domain::Event::TriggerFired)));
        assert!(events
            .iter()
            .any(|e| matches!(e, crate::domain::Event::ConditionEvaluated { .. })));
        assert!(events
            .iter()
            .any(|e| matches!(e, crate::domain::Event::ActionStarted { .. })));
        assert!(events.iter().any(|e| matches!(
            e,
            crate::domain::Event::ActionCompleted { success: true, .. }
        )));
    }

    #[test]
    fn guardrail_trips_on_max_runtime() {
        use crate::monitor::Monitor;
        // Small guardrails to trigger quickly
        let mut m = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(Duration::from_millis(0), 1)),
            ActionSequence::new(vec![]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: Some(Duration::from_millis(1)),
                max_activations_per_hour: None,
            },
        );
        let r = Region {
            id: "r".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
            name: None,
        };
        struct C;
        impl ScreenCapture for C {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                0
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        struct A;
        impl Automation for A {
            fn move_cursor(&self, _: u32, _: u32) -> Result<(), String> {
                Ok(())
            }
            fn click(&self, _: MouseButton) -> Result<(), String> {
                Ok(())
            }
            fn type_text(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
            fn key(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
        }
        let cap = C;
        let auto = A;
        let mut evs = vec![];
        m.start(&mut evs);
        let t0 = Instant::now();
        m.tick(t0, &[r.clone()], &cap, &auto, &mut evs);
        // Simulate after max runtime
        m.tick(t0 + Duration::from_millis(2), &[r], &cap, &auto, &mut evs);
        assert!(evs.iter().any(|e| match e {
            crate::domain::Event::WatchdogTripped { reason } if reason == "max_runtime" => true,
            _ => false,
        }));
    }

    #[test]
    fn guardrail_trips_on_max_activations_per_hour() {
        use crate::monitor::Monitor;
        let mut m = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(Duration::from_millis(0), 1)),
            ActionSequence::new(vec![
                Box::new(TypeText { text: "x".into() }) as Box<dyn Action + Send + Sync>
            ]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: Some(1),
            },
        );
        let r = Region {
            id: "r".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
            name: None,
        };
        struct C;
        impl ScreenCapture for C {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                0
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        struct A;
        impl Automation for A {
            fn move_cursor(&self, _: u32, _: u32) -> Result<(), String> {
                Ok(())
            }
            fn click(&self, _: MouseButton) -> Result<(), String> {
                Ok(())
            }
            fn type_text(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
            fn key(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
        }
        let cap = C;
        let auto = A;
        let mut evs = vec![];
        m.start(&mut evs);
        let t0 = Instant::now();
        // First tick: initializes condition state (not yet stable)
        m.tick(t0, &[r.clone()], &cap, &auto, &mut evs);
        // Second tick: first activation occurs (stable reached)
        m.tick(
            t0 + Duration::from_millis(1),
            &[r.clone()],
            &cap,
            &auto,
            &mut evs,
        );
        // Third tick: should trip rate limit (max_activations_per_hour)
        m.tick(t0 + Duration::from_millis(2), &[r], &cap, &auto, &mut evs);
        assert!(evs.iter().any(|e| match e {
            crate::domain::Event::WatchdogTripped { reason }
                if reason == "max_activations_per_hour" =>
                true,
            _ => false,
        }));
    }

    #[test]
    fn max_activations_window_resets_after_an_hour() {
        use crate::monitor::Monitor;
        let mut m = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(Duration::from_millis(0), 1)),
            ActionSequence::new(vec![
                Box::new(TypeText { text: "x".into() }) as Box<dyn Action + Send + Sync>
            ]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: Some(1),
            },
        );
        let r = Region {
            id: "r".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
            name: None,
        };
        struct C;
        impl ScreenCapture for C {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                0
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        struct A;
        impl Automation for A {
            fn move_cursor(&self, _: u32, _: u32) -> Result<(), String> {
                Ok(())
            }
            fn click(&self, _: MouseButton) -> Result<(), String> {
                Ok(())
            }
            fn type_text(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
            fn key(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
        }
        let cap = C;
        let auto = A;
        let mut evs = vec![];
        m.start(&mut evs);
        let t0 = Instant::now();
        // First tick initializes hashes; second tick performs the first activation.
        m.tick(t0, &[r.clone()], &cap, &auto, &mut evs);
        m.tick(
            t0 + Duration::from_millis(1),
            &[r.clone()],
            &cap,
            &auto,
            &mut evs,
        );
        // Third tick occurs inside the 1h window and should trip the guardrail.
        m.tick(
            t0 + Duration::from_millis(2),
            &[r.clone()],
            &cap,
            &auto,
            &mut evs,
        );
        assert!(evs.iter().any(|e| matches!(e, crate::domain::Event::WatchdogTripped{reason} if reason == "max_activations_per_hour")));
        let before = m.activations;
        m.tick(
            t0 + Duration::from_secs(3600) + Duration::from_millis(5),
            &[r],
            &cap,
            &auto,
            &mut evs,
        );
        assert!(
            m.activations > before,
            "activation count should increase after one hour window"
        );
    }

    #[test]
    fn e2e_happy_path_emits_expected_sequence() {
        // This test simulates the full happy path using the same profile-driven builder
        // and fake backends, asserting that the expected event ordering occurs once.
        let profile = Profile {
            id: "p-e2e".into(),
            name: "E2E Happy".into(),
            regions: vec![Region {
                id: "r1".into(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                },
                name: None,
            }],
            trigger: TriggerConfig {
                r#type: "IntervalTrigger".into(),
                check_interval_sec: 0.1,
            },
            condition: ConditionConfig {
                r#type: "RegionCondition".into(),
                stable_ms: 1,
                downscale: 1,
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
                max_runtime_ms: Some(10_000),
                max_activations_per_hour: Some(5),
                cooldown_ms: 0,
            }),
        };

        let (mut mon, regions) = build_monitor_from_profile(&profile);

        // Use deterministic fakes: constant hash (no visual change) and no-op automation
        struct Cap;
        impl ScreenCapture for Cap {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                42
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        struct Auto;
        impl Automation for Auto {
            fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> {
                Ok(())
            }
            fn click(&self, _b: MouseButton) -> Result<(), String> {
                Ok(())
            }
            fn type_text(&self, _t: &str) -> Result<(), String> {
                Ok(())
            }
            fn key(&self, _k: &str) -> Result<(), String> {
                Ok(())
            }
        }
        let cap = Cap;
        let auto = Auto;

        let mut events = vec![];
        mon.start(&mut events);
        let t0 = Instant::now();
        // Run a few ticks to allow condition to stabilize and one activation to occur
        mon.tick(t0, &regions, &cap, &auto, &mut events);
        mon.tick(
            t0 + Duration::from_millis(200),
            &regions,
            &cap,
            &auto,
            &mut events,
        );

        // Extract first occurrence indices for the expected sequence
        let idx_running = events.iter().position(|e| matches!(e, crate::domain::Event::MonitorStateChanged { state } if *state == crate::domain::MonitorState::Running)).expect("running event");
        let idx_trigger = events
            .iter()
            .position(|e| matches!(e, crate::domain::Event::TriggerFired))
            .expect("trigger");
        let idx_condition_true = events
            .iter()
            .position(
                |e| matches!(e, crate::domain::Event::ConditionEvaluated { result } if *result),
            )
            .expect("condition true");
        let idx_action_start = events
            .iter()
            .position(|e| matches!(e, crate::domain::Event::ActionStarted { .. }))
            .expect("action started");
        let idx_action_done = events
            .iter()
            .position(
                |e| matches!(e, crate::domain::Event::ActionCompleted { success, .. } if *success),
            )
            .expect("action completed");

        assert!(
            idx_running < idx_trigger,
            "Monitor should start before first trigger"
        );
        assert!(
            idx_trigger <= idx_condition_true,
            "Trigger precedes condition evaluation true"
        );
        assert!(
            idx_condition_true <= idx_action_start,
            "Condition true precedes first action start"
        );
        assert!(
            idx_action_start <= idx_action_done,
            "Action start precedes completed"
        );
    }

    #[test]
    fn soak_run_time_dilated_with_guardrails_stable() {
        // Long-ish loop with small cooldown to simulate ongoing operation.
        let mut m = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(Duration::from_millis(0), 1)),
            ActionSequence::new(vec![Box::new(TypeText {
                text: "tick".into(),
            }) as Box<dyn Action + Send + Sync>]),
            Guardrails {
                cooldown: Duration::from_millis(1),
                max_runtime: Some(Duration::from_millis(5)),
                max_activations_per_hour: Some(1_000_000),
            },
        );
        let r = Region {
            id: "r1".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
            name: None,
        };
        struct C;
        impl ScreenCapture for C {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                0
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        struct A;
        impl Automation for A {
            fn move_cursor(&self, _: u32, _: u32) -> Result<(), String> {
                Ok(())
            }
            fn click(&self, _: MouseButton) -> Result<(), String> {
                Ok(())
            }
            fn type_text(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
            fn key(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
        }
        let cap = C;
        let auto = A;
        let mut evs = vec![];
        m.start(&mut evs);
        let t0 = Instant::now();
        // Run ~100 ticks in a few ms of simulated time; guardrail should trip and stop early.
        for i in 0..100 {
            m.tick(
                t0 + Duration::from_millis(i.min(10) as u64),
                &[r.clone()],
                &cap,
                &auto,
                &mut evs,
            );
        }
        // Ensure we tripped max_runtime and transitioned to Stopped at least once.
        assert!(evs.iter().any(|e| matches!(e, crate::domain::Event::WatchdogTripped{reason} if reason == "max_runtime")));
        // No panics, and last state is stopped
        assert!(evs.iter().rev().any(|e| matches!(e, crate::domain::Event::MonitorStateChanged{ state } if *state == crate::domain::MonitorState::Stopped)));
        assert!(
            m.started_at.is_none(),
            "monitor should be fully stopped after guardrail trip"
        );
    }

    #[test]
    fn panic_stop_helper_emits_watchdog_and_stop_state() {
        let mut m = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(Duration::from_millis(0), 1)),
            ActionSequence::new(vec![]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: None,
            },
        );
        let mut evs = vec![];
        m.start(&mut evs);
        assert!(m.started_at.is_some());
        let shutdown_events = finalize_monitor_shutdown(&mut m, true);
        assert!(shutdown_events.iter().any(
            |e| matches!(e, crate::domain::Event::WatchdogTripped{reason} if reason == "panic_stop")
        ));
        assert!(shutdown_events.iter().any(|e| matches!(e, crate::domain::Event::MonitorStateChanged{ state } if *state == crate::domain::MonitorState::Stopped)));
        assert!(m.started_at.is_none());
        let graceful_events = finalize_monitor_shutdown(&mut m, false);
        assert!(graceful_events
            .iter()
            .all(|e| !matches!(e, crate::domain::Event::WatchdogTripped { .. })));
    }

    #[test]
    fn region_condition_handles_empty_regions() {
        let mut c = RegionCondition::new(Duration::from_millis(100), 4);
        let cap = FakeCap { seq: vec![42] };
        let t0 = Instant::now();
        // No regions means stable immediately (vacuously true)
        assert!(c.evaluate(t0, &[], &cap));
    }

    #[test]
    fn region_condition_resets_on_hash_change() {
        let mut c = RegionCondition::new(Duration::from_millis(200), 4);
        let r = Region {
            id: "r1".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            },
            name: None,
        };
        // First hash: 42
        struct Cap1;
        impl ScreenCapture for Cap1 {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                42
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        let cap1 = Cap1;
        let t0 = Instant::now();
        assert!(!c.evaluate(t0, &[r.clone()], &cap1)); // first eval: not stable yet
        assert!(!c.evaluate(t0 + Duration::from_millis(150), &[r.clone()], &cap1)); // still not stable
                                                                                    // Hash changes to 99
        struct Cap2;
        impl ScreenCapture for Cap2 {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                99
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        let cap2 = Cap2;
        // Even after stable duration, change resets timer
        assert!(!c.evaluate(t0 + Duration::from_millis(250), &[r.clone()], &cap2)); // hash changed, reset
                                                                                    // Must wait another stable_ms from t250
        assert!(!c.evaluate(t0 + Duration::from_millis(400), &[r.clone()], &cap2)); // still not stable
        assert!(c.evaluate(t0 + Duration::from_millis(460), &[r], &cap2)); // now stable
    }

    #[test]
    fn action_sequence_stops_on_first_failure() {
        let auto = FakeAuto::new();
        struct FailAction;
        impl Action for FailAction {
            fn name(&self) -> &'static str {
                "Fail"
            }
            fn execute(&self, _: &dyn Automation) -> Result<(), String> {
                Err("intentional failure".into())
            }
        }
        let seq = ActionSequence::new(vec![
            Box::new(TypeText {
                text: "before".into(),
            }) as Box<dyn Action + Send + Sync>,
            Box::new(FailAction),
            Box::new(TypeText {
                text: "after".into(),
            }),
        ]);
        let mut events = vec![];
        let ok = seq.run(&auto, &mut events);
        assert!(!ok);
        let calls = auto.calls.lock().unwrap().clone();
        // "before" should execute, "after" should not
        assert_eq!(calls, vec!["type:before"]);
        // Check error event was emitted
        assert!(events
            .iter()
            .any(|e| matches!(e, crate::domain::Event::Error { .. })));
        // Check failure completion event
        assert!(events.iter().any(|e| matches!(e, crate::domain::Event::ActionCompleted{action, success: false} if action == "Fail")));
    }

    #[test]
    fn monitor_cooldown_prevents_immediate_reactivation() {
        let mut m = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(Duration::from_millis(0), 1)),
            ActionSequence::new(vec![
                Box::new(TypeText { text: "x".into() }) as Box<dyn Action + Send + Sync>
            ]),
            Guardrails {
                cooldown: Duration::from_millis(100),
                max_runtime: None,
                max_activations_per_hour: None,
            },
        );
        let r = Region {
            id: "r".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
            name: None,
        };
        struct C;
        impl ScreenCapture for C {
            fn hash_region(&self, _r: &Region, _d: u32) -> u64 {
                0
            }
            fn capture_region(&self, _region: &Region) -> Result<ScreenFrame, BackendError> {
                capture_region_stub()
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                displays_stub()
            }
        }
        let cap = C;
        let auto = FakeAuto::new();
        let mut evs = vec![];
        m.start(&mut evs);
        let t0 = Instant::now();
        // First tick: condition initializes (not stable)
        m.tick(t0, &[r.clone()], &cap, &auto, &mut evs);
        // Second tick: condition becomes stable, first activation
        m.tick(
            t0 + Duration::from_millis(1),
            &[r.clone()],
            &cap,
            &auto,
            &mut evs,
        );
        assert_eq!(m.activations, 1);
        // Third tick: still in cooldown, no activation
        m.tick(
            t0 + Duration::from_millis(50),
            &[r.clone()],
            &cap,
            &auto,
            &mut evs,
        );
        assert_eq!(m.activations, 1);
        // Fourth tick: after cooldown, second activation
        m.tick(t0 + Duration::from_millis(110), &[r], &cap, &auto, &mut evs);
        assert_eq!(m.activations, 2);
    }

    #[test]
    fn fakes_provide_deterministic_data() {
        use crate::fakes::{FakeAutomation, FakeCapture};
        let cap = FakeCapture;
        let r = Region {
            id: "test".into(),
            rect: Rect {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            },
            name: None,
        };
        let h1 = cap.hash_region(&r, 4);
        let h2 = cap.hash_region(&r, 4);
        assert_eq!(h1, h2); // consistent hash
        let frame = cap.capture_region(&r).unwrap();
        assert_eq!(frame.width, 100);
        assert_eq!(frame.height, 100);
        assert_eq!(frame.bytes.len(), 100 * 100 * 4);
        let displays = cap.displays().unwrap();
        assert_eq!(displays.len(), 1);
        let auto = FakeAutomation;
        assert!(auto.move_cursor(10, 20).is_ok());
        assert!(auto.click(MouseButton::Left).is_ok());
        assert!(auto.type_text("test").is_ok());
        assert!(auto.key("Enter").is_ok());
    }

    #[test]
    fn soak_runner_reports_guardrail_trip() {
        let mut cfg = crate::SoakConfig::default();
        cfg.ticks = 5_000;
        cfg.check_interval_sec = 0.25;
        cfg.max_runtime_ms = 200;
        let report = crate::run_soak(&cfg);
        assert!(report.ticks_executed <= cfg.ticks);
        assert!(report
            .guardrail_trips
            .iter()
            .any(|reason| reason == "max_runtime"));
        assert_eq!(report.action_failures, 0);
    }
}
