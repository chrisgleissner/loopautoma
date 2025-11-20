use std::collections::VecDeque;
use std::time::{Duration, Instant};

use crate::domain::{
    ActionContext, ActionSequence, Condition, Event, Guardrails, MonitorState, Trigger,
};

pub struct Monitor<'a> {
    pub trigger: Box<dyn Trigger + Send + 'a>,
    pub condition: Box<dyn Condition + Send + 'a>,
    pub actions: ActionSequence,
    pub guardrails: Guardrails,
    pub started_at: Option<Instant>,
    pub activations: u32,
    pub last_activation_at: Option<Instant>,
    activation_log: VecDeque<Instant>,
    pub context: ActionContext,
    /// Heartbeat: Last time an action made progress (used for stall detection)
    pub last_action_progress: Option<Instant>,
}

impl<'a> Monitor<'a> {
    pub fn new(
        trigger: Box<dyn Trigger + Send + 'a>,
        condition: Box<dyn Condition + Send + 'a>,
        actions: ActionSequence,
        guardrails: Guardrails,
    ) -> Self {
        Self {
            trigger,
            condition,
            actions,
            guardrails,
            started_at: None,
            activations: 0,
            last_activation_at: None,
            activation_log: VecDeque::new(),
            context: ActionContext::new(),
            last_action_progress: None,
        }
    }

    pub fn start(&mut self, events: &mut Vec<Event>) {
        self.started_at = Some(Instant::now());
        self.activations = 0;
        self.last_activation_at = None;
        self.activation_log.clear();
        self.context = ActionContext::new(); // Reset context on start
        self.last_action_progress = None; // Reset heartbeat on start
        events.push(Event::MonitorStateChanged {
            state: MonitorState::Running,
        });
    }
    pub fn stop(&mut self, events: &mut Vec<Event>) {
        self.started_at = None;
        self.last_activation_at = None;
        events.push(Event::MonitorStateChanged {
            state: MonitorState::Stopped,
        });
    }

    pub fn tick(
        &mut self,
        now: Instant,
        regions: &[crate::domain::Region],
        capture: &dyn crate::domain::ScreenCapture,
        automation: &dyn crate::domain::Automation,
        out_events: &mut Vec<Event>,
    ) {
        if self.started_at.is_none() {
            return;
        }

        // Emit timing info at start of every tick
        let next_check_ms = self.trigger.time_until_next_ms(now);
        let cooldown_remaining_ms = if let Some(last) = self.last_activation_at {
            let elapsed = now.duration_since(last);
            if elapsed < self.guardrails.cooldown {
                (self.guardrails.cooldown - elapsed).as_millis() as u64
            } else {
                0
            }
        } else {
            0
        };

        // guard: max runtime
        if let Some(start) = self.started_at {
            if let Some(max_rt) = self.guardrails.max_runtime {
                if now.duration_since(start) > max_rt {
                    out_events.push(Event::WatchdogTripped {
                        reason: "max_runtime".into(),
                    });
                    self.stop(out_events);
                    return;
                }
            }
        }

        // guard: heartbeat watchdog (stall detection)
        if let Some(heartbeat_timeout) = self.guardrails.heartbeat_timeout {
            if let Some(last_progress) = self.last_action_progress {
                if now.duration_since(last_progress) > heartbeat_timeout {
                    out_events.push(Event::WatchdogTripped {
                        reason: "heartbeat_stalled".into(),
                    });
                    self.stop(out_events);
                    return;
                }
            }
        }

        if !self.trigger.should_fire(now) {
            out_events.push(Event::MonitorTick {
                next_check_ms,
                cooldown_remaining_ms,
                condition_met: false,
            });
            return;
        }
        out_events.push(Event::TriggerFired);

        // cooldown: ensure min time between activations
        if let Some(last) = self.last_activation_at {
            if now.duration_since(last) < self.guardrails.cooldown {
                out_events.push(Event::MonitorTick {
                    next_check_ms,
                    cooldown_remaining_ms,
                    condition_met: false,
                });
                return;
            }
        }

        let cond = self.condition.evaluate(now, regions, capture);
        out_events.push(Event::ConditionEvaluated { result: cond });
        out_events.push(Event::MonitorTick {
            next_check_ms,
            cooldown_remaining_ms,
            condition_met: cond,
        });
        if !cond {
            return;
        }

        // OCR-based termination check (only in local mode with configured patterns)
        #[cfg(feature = "ocr-integration")]
        if self.guardrails.ocr_mode == crate::domain::OcrMode::Local
            && (!self.guardrails.ocr_region_ids.is_empty()
                && (!self.guardrails.success_keywords.is_empty()
                    || !self.guardrails.failure_keywords.is_empty()
                    || self.guardrails.ocr_termination_pattern.is_some()))
        {
            if let Some(termination_reason) = self.check_ocr_termination(regions, capture) {
                out_events.push(Event::WatchdogTripped {
                    reason: termination_reason,
                });
                self.stop(out_events);
                return;
            }
        }

        // rate limit
        if let Some(max_per_hour) = self.guardrails.max_activations_per_hour {
            let window = Duration::from_secs(3600);
            while let Some(ts) = self.activation_log.front() {
                if now.duration_since(*ts) > window {
                    self.activation_log.pop_front();
                } else {
                    break;
                }
            }
            if self.activation_log.len() as u32 >= max_per_hour {
                out_events.push(Event::WatchdogTripped {
                    reason: "max_activations_per_hour".into(),
                });
                return;
            }
        }

        // Touch heartbeat before running actions
        self.last_action_progress = Some(now);
        
        let ok = self.actions.run(automation, &mut self.context, out_events);
        if ok {
            self.activations += 1;
            self.last_activation_at = Some(now);
            if self.guardrails.max_activations_per_hour.is_some() {
                self.activation_log.push_back(now);
            }
        }
        
        // Check for termination request from actions (e.g., LLM task completion)
        if self.context.is_termination_requested() {
            let reason = self.context.termination_reason.clone()
                .unwrap_or_else(|| "termination_requested".to_string());
            out_events.push(Event::WatchdogTripped { reason });
            self.stop(out_events);
        }
    }

    /// Check OCR regions for termination patterns (success/failure keywords)
    /// Returns Some(reason) if termination should occur, None otherwise
    #[cfg(feature = "ocr-integration")]
    fn check_ocr_termination(
        &self,
        regions: &[crate::domain::Region],
        capture: &dyn crate::domain::ScreenCapture,
    ) -> Option<String> {
        use crate::domain::OCRCapture;
        use regex::Regex;

        // Create OCR capture instance
        let ocr = match crate::os::linux::LinuxOCR::new() {
            Ok(o) => o,
            Err(e) => {
                eprintln!("[Monitor] Failed to initialize OCR: {}", e.message);
                return None;
            }
        };

        // Extract text from configured OCR regions
        for region_id in &self.guardrails.ocr_region_ids {
            let region = match regions.iter().find(|r| &r.id == region_id) {
                Some(r) => r,
                None => {
                    eprintln!("[Monitor] OCR region '{}' not found", region_id);
                    continue;
                }
            };

            // Get region hash for caching
            let region_hash = capture.hash_region(region, 1);

            // Extract text with caching
            let text = match ocr.extract_text_cached(region, region_hash) {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("[Monitor] OCR extraction failed for '{}': {}", region_id, e.message);
                    println!("[OCR] Failed to extract text from region '{}' ({}): {}", 
                        region.name.as_deref().unwrap_or(&region_id), region_id, e.message);
                    continue;
                }
            };

            // Issue 7: Log OCR extraction with region name and extracted text
            let region_name = region.name.as_deref().unwrap_or(&region_id);
            println!("[OCR] Region '{}' (ID: {}) extracted text: '{}'", 
                region_name, region_id, 
                if text.len() > 100 { format!("{}...", &text[..100]) } else { text.clone() });

            let text_upper = text.to_uppercase();

            // Check success keywords
            for keyword in &self.guardrails.success_keywords {
                if let Ok(re) = Regex::new(keyword) {
                    if re.is_match(&text) {
                        return Some(format!("ocr_success_pattern: {}", keyword));
                    }
                } else if text_upper.contains(&keyword.to_uppercase()) {
                    return Some(format!("ocr_success_keyword: {}", keyword));
                }
            }

            // Check failure keywords
            for keyword in &self.guardrails.failure_keywords {
                if let Ok(re) = Regex::new(keyword) {
                    if re.is_match(&text) {
                        return Some(format!("ocr_failure_pattern: {}", keyword));
                    }
                } else if text_upper.contains(&keyword.to_uppercase()) {
                    return Some(format!("ocr_failure_keyword: {}", keyword));
                }
            }

            // Check custom termination pattern
            if let Some(pattern) = &self.guardrails.ocr_termination_pattern {
                if let Ok(re) = Regex::new(pattern) {
                    if re.is_match(&text) {
                        return Some(format!("ocr_termination_pattern: {}", pattern));
                    }
                }
            }
        }

        None
    }
}
