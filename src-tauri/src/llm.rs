/// LLM client for generating prompts based on screen regions
use crate::domain::{LLMPromptResponse, Region, ScreenCapture};
use serde::{Deserialize, Serialize};
use std::env;
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
            mock_response: LLMPromptResponse {
                prompt: "continue".to_string(),
                risk: 0.1,
            },
        }
    }

    #[cfg(test)]
    pub fn with_response(prompt: String, risk: f64) -> Self {
        Self {
            mock_response: LLMPromptResponse { prompt, risk },
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

    #[derive(Serialize)]
    #[serde(tag = "type")]
    enum MessageContent {
        #[serde(rename = "text")]
        Text { text: String },
        #[serde(rename = "image_url")]
        ImageUrl { image_url: ImageUrl },
    }

    #[derive(Serialize)]
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
        pub fn new() -> Result<Self, String> {
            let api_key = env::var("OPENAI_API_KEY")
                .map_err(|_| "OPENAI_API_KEY environment variable not set".to_string())?;

            let api_endpoint = env::var("OPENAI_API_ENDPOINT")
                .unwrap_or_else(|_| "https://api.openai.com/v1/chat/completions".to_string());

            let model =
                env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4-vision-preview".to_string());

            Ok(Self {
                api_key,
                api_endpoint,
                model,
            })
        }

        fn build_system_message(&self, system_prompt: Option<&str>, risk_guidance: &str) -> String {
            let base_prompt = system_prompt.unwrap_or(
                "You are an AI assistant helping with desktop automation. \
                 Generate a safe, concise prompt based on the screen content provided.",
            );

            format!(
                "{}\n\n{}\n\n\
                 Return ONLY a JSON object with this exact structure:\n\
                 {{\n  \"prompt\": \"<your generated prompt text, max 200 chars>\",\n  \"risk\": <risk level 0.0-1.0>\n}}\n\n\
                 Do not include any explanation or additional text.",
                base_prompt, risk_guidance
            )
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
            // Build the request
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

            let request = OpenAIRequest {
                model: self.model.clone(),
                messages: vec![OpenAIMessage {
                    role: "user".to_string(),
                    content,
                }],
                max_tokens: 300,
                temperature: 0.7,
            };

            // Make the HTTP request synchronously using tokio runtime
            let runtime = tokio::runtime::Runtime::new()
                .map_err(|e| format!("Failed to create tokio runtime: {}", e))?;

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
            })?;

            // Parse the JSON response
            let content = response
                .choices
                .first()
                .ok_or("No response from LLM")?
                .message
                .content
                .trim();

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

            let llm_response: LLMPromptResponse = serde_json::from_str(json_str).map_err(|e| {
                format!(
                    "Failed to parse LLM JSON response: {}. Content: {}",
                    e, json_str
                )
            })?;

            Ok(llm_response)
        }
    }

    /// Factory function to create the appropriate LLM client
    pub fn create_llm_client() -> Result<Arc<dyn LLMClient>, String> {
        if env::var("LOOPAUTOMA_BACKEND").ok().as_deref() == Some("fake") {
            return Ok(Arc::new(MockLLMClient::new()));
        }

        // Try to create OpenAI client
        match OpenAIClient::new() {
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
pub fn create_llm_client() -> Result<Arc<dyn LLMClient>, String> {
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
