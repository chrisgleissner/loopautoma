use crate::domain::{Action, ActionContext, Automation, LLMPromptResponse, MouseButton, Region};

pub struct MoveCursor {
    pub x: u32,
    pub y: u32,
}
impl Action for MoveCursor {
    fn name(&self) -> &'static str {
        "MoveCursor"
    }
    fn execute(&self, automation: &dyn Automation, _context: &mut ActionContext) -> Result<(), String> {
        automation.move_cursor(self.x, self.y)
    }
}

pub struct Click {
    pub button: MouseButton,
}
impl Action for Click {
    fn name(&self) -> &'static str {
        "Click"
    }
    fn execute(&self, automation: &dyn Automation, _context: &mut ActionContext) -> Result<(), String> {
        automation.click(self.button)
    }
}

pub struct TypeText {
    pub text: String,
}
impl Action for TypeText {
    fn name(&self) -> &'static str {
        "Type"
    }
    fn execute(&self, automation: &dyn Automation, context: &mut ActionContext) -> Result<(), String> {
        // Expand variables like $prompt
        let expanded = context.expand(&self.text);
        automation.type_text(&expanded)
    }
}

pub struct Key {
    pub key: String,
}
impl Action for Key {
    fn name(&self) -> &'static str {
        "Key"
    }
    fn execute(&self, automation: &dyn Automation, _context: &mut ActionContext) -> Result<(), String> {
        automation.key(&self.key)
    }
}

/// LLM Prompt Generation action that captures regions, calls LLM, and populates $prompt
pub struct LLMPromptGenerationAction {
    pub region_ids: Vec<String>,
    pub risk_threshold: f64,
    pub system_prompt: Option<String>,
    pub variable_name: String,
    pub all_regions: Vec<Region>,
}

impl Action for LLMPromptGenerationAction {
    fn name(&self) -> &'static str {
        "LLMPromptGeneration"
    }

    fn execute(&self, _automation: &dyn Automation, context: &mut ActionContext) -> Result<(), String> {
        // 1. Validate region_ids
        let mut captured_regions = Vec::new();
        for region_id in &self.region_ids {
            if let Some(region) = self.all_regions.iter().find(|r| &r.id == region_id) {
                captured_regions.push(region.clone());
            } else {
                return Err(format!("Region '{}' not found", region_id));
            }
        }

        // 2. Call LLM (for now, we'll use a mock/fake implementation)
        // In a real implementation, we'd pass a ScreenCapture reference and capture the regions
        let llm_response = self.call_llm(&captured_regions, &self.system_prompt)?;

        // 3. Validate risk threshold
        if llm_response.risk > self.risk_threshold {
            // Play audible alarm
            self.play_alarm();
            return Err(format!(
                "Risk threshold exceeded: {} > {} (generated prompt: '{}')",
                llm_response.risk, self.risk_threshold, llm_response.prompt
            ));
        }

        // 4. Validate prompt
        if llm_response.prompt.is_empty() {
            return Err("LLM returned empty prompt".to_string());
        }
        if llm_response.prompt.len() > 200 {
            return Err(format!(
                "LLM prompt too long: {} characters (max 200)",
                llm_response.prompt.len()
            ));
        }

        // 5. Set the variable in context
        context.set(&self.variable_name, llm_response.prompt);

        Ok(())
    }
}

impl LLMPromptGenerationAction {
    /// Call LLM with captured regions
    /// In a real implementation, this would:
    /// - Use ScreenCapture to get region pixels
    /// - Convert regions to base64 images
    /// - Call GPT-5.1 vision API
    /// - Parse JSON response
    fn call_llm(
        &self,
        _regions: &[Region],
        _system_prompt: &Option<String>,
    ) -> Result<LLMPromptResponse, String> {
        // Mock implementation for testing
        // In production, this would call actual LLM API
        Ok(LLMPromptResponse {
            prompt: "continue".to_string(),
            risk: 0.1, // Low risk
        })
    }

    /// Play audible alarm when risk threshold is exceeded
    fn play_alarm(&self) {
        // In a real implementation, this would:
        // - Use platform-specific audio API
        // - Play a beep or alert sound
        // For now, just print to stderr
        eprintln!("⚠️  RISK THRESHOLD EXCEEDED - ALARM ⚠️");
    }
}
