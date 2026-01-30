import Anthropic from '@anthropic-ai/sdk';
import { UserProfile } from './config';

const anthropic = new Anthropic();

export const DEFAULT_SYSTEM_PROMPT = `You are an expert at writing personalized, authentic VC outreach emails. Your emails sound natural and human - never templated or formulaic.

Your task is to generate a warm, personalized outreach email from a VC to a startup founder.

Guidelines:
- Keep the email between 100-150 words (3-4 short paragraphs)
- Start with a genuine, specific hook about why their company or product is unique and interesting. Think carefully about what makes the company differentiated.
- Add a thoughtful perspective on the market that shows you understand their world and have done research.
- End with a soft ask for a quick chat (not pushy)
- Sound conversational and human, not corporate
- Don't use buzzwords or clichés.
- Don't start with "I hope this email finds you well" or similar generic openings`;

export const DEFAULT_FOLLOW_UP_SYSTEM_PROMPT = `You write natural follow-up emails. Keep it brief (50-80 words), casual but professional. Reference your previous outreach without repeating the pitch. Show continued interest without being pushy.

Guidelines by follow-up number:
- 1st follow-up: Light check-in, reference initial email
- 2nd follow-up: Offer something of value (insight, relevant news)
- 3rd+: Final touch, leave door open gracefully

Keep the same signature style as the original email.`;

export const DEFAULT_FOLLOW_UP_USER_PROMPT_TEMPLATE = `Generate a follow-up email based on this information:

**Company:** {{companyName}}
**Company Summary:** {{companySummary}}
**Company URL:** {{companyUrl}}

**Original Email:**
{{originalEmail}}

{{previousFollowUps}}

**Follow-up Number:** {{followUpNumber}} (this is follow-up #{{followUpNumber}})

**Sender Profile:**
- Name: {{profileName}}
- Firm: {{profileFirm}}

Please respond in the following JSON format:
{
  "email": "The follow-up email content including signature"
}

Generate a natural, brief follow-up that references the previous outreach appropriately for follow-up #{{followUpNumber}}.`;

export const DEFAULT_USER_PROMPT_TEMPLATE = `Generate an outreach email based on this information:

**Company URL:** {{companyUrl}}

**Company Information:**
{{companyContent}}

**Sender Profile:**
- Name: {{profileName}}
- Firm: {{profileFirm}}
- Role: {{profileRole}}


Please respond in the following JSON format:
{
  "companyName": "The company's name",
  "summary": "A 1-2 sentence summary of what the company does",
  "email": "The full outreach email including the signature"
}

Make sure the email is personalized based on specific details from the company information.`;

export interface PromptSettings {
  systemPrompt: string;
  userPromptTemplate: string;
  followUpSystemPrompt?: string;
  followUpUserPromptTemplate?: string;
}

interface GenerateEmailParams {
  companyContent: string;
  companyUrl: string;
  profile: UserProfile;
  promptSettings?: PromptSettings;
}

interface GenerateEmailResult {
  email: string;
  companyName: string;
  summary: string;
}

function buildUserPrompt(
  template: string,
  companyUrl: string,
  companyContent: string,
  profile: UserProfile
): string {
  return template
    .replace(/\{\{companyUrl\}\}/g, companyUrl)
    .replace(/\{\{companyContent\}\}/g, companyContent)
    .replace(/\{\{profileName\}\}/g, profile.name)
    .replace(/\{\{profileFirm\}\}/g, profile.firm)
    .replace(/\{\{profileRole\}\}/g, profile.role);
}

export async function generateOutreachEmail({
  companyContent,
  companyUrl,
  profile,
  promptSettings,
}: GenerateEmailParams): Promise<GenerateEmailResult> {
  const systemPrompt = promptSettings?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const userPromptTemplate = promptSettings?.userPromptTemplate || DEFAULT_USER_PROMPT_TEMPLATE;

  const userPrompt = buildUserPrompt(userPromptTemplate, companyUrl, companyContent, profile);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  try {
    // Extract JSON from potential markdown code blocks
    let jsonText = content.text;
    const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const result = JSON.parse(jsonText);
    return {
      email: result.email,
      companyName: result.companyName,
      summary: result.summary,
    };
  } catch {
    // If JSON parsing fails, try to extract the email from the response
    return {
      email: content.text,
      companyName: 'Unknown',
      summary: 'Could not extract summary',
    };
  }
}

interface FollowUpEmailParams {
  companyName: string;
  companySummary: string;
  companyUrl: string;
  originalEmail: string;
  previousFollowUps: string[];
  followUpNumber: number;
  profile: UserProfile;
  promptSettings?: PromptSettings;
}

interface FollowUpEmailResult {
  email: string;
}

function buildFollowUpUserPrompt(
  template: string,
  params: Omit<FollowUpEmailParams, 'promptSettings'>
): string {
  const previousFollowUpsText = params.previousFollowUps.length > 0
    ? `**Previous Follow-ups:**\n${params.previousFollowUps.map((email, i) => `Follow-up #${i + 1}:\n${email}`).join('\n\n')}`
    : '';

  return template
    .replace(/\{\{companyName\}\}/g, params.companyName)
    .replace(/\{\{companySummary\}\}/g, params.companySummary || '')
    .replace(/\{\{companyUrl\}\}/g, params.companyUrl)
    .replace(/\{\{originalEmail\}\}/g, params.originalEmail)
    .replace(/\{\{previousFollowUps\}\}/g, previousFollowUpsText)
    .replace(/\{\{followUpNumber\}\}/g, String(params.followUpNumber))
    .replace(/\{\{profileName\}\}/g, params.profile.name)
    .replace(/\{\{profileFirm\}\}/g, params.profile.firm);
}

export async function generateFollowUpEmail(
  params: FollowUpEmailParams
): Promise<FollowUpEmailResult> {
  const systemPrompt = params.promptSettings?.followUpSystemPrompt || DEFAULT_FOLLOW_UP_SYSTEM_PROMPT;
  const userPromptTemplate = params.promptSettings?.followUpUserPromptTemplate || DEFAULT_FOLLOW_UP_USER_PROMPT_TEMPLATE;

  const userPrompt = buildFollowUpUserPrompt(userPromptTemplate, params);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  try {
    // Extract JSON from potential markdown code blocks
    let jsonText = content.text;
    const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const result = JSON.parse(jsonText);
    return {
      email: result.email,
    };
  } catch {
    // If JSON parsing fails, return the raw text as the email
    return {
      email: content.text,
    };
  }
}
