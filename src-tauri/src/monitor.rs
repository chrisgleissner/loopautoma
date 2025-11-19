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
        }
    }

    pub fn start(&mut self, events: &mut Vec<Event>) {
        self.started_at = Some(Instant::now());
        self.activations = 0;
        self.last_activation_at = None;
        self.activation_log.clear();
        self.context = ActionContext::new(); // Reset context on start
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
}
