const GEMINI_API_KEY = 'key';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Sends device parameters and symptoms to Google Gemini API
 * @param {string} deviceType - Category of device (e.g. Laptop, Smartphone, Desktop PC)
 * @param {string} symptoms - Observed behavioral anomalies or error codes
 * @returns {Promise<string>} Formatted HTML string containing diagnostic analysis
 */
export async function runDiagnosticAnalysis(deviceType, symptoms) {
  const promptText = `
You are an expert hardware and software diagnostic system for electronic repair technicians.
Analyze the following fault case:

Device Type: ${deviceType}
Observed Symptoms / Error Codes: ${symptoms}

Please provide a structured diagnostic response formatted in clean HTML (do not include Markdown block backticks \`\`\`html):
1. <h4>Probable Root Causes & Confidence Scores</h4>
   - List 2 to 3 top estimated failure modes with estimated confidence percentages (e.g., "PMIC Power Rail Short Circuit - 75% Confidence").
2. <h4>Step-by-Step Diagnostic Verification</h4>
   - Provide explicit voltage/signal check points or software checks to confirm the fault.
3. <h4>Recommended Repair Procedure</h4>
   - Outline clear repair or component replacement steps.
4. <h4>Required Tools & Spare Parts</h4>
   - List essential replacement parts and diagnostic equipment needed.
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ]
  };

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `HTTP Error ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No diagnostic content returned from AI API.');
    }

    // Clean any accidental markdown code wrappers if returned by API
    return generatedText
      .replace(/^```html\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

  } catch (err) {
    console.error('Gemini API Diagnostic Error:', err);
    throw err;
  }
}