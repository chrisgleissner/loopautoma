/// LLM client for generating prompts based on screen regions
use crate::domain::{LLMPromptResponse, Region, ScreenCapture};
use std::sync::Arc;

/// Trait for LLM clients to enable testing with mocks
pub trait LLMClient: Send + Sync {
    fn generate_prompt(
        &self,
        regions: &[Region],
        region_images: Vec<Vec<u8>>, // PNG-encoded images
        system_prompt: Option<&str>,
        risk_guidance: &str,
    ) -> Result<LLMPromptResponse, String>;
}

/// Mock LLM client for testing
pub struct MockLLMClient {
    pub mock_response: LLMPromptResponse,
}

impl MockLLMClient {
    pub fn new() -> Self {
        Self {
            mock_response: LLMPromptResponse::continuation("continue".to_string(), 0.1),
        }
    }

    #[cfg(test)]
    pub fn with_response(prompt: String, risk: f64) -> Self {
        Self {
            mock_response: LLMPromptResponse::continuation(prompt, risk),
        }
    }
    
    #[cfg(test)]
    pub fn with_completion(reason: String) -> Self {
        Self {
            mock_response: LLMPromptResponse::completed(reason),
        }
    }
}

impl LLMClient for MockLLMClient {
    fn generate_prompt(
        &self,
        _regions: &[Region],
        _region_images: Vec<Vec<u8>>,
        _system_prompt: Option<&str>,
        _risk_guidance: &str,
    ) -> Result<LLMPromptResponse, String> {
        Ok(self.mock_response.clone())
    }
}

#[cfg(feature = "llm-integration")]
mod real_client {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::env;

    /// OpenAI GPT-4 Vision client
    pub struct OpenAIClient {
        api_key: String,
        api_endpoint: String,
        model: String,
    }

    #[derive(Serialize)]
    struct OpenAIRequest {
        model: String,
        messages: Vec<OpenAIMessage>,
        max_tokens: u32,
        temperature: f32,
    }

    #[derive(Serialize)]
    struct OpenAIMessage {
        role: String,
        content: Vec<MessageContent>,
    }

    #[derive(Serialize, Clone)]
    #[serde(tag = "type")]
    enum MessageContent {
        #[serde(rename = "text")]
        Text { text: String },
        #[serde(rename = "image_url")]
        ImageUrl { image_url: ImageUrl },
    }

    #[derive(Serialize, Clone)]
    struct ImageUrl {
        url: String,
    }

    #[derive(Deserialize)]
    struct OpenAIResponse {
        choices: Vec<Choice>,
    }

    #[derive(Deserialize)]
    struct Choice {
        message: ResponseMessage,
    }

    #[derive(Deserialize)]
    struct ResponseMessage {
        content: String,
    }

    impl OpenAIClient {
        pub fn new(api_key: Option<String>, model: Option<String>) -> Result<Self, String> {
            let api_key = api_key
                .or_else(|| env::var("OPENAI_API_KEY").ok())
                .ok_or("OpenAI API key not provided and OPENAI_API_KEY environment variable not set".to_string())?;

            let api_endpoint = env::var("OPENAI_API_ENDPOINT")
                .unwrap_or_else(|_| "https://api.openai.com/v1/chat/completions".to_string());

            let model = model
                .or_else(|| env::var("OPENAI_MODEL").ok())
                .unwrap_or_else(|| "gpt-4o".to_string());

            Ok(Self {
                api_key,
                api_endpoint,
                model,
            })
        }

        fn build_system_message(&self, system_prompt: Option<&str>, risk_guidance: &str) -> String {
            let base_prompt = system_prompt.unwrap_or(
                "You are an AI assistant helping with desktop automation. \
                 Analyze the screen content and determine if the task is complete.",
            );

            format!(
                "{}\n\n{}\n\n\
                 Return ONLY a JSON object with this exact structure:\n\
                 {{\n\
                   \"continuation_prompt\": \"<text for next action, or null if complete>\",\n\
                   \"continuation_prompt_risk\": <risk level 0.0-1.0>,\n\
                   \"task_complete\": <true|false>,\n\
                   \"task_complete_reason\": \"<explanation if complete, or null>\"\n\
                 }}\n\n\
                 Examples:\n\
                 - Task complete: {{\"continuation_prompt\": null, \"continuation_prompt_risk\": 0.0, \"task_complete\": true, \"task_complete_reason\": \"All tests passed\"}}\n\
                 - Task continuing: {{\"continuation_prompt\": \"click Run button\", \"continuation_prompt_risk\": 0.2, \"task_complete\": false, \"task_complete_reason\": null}}\n\n\
                 Do not include any explanation or additional text outside the JSON.",
                base_prompt, risk_guidance
            )
        }
        
        /// Parse LLM response with fallback keyword detection
        fn parse_response(&self, content: &str) -> Result<LLMPromptResponse, String> {
            // Extract JSON from potential markdown code blocks
            let json_str = if content.starts_with("```json") {
                content
                    .trim_start_matches("```json")
                    .trim_end_matches("```")
                    .trim()
            } else if content.starts_with("```") {
                content
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim()
            } else {
                content
            };

            // Try to parse as structured JSON
            if let Ok(response) = serde_json::from_str::<LLMPromptResponse>(json_str) {
                return Ok(response);
            }
            
            // Fallback: keyword-based parsing
            eprintln!("Warning: Failed to parse structured LLM response, using keyword fallback");
            
            let content_upper = content.to_uppercase();
            
            // Check for completion keywords
            let task_complete = content_upper.contains("DONE")
                || content_upper.contains("COMPLETE")
                || content_upper.contains("FINISHED")
                || content_upper.contains("TASK_COMPLETE");
            
            if task_complete {
                let reason = if content_upper.contains("SUCCESS") || content_upper.contains("PASSED") {
                    "Task completed successfully".to_string()
                } else if content_upper.contains("FAIL") || content_upper.contains("ERROR") {
                    "Task completed with errors".to_string()
                } else {
                    "Task completed".to_string()
                };
                return Ok(LLMPromptResponse::completed(reason));
            }
            
            // Check for continuation keywords
            if content_upper.contains("CONTINUE") || content_upper.contains("NEXT") || content_upper.contains("MORE") {
                // Try to extract continuation text
                let prompt = if let Some(idx) = content.find("continue") {
                    content[idx..].lines().next().unwrap_or("continue").to_string()
                } else {
                    "continue".to_string()
                };
                return Ok(LLMPromptResponse::continuation(prompt, 0.3));
            }
            
            // Default: treat as continuation with low risk
            Ok(LLMPromptResponse::continuation(
                content.lines().next().unwrap_or("continue").to_string(),
                0.3
            ))
        }
    }

    impl LLMClient for OpenAIClient {
        fn generate_prompt(
            &self,
            _regions: &[Region],
            region_images: Vec<Vec<u8>>,
            system_prompt: Option<&str>,
            risk_guidance: &str,
        ) -> Result<LLMPromptResponse, String> {
            const MAX_RETRIES: usize = 3;
            
            // Build the base content with images
            let mut content = vec![MessageContent::Text {
                text: self.build_system_message(system_prompt, risk_guidance),
            }];

            // Add images as base64 data URLs
            for image_png in region_images {
                let base64_image =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_png);
                let data_url = format!("data:image/png;base64,{}", base64_image);
                content.push(MessageContent::ImageUrl {
                    image_url: ImageUrl { url: data_url },
                });
            }

            // Make the HTTP request synchronously using tokio runtime
            let runtime = tokio::runtime::Runtime::new()
                .map_err(|e| format!("Failed to create tokio runtime: {}", e))?;

            let mut last_error = String::new();
            
            for attempt in 1..=MAX_RETRIES {
                let request = OpenAIRequest {
                    model: self.model.clone(),
                    messages: vec![OpenAIMessage {
                        role: "user".to_string(),
                        content: content.clone(),
                    }],
                    max_tokens: 300,
                    temperature: 0.7,
                };

                let response = runtime.block_on(async {
                    let client = reqwest::Client::new();
                    client
                        .post(&self.api_endpoint)
                        .header("Authorization", format!("Bearer {}", self.api_key))
                        .header("Content-Type", "application/json")
                        .json(&request)
                        .send()
                        .await
                        .map_err(|e| format!("HTTP request failed: {}", e))?
                        .json::<OpenAIResponse>()
                        .await
                        .map_err(|e| format!("Failed to parse response: {}", e))
                });

                match response {
                    Ok(resp) => {
                        let response_content = resp
                            .choices
                            .first()
                            .ok_or("No response from LLM")?
                            .message
                            .content
                            .trim();

                        // Try to parse response with fallback
                        match self.parse_response(response_content) {
                            Ok(llm_response) => return Ok(llm_response),
                            Err(e) => {
                                last_error = e.clone();
                                eprintln!("Attempt {}/{} failed: {}", attempt, MAX_RETRIES, e);
                                
                                if attempt < MAX_RETRIES {
                                    // Add correction prompt for next attempt
                                    content.insert(0, MessageContent::Text {
                                        text: format!(
                                            "Previous response was invalid JSON. Error: {}. \
                                             Please return ONLY valid JSON with the exact structure specified.",
                                            e
                                        ),
                                    });
                                }
                            }
                        }
                    }
                    Err(e) => {
                        last_error = e.clone();
                        eprintln!("HTTP request attempt {}/{} failed: {}", attempt, MAX_RETRIES, e);
                        
                        if attempt < MAX_RETRIES {
                            std::thread::sleep(std::time::Duration::from_millis(500 * attempt as u64));
                        }
                    }
                }
            }

            Err(format!(
                "Failed after {} attempts. Last error: {}",
                MAX_RETRIES, last_error
            ))
        }
    }

    /// Factory function to create the appropriate LLM client
    pub fn create_llm_client(api_key: Option<String>, model: Option<String>) -> Result<Arc<dyn LLMClient>, String> {
        if env::var("LOOPAUTOMA_BACKEND").ok().as_deref() == Some("fake") {
            return Ok(Arc::new(MockLLMClient::new()));
        }

        // Try to create OpenAI client
        match OpenAIClient::new(api_key, model) {
            Ok(client) => Ok(Arc::new(client)),
            Err(e) => {
                eprintln!("Warning: Could not initialize OpenAI client: {}", e);
                eprintln!("Falling back to mock LLM client");
                Ok(Arc::new(MockLLMClient::new()))
            }
        }
    }
}

#[cfg(feature = "llm-integration")]
pub use real_client::create_llm_client;

#[cfg(not(feature = "llm-integration"))]
pub fn create_llm_client(_api_key: Option<String>, _model: Option<String>) -> Result<Arc<dyn LLMClient>, String> {
    Ok(Arc::new(MockLLMClient::new()))
}

/// Generate the risk guidance prompt for the LLM
pub fn build_risk_guidance() -> String {
    r#"Risk Assessment Guidelines:
- Low risk (0.0-0.33): Safe code changes inside workspace, no deletions, no external communication
- Medium risk (0.34-0.66): Git pushes, tag deletions, file operations inside workspace
- High risk (0.67-1.0): Operations outside workspace, elevated privileges, installing software, data transfer outside workspace

Consider the user's risk threshold when choosing the safest viable prompt."#
        .to_string()
}

/// Capture regions as PNG images using ScreenCapture
pub fn capture_region_images(
    regions: &[Region],
    capture: &dyn ScreenCapture,
) -> Result<Vec<Vec<u8>>, String> {
    let mut images = Vec::new();

    for region in regions {
        let frame = capture
            .capture_region(region)
            .map_err(|e| format!("Failed to capture region '{}': {}", region.id, e))?;

        // Convert frame bytes to PNG
        let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.bytes)
            .ok_or_else(|| format!("Failed to create image from region '{}'", region.id))?;

        let mut png_bytes = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut png_bytes),
            image::ImageFormat::Png,
        )
        .map_err(|e| format!("Failed to encode PNG for region '{}': {}", region.id, e))?;

        images.push(png_bytes);
    }

    Ok(images)
}
