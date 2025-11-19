use crate::domain::{Action, ActionContext, Automation, MouseButton, Region, ScreenCapture};
use crate::llm::{build_risk_guidance, capture_region_images, LLMClient};

pub struct MoveCursor {
    pub x: u32,
    pub y: u32,
}
impl Action for MoveCursor {
    fn name(&self) -> &'static str {
        "MoveCursor"
    }
    fn execute(
        &self,
        automation: &dyn Automation,
        _context: &mut ActionContext,
    ) -> Result<(), String> {
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
    fn execute(
        &self,
        automation: &dyn Automation,
        _context: &mut ActionContext,
    ) -> Result<(), String> {
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
    fn execute(
        &self,
        automation: &dyn Automation,
        context: &mut ActionContext,
    ) -> Result<(), String> {
        // Expand variables like $prompt
        let expanded = context.expand(&self.text);

        // Check for inline key syntax like {Key:Enter}
        if expanded.starts_with("{Key:") && expanded.ends_with("}") {
            let key = expanded[5..expanded.len() - 1].to_string();
            return automation.key(&key);
        }

        automation.type_text(&expanded)
    }
}

/// LLM Prompt Generation action that captures regions, calls LLM, and populates $prompt
pub struct LLMPromptGenerationAction {
    pub region_ids: Vec<String>,
    pub risk_threshold: f64,
    pub system_prompt: Option<String>,
    pub variable_name: String,
    pub all_regions: Vec<Region>,
    pub capture: std::sync::Arc<dyn ScreenCapture + Send + Sync>,
    pub llm_client: std::sync::Arc<dyn LLMClient>,
}

impl Action for LLMPromptGenerationAction {
    fn name(&self) -> &'static str {
        "LLMPromptGeneration"
    }

    fn execute(
        &self,
        _automation: &dyn Automation,
        context: &mut ActionContext,
    ) -> Result<(), String> {
        // 1. Validate region_ids and collect regions
        let mut captured_regions = Vec::new();
        for region_id in &self.region_ids {
            if let Some(region) = self.all_regions.iter().find(|r| &r.id == region_id) {
                captured_regions.push(region.clone());
            } else {
                return Err(format!("Region '{}' not found", region_id));
            }
        }

        // 2. Capture screen regions as PNG images
        let region_images = capture_region_images(&captured_regions, self.capture.as_ref())?;

        // 3. Build risk guidance
        let risk_guidance = build_risk_guidance();

        // 4. Call LLM with regions and images
        let llm_response = self.llm_client.generate_prompt(
            &captured_regions,
            region_images,
            self.system_prompt.as_deref(),
            &risk_guidance,
        )?;

        // 5. Check if task is complete (new structured termination)
        if llm_response.task_complete {
            let reason = llm_response.task_complete_reason.clone()
                .unwrap_or_else(|| "LLM signaled task complete".to_string());
            context.request_termination(reason);
            
            // Still set variables for logging/inspection
            if let Some(ref prompt) = llm_response.continuation_prompt {
                context.set(&self.variable_name, prompt.clone());
            }
            context.set("task_complete", "true");
            
            return Ok(());
        }

        // 6. Validate continuation prompt exists
        let continuation_prompt = llm_response.continuation_prompt.as_ref()
            .ok_or("LLM did not provide continuation_prompt")?;

        // 7. Validate risk threshold (use new continuation_prompt_risk)
        let risk = llm_response.continuation_prompt_risk;
        if risk > self.risk_threshold {
            // Play audible alarm
            self.play_alarm();
            return Err(format!(
                "Risk threshold exceeded: {} > {} (generated prompt: '{}')",
                risk, self.risk_threshold, continuation_prompt
            ));
        }

        // 8. Validate prompt
        if continuation_prompt.is_empty() {
            return Err("LLM returned empty continuation_prompt".to_string());
        }
        if continuation_prompt.len() > 200 {
            return Err(format!(
                "LLM prompt too long: {} characters (max 200)",
                continuation_prompt.len()
            ));
        }

        // 9. Set the variables in context
        context.set(&self.variable_name, continuation_prompt.clone());
        context.set("continuation_prompt_risk", risk.to_string());
        context.set("task_complete", "false");

        Ok(())
    }
}

impl LLMPromptGenerationAction {
    /// Play audible alarm when risk threshold is exceeded
    fn play_alarm(&self) {
        // In a real implementation, this would:
        // - Use platform-specific audio API
        // - Play a beep or alert sound
        // For now, just print to stderr
        eprintln!("⚠️  RISK THRESHOLD EXCEEDED - ALARM ⚠️");
    }
}
