import Anthropic from '@anthropic-ai/sdk';
import { UserProfile } from './config';

const anthropic = new Anthropic();

interface GenerateEmailParams {
  companyContent: string;
  companyUrl: string;
  profile: UserProfile;
}

interface GenerateEmailResult {
  email: string;
  companyName: string;
  summary: string;
}

// Maximum number of turns to prevent infinite loops
const MAX_TOOL_USE_TURNS = 10;

export async function generateOutreachEmail({
  companyContent,
  companyUrl,
  profile,
}: GenerateEmailParams): Promise<GenerateEmailResult> {
  const systemPrompt = `You are an expert at writing personalized, authentic VC outreach emails. Your emails sound natural and human - never templated or formulaic.

Your task is to generate a warm, personalized outreach email from a VC to a startup founder.

IMPORTANT: Before writing the email, use the web_search tool to research this company. Look for:
- Recent funding rounds or news
- Product launches or features
- The founding team's background
- Business model and market position
- Any interesting technology or approach they're using

Use these insights to craft a genuine, specific hook that shows you've done your homework.

Guidelines:
- Keep the email between 100-150 words (3-4 short paragraphs)
- Start with a genuine, specific hook about what interests you about their company
- Add a brief perspective on the market/space that shows you understand their world
- End with a soft ask for a quick chat (not pushy)
- Sound conversational and human, not corporate
- Don't use buzzwords or clichés
- Don't start with "I hope this email finds you well" or similar generic openings`;

  const userPrompt = `Generate an outreach email based on this information:

**Company URL:** ${companyUrl}

**Company Information (from their website):**
${companyContent}

**Sender Profile:**
- Name: ${profile.name}
- Firm: ${profile.firm}
- Role: ${profile.role}
- Focus Areas: ${profile.focusAreas.join(', ')}

**Email Signature to use:**
${profile.signature}

Please research the company using web search to find additional context like funding rounds, news, or team background. Then respond in the following JSON format:
{
  "companyName": "The company's name",
  "summary": "A 1-2 sentence summary of what the company does",
  "email": "The full outreach email including the signature"
}

Make sure the email is personalized based on specific details from your research.`;

  // Build messages array for multi-turn conversation (using beta types)
  type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
  type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
  type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

  const messages: BetaMessageParam[] = [
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  // Loop to handle tool use - Claude may make multiple web searches
  let turns = 0;
  while (turns < MAX_TOOL_USE_TURNS) {
    turns++;

    const response = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
      system: systemPrompt,
      betas: ['web-search-2025-03-05'],
    });

    // Check if we got a final response (end_turn means Claude is done)
    if (response.stop_reason === 'end_turn') {
      return extractEmailResult(response.content);
    }

    // If Claude wants to use tools, continue the conversation
    if (response.stop_reason === 'tool_use') {
      // Add assistant's response (which includes tool_use blocks)
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // For server-side tools like web_search, the results are returned
      // automatically by Anthropic's servers. We just continue the conversation.
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Beta.Messages.BetaToolUseBlock =>
          block.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0) {
        // Add empty tool results to acknowledge - server tools execute automatically
        const toolResults: BetaToolResultBlockParam[] = toolUseBlocks.map(
          (block) => ({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: '',
          })
        );

        messages.push({
          role: 'user',
          content: toolResults,
        });
      }

      continue;
    }

    // For any other stop reason, try to extract what we have
    return extractEmailResult(response.content);
  }

  throw new Error('Max tool use turns exceeded');
}

/**
 * Strip web search citation tags from text
 * Citations appear as <cite index="X-Y">text</cite> or <cite index="X-Y" />
 */
function stripCitations(text: string): string {
  return text
    .replace(/<cite\s+index="[^"]*"\s*\/>/g, '')
    .replace(/<cite\s+index="[^"]*">([\s\S]*?)<\/cite>/g, '$1')
    .replace(/<\/?source_location[^>]*>/g, '')
    .trim();
}

/**
 * Extract the email result from Claude's response content
 */
function extractEmailResult(
  content: Anthropic.Beta.Messages.BetaContentBlock[]
): GenerateEmailResult {
  // Find the text block in the response
  const textBlock = content.find(
    (block): block is Anthropic.Beta.Messages.BetaTextBlock =>
      block.type === 'text'
  );

  if (!textBlock) {
    throw new Error('No text response from Claude');
  }

  try {
    // Try to parse JSON from the response
    // Handle case where JSON might be wrapped in markdown code blocks
    let jsonText = textBlock.text;
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const result = JSON.parse(jsonText);
    return {
      email: stripCitations(result.email),
      companyName: stripCitations(result.companyName),
      summary: stripCitations(result.summary),
    };
  } catch {
    // If JSON parsing fails, try to extract the email from the response
    return {
      email: stripCitations(textBlock.text),
      companyName: 'Unknown',
      summary: 'Could not extract summary',
    };
  }
}
