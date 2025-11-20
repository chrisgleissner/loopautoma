#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use crate::action::{Click, MoveCursor, TypeText};
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
    fn region_condition_reports_stable_after_consecutive_checks() {
        let mut c = RegionCondition::new(4, false); // expect_change=false means trigger when NO change
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
        // First 3 evaluations: not yet 4 consecutive no-change states
        assert!(!c.evaluate(t0, &[r.clone()], &cap));
        assert!(!c.evaluate(t0 + Duration::from_millis(50), &[r.clone()], &cap));
        assert!(!c.evaluate(t0 + Duration::from_millis(100), &[r.clone()], &cap));
        // 4th consecutive evaluation with same hash: should trigger
        assert!(c.evaluate(t0 + Duration::from_millis(150), &[r], &cap));
    }

    #[test]
    fn action_sequence_runs_all_actions() {
        let auto = FakeAuto::new();
        // Click action now includes x,y,button; Type handles special keys with inline syntax
        let seq = ActionSequence::new(vec![
            Box::new(MoveCursor { x: 10, y: 20 }) as Box<dyn Action + Send + Sync>,
            Box::new(Click {
                button: MouseButton::Left,
            }),
            Box::new(TypeText {
                text: "continue".into(),
            }),
            Box::new(TypeText {
                text: "{Key:Enter}".into(),
            }),
        ]);
        let mut events = vec![];
        let mut context = crate::domain::ActionContext::new();
        let ok = seq.run(&auto, &mut context, &mut events);
        assert!(ok);
        let calls = auto.calls.lock().unwrap().clone();
        // TypeText with inline syntax {Key:Enter} is converted to automation.key("Enter")
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
        fn time_until_next_ms(&self, _now: Instant) -> u64 {
            0 // Always ready
        }
    }

    #[test]
    fn monitor_activates_once_when_condition_true() {
        let mut monitor = Monitor::new(
            Box::new(AlwaysTrigger),
            Box::new(RegionCondition::new(4, false)),
            ActionSequence::new(vec![
                Box::new(TypeText {
                    text: "continue".into(),
                }) as Box<dyn Action + Send + Sync>,
                Box::new(TypeText {
                    text: "{Key:Enter}".into(),
                }),
            ]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: Some(10),
                heartbeat_timeout: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
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
        // Need 4 consecutive ticks with same hash to trigger (expect_change=false, consecutive_checks=4)
        monitor.tick(t0, &[r.clone()], &cap, &auto, &mut events); // check 1
        monitor.tick(
            t0 + Duration::from_millis(20),
            &[r.clone()],
            &cap,
            &auto,
            &mut events,
        ); // check 2
        monitor.tick(
            t0 + Duration::from_millis(40),
            &[r.clone()],
            &cap,
            &auto,
            &mut events,
        ); // check 3
        monitor.tick(
            t0 + Duration::from_millis(60),
            &[r],
            &cap,
            &auto,
            &mut events,
        ); // check 4: should trigger action sequence
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
                consecutive_checks: 1,
                expect_change: false,
            },
            actions: vec![
                ActionConfig::Type {
                    text: "continue".into(),
                },
                ActionConfig::Type {
                    text: "{Key:Enter}".into(),
                },
            ],
            guardrails: Some(GuardrailsConfig {
                max_runtime_ms: Some(10_000),
                max_activations_per_hour: Some(5),
                cooldown_ms: 100,
                heartbeat_timeout_ms: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
            }),
        };

        let (mut mon, regions) = build_monitor_from_profile(&profile, None, None);

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
            Box::new(RegionCondition::new(1, false)),
            ActionSequence::new(vec![]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: Some(Duration::from_millis(1)),
                max_activations_per_hour: None,
                heartbeat_timeout: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
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
            Box::new(RegionCondition::new(1, false)),
            ActionSequence::new(vec![
                Box::new(TypeText { text: "x".into() }) as Box<dyn Action + Send + Sync>
            ]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: Some(1),
                heartbeat_timeout: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
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
            Box::new(RegionCondition::new(1, false)),
            ActionSequence::new(vec![
                Box::new(TypeText { text: "x".into() }) as Box<dyn Action + Send + Sync>
            ]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: Some(1),
                heartbeat_timeout: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
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
                consecutive_checks: 1,
                expect_change: false,
            },
            actions: vec![
                ActionConfig::Type {
                    text: "continue".into(),
                },
                ActionConfig::Type {
                    text: "{Key:Enter}".into(),
                },
            ],
            guardrails: Some(GuardrailsConfig {
                max_runtime_ms: Some(10_000),
                max_activations_per_hour: Some(5),
                cooldown_ms: 0,
                heartbeat_timeout_ms: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
            }),
        };

        let (mut mon, regions) = build_monitor_from_profile(&profile, None, None);

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
            Box::new(RegionCondition::new(1, false)),
            ActionSequence::new(vec![Box::new(TypeText {
                text: "tick".into(),
            }) as Box<dyn Action + Send + Sync>]),
            Guardrails {
                cooldown: Duration::from_millis(1),
                max_runtime: Some(Duration::from_millis(5)),
                max_activations_per_hour: Some(1_000_000),
                heartbeat_timeout: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
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
            Box::new(RegionCondition::new(1, false)),
            ActionSequence::new(vec![]),
            Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: None,
                heartbeat_timeout: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
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
        let mut c = RegionCondition::new(1, false); // 1 consecutive check required
        let cap = FakeCap { seq: vec![42] };
        let t0 = Instant::now();
        // No regions means condition met immediately (vacuously true - no change to detect)
        assert!(c.evaluate(t0, &[], &cap));
    }

    #[test]
    fn region_condition_resets_on_hash_change() {
        let mut c = RegionCondition::new(4, false); // expect_change=false, need 4 consecutive no-change checks
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
        assert!(!c.evaluate(t0, &[r.clone()], &cap1)); // check 1: no-change
        assert!(!c.evaluate(t0 + Duration::from_millis(50), &[r.clone()], &cap1)); // check 2: no-change
        assert!(!c.evaluate(t0 + Duration::from_millis(100), &[r.clone()], &cap1)); // check 3: no-change
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
        // Hash changed (42→99), so any_changed=true, flips state to "change", consecutive=1
        assert!(!c.evaluate(t0 + Duration::from_millis(150), &[r.clone()], &cap2));
        // Now hash is stable at 99, so any_changed=false, flips state back to "no-change", consecutive=1
        assert!(!c.evaluate(t0 + Duration::from_millis(200), &[r.clone()], &cap2));
        // Continue with same hash: no-change, consecutive=2
        assert!(!c.evaluate(t0 + Duration::from_millis(250), &[r.clone()], &cap2));
        // Continue: no-change, consecutive=3
        assert!(!c.evaluate(t0 + Duration::from_millis(300), &[r.clone()], &cap2));
        // 4th consecutive no-change: trigger!
        assert!(c.evaluate(t0 + Duration::from_millis(350), &[r], &cap2));
    }

    #[test]
    fn action_sequence_stops_on_first_failure() {
        let auto = FakeAuto::new();
        struct FailAction;
        impl Action for FailAction {
            fn name(&self) -> &'static str {
                "Fail"
            }
            fn execute(
                &self,
                _: &dyn Automation,
                _context: &mut crate::domain::ActionContext,
            ) -> Result<(), String> {
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
        let mut context = crate::domain::ActionContext::new();
        let ok = seq.run(&auto, &mut context, &mut events);
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
            Box::new(RegionCondition::new(1, false)),
            ActionSequence::new(vec![
                Box::new(TypeText { text: "x".into() }) as Box<dyn Action + Send + Sync>
            ]),
            Guardrails {
                cooldown: Duration::from_millis(100),
                max_runtime: None,
                max_activations_per_hour: None,
                heartbeat_timeout: None,
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
                ocr_mode: crate::domain::OcrMode::default(),
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

    /// Tests for UI command helpers (normalize_rect, thumbnail capture)
    mod ui_commands {
        use crate::{normalize_rect, PickPoint};

        #[test]
        fn normalize_rect_basic() {
            let start = PickPoint { x: 10, y: 20 };
            let end = PickPoint { x: 50, y: 60 };
            let rect = normalize_rect(&start, &end).unwrap();
            assert_eq!(rect.x, 10);
            assert_eq!(rect.y, 20);
            assert_eq!(rect.width, 40);
            assert_eq!(rect.height, 40);
        }

        #[test]
        fn normalize_rect_reversed_coordinates() {
            let start = PickPoint { x: 50, y: 60 };
            let end = PickPoint { x: 10, y: 20 };
            let rect = normalize_rect(&start, &end).unwrap();
            assert_eq!(rect.x, 10);
            assert_eq!(rect.y, 20);
            assert_eq!(rect.width, 40);
            assert_eq!(rect.height, 40);
        }

        #[test]
        fn normalize_rect_negative_coordinates_clamped() {
            let start = PickPoint { x: -10, y: -5 };
            let end = PickPoint { x: 30, y: 40 };
            let rect = normalize_rect(&start, &end).unwrap();
            // Negative coordinates clamped to 0
            assert_eq!(rect.x, 0);
            assert_eq!(rect.y, 0);
            assert_eq!(rect.width, 30);
            assert_eq!(rect.height, 40);
        }

        #[test]
        fn normalize_rect_zero_size_rejected() {
            let start = PickPoint { x: 10, y: 20 };
            let end = PickPoint { x: 10, y: 20 };
            let rect = normalize_rect(&start, &end);
            // Zero-width or zero-height regions rejected
            assert!(rect.is_none());
        }

        #[test]
        fn normalize_rect_minimum_size() {
            let start = PickPoint { x: 10, y: 20 };
            let end = PickPoint { x: 11, y: 21 };
            let rect = normalize_rect(&start, &end).unwrap();
            assert_eq!(rect.width, 1);
            assert_eq!(rect.height, 1);
        }

        #[test]
        fn normalize_rect_all_negative_coordinates() {
            let start = PickPoint { x: -100, y: -200 };
            let end = PickPoint { x: -50, y: -150 };
            let rect = normalize_rect(&start, &end);
            // All coordinates negative → clamped to 0 → zero size → rejected
            assert!(rect.is_none());
        }
    }

    // Note: app_quit command behavior is tested via UI tests (tests/quit-button.vitest.tsx)
    // since it requires a Tauri AppHandle mock. The command:
    // 1. Closes region-overlay window if open
    // 2. Closes main window
    // 3. Calls app.exit(0) to terminate the process

    mod llm_prompt_generation {
        use super::*;
        use crate::action::LLMPromptGenerationAction;
        use crate::domain::ActionContext;
        use crate::llm::MockLLMClient;
        use std::sync::Arc;

        struct TestCapture;
        impl ScreenCapture for TestCapture {
            fn hash_region(&self, _region: &Region, _downscale: u32) -> u64 {
                42
            }
            fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError> {
                // Create a simple test image (10x10 pixels, all white)
                let width = region.rect.width.min(10);
                let height = region.rect.height.min(10);
                let bytes = vec![255u8; (width * height * 4) as usize]; // RGBA white
                Ok(ScreenFrame {
                    display: DisplayInfo {
                        id: 0,
                        name: Some("Test Display".to_string()),
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                        scale_factor: 1.0,
                        is_primary: true,
                    },
                    width,
                    height,
                    stride: width * 4,
                    bytes,
                    timestamp_ms: 0,
                })
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                Ok(vec![])
            }
        }

        fn make_test_capture() -> Arc<dyn ScreenCapture + Send + Sync> {
            Arc::new(TestCapture)
        }

        fn make_test_llm_client() -> Arc<dyn crate::llm::LLMClient + Send + Sync> {
            Arc::new(MockLLMClient::new())
        }

        #[test]
        fn llm_action_sets_prompt_variable_on_success() {
            let auto = FakeAuto::new();
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
                name: Some("Test Region".to_string()),
            }];

            let action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.5,
                system_prompt: None,
                variable_name: "prompt".to_string(),
                ocr_mode: crate::domain::OcrMode::default(),
                all_regions: regions,
                capture: make_test_capture(),
                llm_client: make_test_llm_client(),
            };

            let mut context = ActionContext::new();
            let result = action.execute(&auto, &mut context);

            assert!(result.is_ok(), "Action should succeed");
            assert_eq!(
                context.get("prompt"),
                Some("continue"),
                "Should set the prompt variable"
            );
        }

        #[test]
        fn llm_action_fails_on_missing_region() {
            let auto = FakeAuto::new();
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
                name: None,
            }];

            let action = LLMPromptGenerationAction {
                region_ids: vec!["nonexistent".to_string()],
                risk_threshold: 0.5,
                system_prompt: None,
                variable_name: "prompt".to_string(),
                ocr_mode: crate::domain::OcrMode::default(),
                all_regions: regions,
                capture: make_test_capture(),
                llm_client: make_test_llm_client(),
            };

            let mut context = ActionContext::new();
            let result = action.execute(&auto, &mut context);

            assert!(result.is_err(), "Should fail on missing region");
            assert!(result.unwrap_err().contains("not found"));
        }

        #[test]
        fn llm_action_respects_risk_threshold() {
            let auto = FakeAuto::new();
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
                name: None,
            }];

            // Test with high-risk LLM response
            let high_risk_client = Arc::new(MockLLMClient::with_response(
                "dangerous command".to_string(),
                0.8, // High risk
            ));

            let action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.5, // Lower than response's 0.8
                system_prompt: None,
                variable_name: "prompt".to_string(),
                ocr_mode: crate::domain::OcrMode::default(),
                all_regions: regions,
                capture: make_test_capture(),
                llm_client: high_risk_client,
            };

            let mut context = ActionContext::new();
            let result = action.execute(&auto, &mut context);

            // Should fail because risk (0.8) > threshold (0.5)
            assert!(result.is_err(), "Should fail on high risk");
            assert!(result.unwrap_err().contains("Risk threshold exceeded"));
        }

        #[test]
        fn type_action_expands_variables() {
            let auto = FakeAuto::new();
            let mut context = ActionContext::new();
            context.set("prompt", "test value");

            let action = TypeText {
                text: "$prompt".to_string(),
            };

            let result = action.execute(&auto, &mut context);
            assert!(result.is_ok());

            let calls = auto.calls.lock().unwrap().clone();
            assert_eq!(calls, vec!["type:test value"]);
        }

        #[test]
        fn type_action_expands_multiple_variables() {
            let auto = FakeAuto::new();
            let mut context = ActionContext::new();
            context.set("prompt", "hello");
            context.set("suffix", "world");

            let action = TypeText {
                text: "$prompt $suffix".to_string(),
            };

            let result = action.execute(&auto, &mut context);
            assert!(result.is_ok());

            let calls = auto.calls.lock().unwrap().clone();
            assert_eq!(calls, vec!["type:hello world"]);
        }

        #[test]
        fn action_context_stores_and_retrieves_variables() {
            let mut context = ActionContext::new();

            context.set("prompt", "test prompt");
            context.set("risk", "0.5");

            assert_eq!(context.get("prompt"), Some("test prompt"));
            assert_eq!(context.get("risk"), Some("0.5"));
            assert_eq!(context.get("nonexistent"), None);
        }
        
        #[test]
        fn llm_action_sets_termination_on_task_complete() {
            let auto = FakeAuto::new();
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
                name: Some("Test Region".to_string()),
            }];

            // Create LLM client that returns task_complete=true
            let completion_client = Arc::new(MockLLMClient::with_completion(
                "Build succeeded, all tests passed".to_string()
            ));

            let action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.5,
                system_prompt: None,
                variable_name: "prompt".to_string(),
                ocr_mode: crate::domain::OcrMode::default(),
                all_regions: regions,
                capture: make_test_capture(),
                llm_client: completion_client,
            };

            let mut context = ActionContext::new();
            let result = action.execute(&auto, &mut context);

            assert!(result.is_ok(), "Action should succeed");
            assert!(context.is_termination_requested(), "Should request termination");
            assert_eq!(
                context.termination_reason,
                Some("Build succeeded, all tests passed".to_string())
            );
            assert_eq!(context.get("task_complete"), Some("true"));
        }
        
        #[test]
        fn llm_action_stores_continuation_prompt_and_risk() {
            let auto = FakeAuto::new();
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
                name: Some("Test Region".to_string()),
            }];

            let action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.5,
                system_prompt: None,
                variable_name: "prompt".to_string(),
                ocr_mode: crate::domain::OcrMode::default(),
                all_regions: regions,
                capture: make_test_capture(),
                llm_client: make_test_llm_client(),
            };

            let mut context = ActionContext::new();
            let result = action.execute(&auto, &mut context);

            assert!(result.is_ok(), "Action should succeed");
            assert!(!context.is_termination_requested(), "Should not request termination");
            assert_eq!(context.get("prompt"), Some("continue"));
            assert_eq!(context.get("continuation_prompt_risk"), Some("0.1"));
            assert_eq!(context.get("task_complete"), Some("false"));
        }
        
        #[test]
        fn action_context_termination_request() {
            let mut context = ActionContext::new();
            
            assert!(!context.is_termination_requested());
            assert_eq!(context.termination_reason, None);
            
            context.request_termination("test reason");
            
            assert!(context.is_termination_requested());
            assert_eq!(context.termination_reason, Some("test reason".to_string()));
        }

        #[test]
        fn action_context_expand_handles_missing_variables() {
            let context = ActionContext::new();
            let result = context.expand("Hello $prompt world");
            // Variables not set remain as-is
            assert_eq!(result, "Hello $prompt world");
        }

        #[test]
        fn llm_action_with_custom_variable_name() {
            let auto = FakeAuto::new();
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
                name: None,
            }];

            let action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.5,
                system_prompt: None,
                variable_name: "custom_var".to_string(),
                all_regions: regions,
                capture: make_test_capture(),
                llm_client: make_test_llm_client(),
                ocr_mode: crate::domain::OcrMode::default(),
            };

            let mut context = ActionContext::new();
            let result = action.execute(&auto, &mut context);

            assert!(result.is_ok());
            assert_eq!(context.get("custom_var"), Some("continue"));
            assert_eq!(context.get("prompt"), None);
        }

        #[test]
        fn monitor_resets_context_on_start() {
            let trig = Box::new(IntervalTrigger::new(Duration::from_secs(1)));
            let cond = Box::new(RegionCondition::new(1, false));
            let seq = ActionSequence::new(vec![]);
            let guardrails = Guardrails::default();

            let mut mon = Monitor::new(trig, cond, seq, guardrails);

            // Set a variable before starting
            mon.context.set("test", "value");
            assert_eq!(mon.context.get("test"), Some("value"));

            // Start should reset context
            let mut events = vec![];
            mon.start(&mut events);

            assert_eq!(
                mon.context.get("test"),
                None,
                "Context should be reset on start"
            );
        }

        #[test]
        fn llm_action_in_profile_builds_correctly() {
            let profile = Profile {
                id: "test-llm".to_string(),
                name: "LLM Test Profile".to_string(),
                regions: vec![Region {
                    id: "r1".to_string(),
                    rect: Rect {
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 200,
                    },
                    name: Some("Chat Area".to_string()),
                }],
                trigger: TriggerConfig {
                    r#type: "IntervalTrigger".to_string(),
                    check_interval_sec: 60.0,
                },
                condition: ConditionConfig {
                    r#type: "RegionCondition".to_string(),
                    consecutive_checks: 1,
                    expect_change: false,
                },
                actions: vec![
                    ActionConfig::LLMPromptGeneration {
                        region_ids: vec!["r1".to_string()],
                        risk_threshold: 0.5,
                        system_prompt: Some("Generate a safe prompt".to_string()),
                        variable_name: Some("prompt".to_string()),
                        ocr_mode: crate::domain::OcrMode::default(),
                    },
                    ActionConfig::Type {
                        text: "$prompt".to_string(),
                    },
                    ActionConfig::Type {
                        text: "{Key:Enter}".to_string(),
                    },
                ],
                guardrails: Some(GuardrailsConfig {
                    max_runtime_ms: Some(3600000),
                    max_activations_per_hour: Some(60),
                    cooldown_ms: 5000,
                    heartbeat_timeout_ms: None,
                    success_keywords: vec![],
                    failure_keywords: vec![],
                    ocr_termination_pattern: None,
                    ocr_region_ids: vec![],
                    ocr_mode: crate::domain::OcrMode::default(),
                }),
            };

            let (monitor, regions) = build_monitor_from_profile(&profile, None, None);

            assert_eq!(regions.len(), 1);
            assert_eq!(monitor.actions.actions.len(), 3);
        }
    }
    

    
    mod monitor_termination {
        use super::*;
        use crate::action::LLMPromptGenerationAction;
        use crate::llm::MockLLMClient;
        use crate::Event;
        use std::sync::Arc;
        use std::time::{Duration, Instant};
        
        // Re-use TestCapture from parent module
        struct TestCapture;
        impl ScreenCapture for TestCapture {
            fn hash_region(&self, _region: &Region, _downscale: u32) -> u64 {
                42
            }
            fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError> {
                let width = region.rect.width.min(10);
                let height = region.rect.height.min(10);
                let bytes = vec![255u8; (width * height * 4) as usize];
                Ok(ScreenFrame {
                    display: DisplayInfo {
                        id: 0,
                        name: Some("Test Display".to_string()),
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                        scale_factor: 1.0,
                        is_primary: true,
                    },
                    width,
                    height,
                    stride: width * 4,
                    bytes,
                    timestamp_ms: 0,
                })
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                Ok(vec![])
            }
        }
        
        #[test]
        fn monitor_stops_on_llm_task_complete() {
            // Create a monitor with an LLM action that signals completion
            let completion_client = Arc::new(MockLLMClient::with_completion(
                "Task completed successfully".to_string()
            ));
            
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: Some("Test".to_string()),
            }];
            
            let capture = Arc::new(TestCapture);
            
            let llm_action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.9,
                system_prompt: None,
                variable_name: "prompt".to_string(),
                all_regions: regions.clone(),
                ocr_mode: crate::domain::OcrMode::default(),
                capture: capture as Arc<dyn ScreenCapture + Send + Sync>,
                llm_client: completion_client as Arc<dyn crate::llm::LLMClient + Send + Sync>,
            };
            
            let trigger = Box::new(IntervalTrigger::new(Duration::from_millis(100)));
            let condition = Box::new(RegionCondition::new(1, false));
            let actions = ActionSequence::new(vec![Box::new(llm_action)]);
            let guardrails = Guardrails::default();
            
            let mut monitor = Monitor::new(trigger, condition, actions, guardrails);
            
            let mut events = Vec::new();
            monitor.start(&mut events);
            
            let auto = FakeAuto::new();
            let capture_trait: &dyn ScreenCapture = &TestCapture;
            
            // First tick should run action and detect termination
            monitor.tick(Instant::now(), &regions, capture_trait, &auto, &mut events);
            
            // Monitor should be stopped due to termination
            assert!(monitor.started_at.is_none(), "Monitor should stop after task completion");
            
            // Should have WatchdogTripped event
            let has_watchdog_event = events.iter().any(|e| matches!(e, Event::WatchdogTripped { .. }));
            assert!(has_watchdog_event, "Should emit WatchdogTripped event on termination");
        }
        
        #[test]
        fn monitor_continues_when_llm_returns_continuation() {
            // Create a monitor with an LLM action that returns continuation
            let continue_client = Arc::new(MockLLMClient::new()); // Returns continuation by default
            
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: Some("Test".to_string()),
            }];
            
            let capture = Arc::new(TestCapture);
            
            let llm_action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.9,
                system_prompt: None,
                variable_name: "prompt".to_string(),
                all_regions: regions.clone(),
                ocr_mode: crate::domain::OcrMode::default(),
                capture: capture as Arc<dyn ScreenCapture + Send + Sync>,
                llm_client: continue_client as Arc<dyn crate::llm::LLMClient + Send + Sync>,
            };
            
            let trigger = Box::new(IntervalTrigger::new(Duration::from_millis(100)));
            let condition = Box::new(RegionCondition::new(1, false));
            let actions = ActionSequence::new(vec![Box::new(llm_action)]);
            let guardrails = Guardrails::default();
            
            let mut monitor = Monitor::new(trigger, condition, actions, guardrails);
            
            let mut events = Vec::new();
            monitor.start(&mut events);
            
            let auto = FakeAuto::new();
            let capture_trait: &dyn ScreenCapture = &TestCapture;
            
            // First tick should run action but NOT terminate
            monitor.tick(Instant::now(), &regions, capture_trait, &auto, &mut events);
            
            // Monitor should still be running
            assert!(monitor.started_at.is_some(), "Monitor should continue when LLM returns continuation");
            
            // Should NOT have WatchdogTripped event
            let has_watchdog_event = events.iter().any(|e| matches!(e, Event::WatchdogTripped { .. }));
            assert!(!has_watchdog_event, "Should not emit WatchdogTripped for continuation");
        }
    }

    #[cfg(feature = "ocr-integration")]
    mod ocr_tests {
        use super::*;
        use crate::domain::OcrMode;
        use crate::{ActionContext, Event};
        
        // Re-use TestCapture from parent module
        struct TestCapture;
        impl ScreenCapture for TestCapture {
            fn hash_region(&self, _region: &Region, _downscale: u32) -> u64 {
                42
            }
            fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError> {
                let width = region.rect.width.min(10);
                let height = region.rect.height.min(10);
                let bytes = vec![255u8; (width * height * 4) as usize];
                Ok(ScreenFrame {
                    display: DisplayInfo {
                        id: 0,
                        name: Some("Test Display".to_string()),
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                        scale_factor: 1.0,
                        is_primary: true,
                    },
                    width,
                    height,
                    stride: width * 4,
                    bytes,
                    timestamp_ms: 0,
                })
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                Ok(vec![])
            }
        }
        
        #[test]
        fn ocr_mode_defaults_to_vision() {
            // Verify default is Vision (doesn't require Tesseract)
            let mode = OcrMode::default();
            assert!(matches!(mode, OcrMode::Vision));
        }
        
        #[test]
        fn ocr_mode_serialization() {
            // Test serde rename_all = "lowercase"
            let local_json = serde_json::to_string(&OcrMode::Local).unwrap();
            assert_eq!(local_json, "\"local\"");
            
            let vision_json = serde_json::to_string(&OcrMode::Vision).unwrap();
            assert_eq!(vision_json, "\"vision\"");
            
            // Test deserialization
            let local: OcrMode = serde_json::from_str("\"local\"").unwrap();
            assert!(matches!(local, OcrMode::Local));
            
            let vision: OcrMode = serde_json::from_str("\"vision\"").unwrap();
            assert!(matches!(vision, OcrMode::Vision));
        }
        
        #[test]
        fn llm_action_uses_vision_mode_by_default() {
            // Test that LLM action respects ocr_mode field
            use crate::action::LLMPromptGenerationAction;
            use crate::llm::MockLLMClient;
            use std::sync::Arc;
            
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: Some("Test".to_string()),
            }];
            
            let action = LLMPromptGenerationAction {
                region_ids: vec!["r1".to_string()],
                risk_threshold: 0.9,
                system_prompt: None,
                variable_name: "prompt".to_string(),
                all_regions: regions.clone(),
                ocr_mode: OcrMode::Vision, // Explicit Vision mode
                capture: Arc::new(TestCapture),
                llm_client: Arc::new(MockLLMClient::new()),
            };
            
            let auto = FakeAuto::new();
            let mut context = ActionContext::new();
            
            // Should succeed without Tesseract in Vision mode
            let result = action.execute(&auto, &mut context);
            assert!(result.is_ok(), "Vision mode should work without Tesseract");
        }
        
        #[test]
        fn guardrails_ocr_fields_default_to_empty() {
            let guardrails = Guardrails::default();
            assert!(guardrails.success_keywords.is_empty());
            assert!(guardrails.failure_keywords.is_empty());
            assert!(guardrails.ocr_termination_pattern.is_none());
            assert!(guardrails.ocr_region_ids.is_empty());
            assert!(matches!(guardrails.ocr_mode, OcrMode::Vision));
        }
        
        #[test]
        fn monitor_check_ocr_termination_requires_local_mode() {
            // Test that OCR termination only runs in Local mode
            let trigger = Box::new(IntervalTrigger::new(Duration::from_millis(100)));
            let condition = Box::new(RegionCondition::new(1, false));
            let actions = ActionSequence::new(vec![]);
            
            let mut guardrails = Guardrails::default();
            guardrails.ocr_mode = OcrMode::Vision; // Vision mode
            guardrails.success_keywords = vec!["SUCCESS".to_string()];
            guardrails.ocr_region_ids = vec!["r1".to_string()];
            
            let mut monitor = Monitor::new(trigger, condition, actions, guardrails);
            
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: Some("Test".to_string()),
            }];
            
            let mut events = Vec::new();
            monitor.start(&mut events);
            
            let auto = FakeAuto::new();
            let capture: &dyn ScreenCapture = &TestCapture;
            
            // Tick should not trigger OCR termination in Vision mode
            monitor.tick(Instant::now(), &regions, capture, &auto, &mut events);
            
            // Should not have WatchdogTripped event (OCR check skipped)
            let has_watchdog = events.iter().any(|e| matches!(e, Event::WatchdogTripped { .. }));
            assert!(!has_watchdog, "OCR termination should not run in Vision mode");
        }
        
        // Note: Testing actual LinuxOCR.extract_text() requires Tesseract installation
        // which is not guaranteed in CI environment. The integration is validated by:
        // 1. Type checking (OCRCapture trait implemented)
        // 2. Feature gating (ocr-integration feature)
        // 3. Manual testing with Tesseract installed
        // 4. Monitor.check_ocr_termination() logic tested above
    }

    mod termination_check_tests {
        use super::*;
        use crate::action::TerminationCheckAction;
        use crate::llm::MockLLMClient;
        use crate::ActionContext;
        use std::sync::Arc;
        
        // Re-use TestCapture from parent module
        struct TestCapture;
        impl ScreenCapture for TestCapture {
            fn hash_region(&self, _region: &Region, _downscale: u32) -> u64 {
                42
            }
            fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError> {
                let width = region.rect.width.min(10);
                let height = region.rect.height.min(10);
                let bytes = vec![255u8; (width * height * 4) as usize];
                Ok(ScreenFrame {
                    display: DisplayInfo {
                        id: 0,
                        name: Some("Test Display".to_string()),
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                        scale_factor: 1.0,
                        is_primary: true,
                    },
                    width,
                    height,
                    stride: width * 4,
                    bytes,
                    timestamp_ms: 0,
                })
            }
            fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
                Ok(vec![])
            }
        }
        
        #[test]
        fn termination_check_context_matches_pattern() {
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: None,
            }];
            
            let action = TerminationCheckAction {
                check_type: "context".to_string(),
                context_vars: vec!["status".to_string()],
                ocr_region_ids: vec![],
                ai_query_prompt: None,
                termination_condition: "DONE|COMPLETE".to_string(), // Regex pattern
                all_regions: regions,
                capture: Arc::new(TestCapture),
                llm_client: Arc::new(MockLLMClient::new()),
            };
            
            let mut context = ActionContext::new();
            context.set("status", "DONE");
            
            let auto = FakeAuto::new();
            let result = action.execute(&auto, &mut context);
            
            assert!(result.is_ok());
            assert!(context.is_termination_requested());
        }
        
        #[test]
        fn termination_check_context_no_match() {
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: None,
            }];
            
            let action = TerminationCheckAction {
                check_type: "context".to_string(),
                context_vars: vec!["status".to_string()],
                ocr_region_ids: vec![],
                ai_query_prompt: None,
                termination_condition: "DONE|COMPLETE".to_string(),
                all_regions: regions,
                capture: Arc::new(TestCapture),
                llm_client: Arc::new(MockLLMClient::new()),
            };
            
            let mut context = ActionContext::new();
            context.set("status", "RUNNING");
            
            let auto = FakeAuto::new();
            let result = action.execute(&auto, &mut context);
            
            assert!(result.is_ok());
            assert!(!context.is_termination_requested());
        }
        
        #[test]
        fn termination_check_ai_query_complete() {
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: None,
            }];
            
            // Mock LLM that returns task_complete=true
            let completion_client = Arc::new(MockLLMClient::with_completion(
                "Task is complete".to_string()
            ));
            
            let action = TerminationCheckAction {
                check_type: "ai_query".to_string(),
                context_vars: vec![],
                ocr_region_ids: vec![],
                ai_query_prompt: Some("Is the task done?".to_string()),
                termination_condition: "".to_string(), // Not used for ai_query
                all_regions: regions,
                capture: Arc::new(TestCapture),
                llm_client: completion_client,
            };
            
            let mut context = ActionContext::new();
            
            let auto = FakeAuto::new();
            let result = action.execute(&auto, &mut context);
            
            assert!(result.is_ok());
            assert!(context.is_termination_requested());
        }
        
        #[test]
        fn termination_check_ai_query_continue() {
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: None,
            }];
            
            // Mock LLM that returns continuation
            let continue_client = Arc::new(MockLLMClient::new());
            
            let action = TerminationCheckAction {
                check_type: "ai_query".to_string(),
                context_vars: vec![],
                ocr_region_ids: vec![],
                ai_query_prompt: Some("Is the task done?".to_string()),
                termination_condition: "".to_string(),
                all_regions: regions,
                capture: Arc::new(TestCapture),
                llm_client: continue_client,
            };
            
            let mut context = ActionContext::new();
            
            let auto = FakeAuto::new();
            let result = action.execute(&auto, &mut context);
            
            assert!(result.is_ok());
            assert!(!context.is_termination_requested());
        }
        
        #[test]
        fn termination_check_invalid_check_type() {
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: None,
            }];
            
            let action = TerminationCheckAction {
                check_type: "invalid".to_string(),
                context_vars: vec![],
                ocr_region_ids: vec![],
                ai_query_prompt: None,
                termination_condition: "".to_string(),
                all_regions: regions,
                capture: Arc::new(TestCapture),
                llm_client: Arc::new(MockLLMClient::new()),
            };
            
            let mut context = ActionContext::new();
            
            let auto = FakeAuto::new();
            let result = action.execute(&auto, &mut context);
            
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("Unknown check_type"));
        }
        
        #[test]
        fn heartbeat_watchdog_triggers_on_stall() {
            use std::time::{Duration, Instant};
            use crate::{Event, ActionSequence, Guardrails};
            use crate::monitor::Monitor;
            use crate::trigger::IntervalTrigger;
            use crate::condition::RegionCondition;
            
            let trigger = Box::new(IntervalTrigger::new(Duration::from_millis(100)));
            let condition = Box::new(RegionCondition::new(1, false));
            let actions = ActionSequence::new(vec![]);
            let guardrails = Guardrails {
                cooldown: Duration::from_millis(0),
                max_runtime: None,
                max_activations_per_hour: None,
                heartbeat_timeout: Some(Duration::from_millis(100)),
                ocr_mode: crate::domain::OcrMode::default(),
                success_keywords: vec![],
                failure_keywords: vec![],
                ocr_termination_pattern: None,
                ocr_region_ids: vec![],
            };
            
            let mut monitor = Monitor::new(trigger, condition, actions, guardrails);
            let mut events = vec![];
            
            monitor.start(&mut events);
            
            // Set last_action_progress to simulate stalled heartbeat
            let now = Instant::now();
            monitor.last_action_progress = Some(now - Duration::from_millis(150));
            
            // Tick should detect stalled heartbeat (150ms > 100ms timeout)
            let regions = vec![];
            let auto = FakeAuto::new();
            let capture = crate::FakeCapture;
            
            monitor.tick(now, &regions, &capture, &auto, &mut events);
            
            // Should have watchdog event with heartbeat_stalled reason
            let watchdog_events: Vec<_> = events.iter()
                .filter(|e| matches!(e, Event::WatchdogTripped { reason } if reason == "heartbeat_stalled"))
                .collect();
            assert_eq!(watchdog_events.len(), 1, "Should emit heartbeat_stalled watchdog event");
            
            // Monitor should be stopped
            assert!(monitor.started_at.is_none());
        }
        
        #[test]
        fn action_sequence_stops_on_termination_check() {
            use crate::{Event, ActionSequence, Automation};
            
            // Simple test action that increments a counter
            struct CounterAction {
                id: u32,
            }
            impl Action for CounterAction {
                fn name(&self) -> &'static str {
                    "Counter"
                }
                fn execute(&self, _automation: &dyn Automation, context: &mut ActionContext) -> Result<(), String> {
                    let count = context.get("counter").unwrap_or("0").parse::<u32>().unwrap_or(0);
                    context.set("counter", &(count + 1).to_string());
                    Ok(())
                }
            }
            
            let regions = vec![Region {
                id: "r1".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: None,
            }];
            
            // Create sequence: Counter -> TerminationCheck (triggers) -> Counter (should not execute)
            let actions: Vec<Box<dyn Action + Send + Sync>> = vec![
                Box::new(CounterAction { id: 1 }),
                Box::new(TerminationCheckAction {
                    check_type: "context".to_string(),
                    context_vars: vec!["status".to_string()],
                    ocr_region_ids: vec![],
                    ai_query_prompt: None,
                    termination_condition: "DONE".to_string(),
                    all_regions: regions.clone(),
                    capture: Arc::new(TestCapture),
                    llm_client: Arc::new(MockLLMClient::new()),
                }),
                Box::new(CounterAction { id: 2 }),
            ];
            
            let sequence = ActionSequence::new(actions);
            let mut context = ActionContext::new();
            context.set("status", "DONE"); // Will trigger termination
            context.set("counter", "0");
            
            let auto = FakeAuto::new();
            let mut events = vec![];
            
            let success = sequence.run(&auto, &mut context, &mut events);
            
            assert!(success); // Returns true even though terminated early
            assert!(context.is_termination_requested());
            
            // Counter should be 1 (only first action executed)
            let counter = context.get("counter").unwrap_or("0").parse::<u32>().unwrap_or(0);
            assert_eq!(counter, 1, "Third action should not have executed");
            
            // Should see: ActionStarted (Counter), ActionCompleted (Counter),
            //             ActionStarted (TerminationCheck), ActionCompleted (TerminationCheck),
            //             TerminationCheckTriggered
            // Should NOT see third ActionStarted (Counter)
            let action_started_count = events.iter().filter(|e| matches!(e, Event::ActionStarted { .. })).count();
            assert_eq!(action_started_count, 2, "Should only execute 2 actions before termination");
            
            let termination_events: Vec<_> = events.iter()
                .filter(|e| matches!(e, Event::TerminationCheckTriggered { .. }))
                .collect();
            assert_eq!(termination_events.len(), 1, "Should emit exactly one TerminationCheckTriggered event");
        }
    }
    
    // Domain-specific unit tests for types and utilities
    mod domain_tests {
        use super::*;
        use crate::domain::{ActionContext, LLMPromptResponse, BackendError, OcrMode, Guardrails, OCRCapture, Automation, MouseButton, Region, Rect};
        
        #[test]
        fn action_context_variable_expansion() {
            let mut ctx = ActionContext::new();
            ctx.set("name", "Alice");
            ctx.set("value", "42");
            
            let expanded = ctx.expand("Hello $name, the answer is $value!");
            assert_eq!(expanded, "Hello Alice, the answer is 42!");
        }
        
        #[test]
        fn action_context_termination_request() {
            let mut ctx = ActionContext::new();
            assert!(!ctx.is_termination_requested());
            
            ctx.request_termination("task_complete");
            assert!(ctx.is_termination_requested());
            assert_eq!(ctx.termination_reason, Some("task_complete".to_string()));
        }
        
        #[test]
        fn llm_prompt_response_simple() {
            let response = LLMPromptResponse::simple("test prompt".to_string(), 0.5);
            assert_eq!(response.prompt, "test prompt");
            assert_eq!(response.risk, 0.5);
            assert_eq!(response.continuation_prompt, Some("test prompt".to_string()));
            assert_eq!(response.continuation_prompt_risk, 0.5);
            assert!(!response.task_complete);
            assert_eq!(response.task_complete_reason, None);
        }
        
        #[test]
        fn llm_prompt_response_completed() {
            let response = LLMPromptResponse::completed("Task finished successfully".to_string());
            assert_eq!(response.prompt, "");
            assert_eq!(response.risk, 0.0);
            assert_eq!(response.continuation_prompt, None);
            assert_eq!(response.continuation_prompt_risk, 0.0);
            assert!(response.task_complete);
            assert_eq!(response.task_complete_reason, Some("Task finished successfully".to_string()));
        }
        
        #[test]
        fn llm_prompt_response_continuation() {
            let response = LLMPromptResponse::continuation("next step".to_string(), 0.3);
            assert_eq!(response.prompt, "next step");
            assert_eq!(response.risk, 0.3);
            assert_eq!(response.continuation_prompt, Some("next step".to_string()));
            assert_eq!(response.continuation_prompt_risk, 0.3);
            assert!(!response.task_complete);
            assert_eq!(response.task_complete_reason, None);
        }
        
        #[test]
        fn backend_error_display() {
            let err = BackendError::new("test_code", "test message");
            assert_eq!(err.code, "test_code");
            assert_eq!(err.message, "test message");
            assert_eq!(format!("{}", err), "test_code: test message");
        }
        
        #[test]
        fn ocr_mode_default() {
            assert_eq!(OcrMode::default(), OcrMode::Vision);
        }
        
        #[test]
        fn guardrails_default() {
            let g = Guardrails::default();
            assert_eq!(g.cooldown, Duration::from_millis(0));
            assert_eq!(g.max_runtime, None);
            assert_eq!(g.max_activations_per_hour, None);
            assert_eq!(g.heartbeat_timeout, None);
            assert_eq!(g.ocr_mode, OcrMode::Vision);
            assert!(g.success_keywords.is_empty());
            assert!(g.failure_keywords.is_empty());
            assert_eq!(g.ocr_termination_pattern, None);
            assert!(g.ocr_region_ids.is_empty());
        }
        
        #[test]
        fn automation_trait_default_methods() {
            struct TestAutomation;
            impl Automation for TestAutomation {
                fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> {
                    Ok(())
                }
                fn click(&self, _button: MouseButton) -> Result<(), String> {
                    Ok(())
                }
                fn type_text(&self, _text: &str) -> Result<(), String> {
                    Ok(())
                }
                fn key(&self, _key: &str) -> Result<(), String> {
                    Ok(())
                }
            }
            
            let auto = TestAutomation;
            assert!(auto.mouse_down(MouseButton::Left).is_ok());
            assert!(auto.mouse_up(MouseButton::Right).is_ok());
            assert!(auto.key_down("a").is_ok());
            assert!(auto.key_up("b").is_ok());
        }
        
        #[test]
        fn ocr_capture_default_cached_method() {
            struct TestOCR;
            impl OCRCapture for TestOCR {
                fn extract_text(&self, _region: &Region) -> Result<String, BackendError> {
                    Ok("test text".to_string())
                }
            }
            
            let ocr = TestOCR;
            let region = Region {
                id: "test".to_string(),
                rect: Rect { x: 0, y: 0, width: 100, height: 100 },
                name: None,
            };
            
            // Default cached implementation should just call extract_text
            let result = ocr.extract_text_cached(&region, 12345);
            assert_eq!(result.unwrap(), "test text");
        }
    }
}
