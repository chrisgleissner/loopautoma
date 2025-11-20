use std::collections::HashMap;
use std::time::Instant;

use crate::domain::{Condition, Region, ScreenCapture};

pub struct RegionCondition {
    consecutive_checks: u32,
    expect_change: bool,
    // Track per-region last hash
    last_hashes: HashMap<String, u64>,
    // Track consecutive evaluations with same change/no-change state
    consecutive_same_state: u32,
    last_had_change: Option<bool>,
}

impl RegionCondition {
    pub fn new(consecutive_checks: u32, expect_change: bool) -> Self {
        Self {
            consecutive_checks: consecutive_checks.max(1),
            expect_change,
            last_hashes: HashMap::new(),
            consecutive_same_state: 0,
            last_had_change: None,
        }
    }
}

impl Condition for RegionCondition {
    fn evaluate(&mut self, _now: Instant, regions: &[Region], capture: &dyn ScreenCapture) -> bool {
        // Check if any region changed since last evaluation
        let mut any_changed = false;
        let mut all_regions_initialized = true;
        
        for r in regions {
            let h = capture.hash_region(r, 1); // No downscaling
            match self.last_hashes.get(&r.id) {
                None => {
                    // First observation: record hash, don't count as change yet
                    self.last_hashes.insert(r.id.clone(), h);
                    all_regions_initialized = false;
                }
                Some(&prev_h) => {
                    if prev_h != h {
                        any_changed = true;
                        self.last_hashes.insert(r.id.clone(), h);
                    }
                }
            }
        }

        // Issue 6: Skip evaluation if this is the initial capture (not all regions initialized yet)
        // This ensures the first capture doesn't count towards consecutive_checks
        if !all_regions_initialized {
            return false;
        }

        // Update consecutive count
        match self.last_had_change {
            None => {
                // First real evaluation after initialization
                self.last_had_change = Some(any_changed);
                self.consecutive_same_state = 1;
            }
            Some(prev_had_change) => {
                if prev_had_change == any_changed {
                    // Same state as last time
                    self.consecutive_same_state += 1;
                } else {
                    // State flipped
                    self.last_had_change = Some(any_changed);
                    self.consecutive_same_state = 1;
                }
            }
        }

        // Check if condition is met
        let current_state_matches = any_changed == self.expect_change;
        let enough_consecutive = self.consecutive_same_state >= self.consecutive_checks;
        
        current_state_matches && enough_consecutive
    }
}
