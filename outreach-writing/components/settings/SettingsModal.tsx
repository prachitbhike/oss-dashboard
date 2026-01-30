'use client';

import { useState, useEffect } from 'react';

export interface PromptSettings {
  systemPrompt: string;
  userPromptTemplate: string;
  followUpSystemPrompt?: string;
  followUpUserPromptTemplate?: string;
}

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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PromptSettings;
  onSave: (settings: PromptSettings) => void;
}

type TabType = 'system' | 'user' | 'followup-system' | 'followup-user';

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
}: SettingsModalProps) {
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [userPromptTemplate, setUserPromptTemplate] = useState(settings.userPromptTemplate);
  const [followUpSystemPrompt, setFollowUpSystemPrompt] = useState(
    settings.followUpSystemPrompt || DEFAULT_FOLLOW_UP_SYSTEM_PROMPT
  );
  const [followUpUserPromptTemplate, setFollowUpUserPromptTemplate] = useState(
    settings.followUpUserPromptTemplate || DEFAULT_FOLLOW_UP_USER_PROMPT_TEMPLATE
  );
  const [activeTab, setActiveTab] = useState<TabType>('system');

  useEffect(() => {
    setSystemPrompt(settings.systemPrompt);
    setUserPromptTemplate(settings.userPromptTemplate);
    setFollowUpSystemPrompt(settings.followUpSystemPrompt || DEFAULT_FOLLOW_UP_SYSTEM_PROMPT);
    setFollowUpUserPromptTemplate(settings.followUpUserPromptTemplate || DEFAULT_FOLLOW_UP_USER_PROMPT_TEMPLATE);
  }, [settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      systemPrompt,
      userPromptTemplate,
      followUpSystemPrompt,
      followUpUserPromptTemplate,
    });
    onClose();
  };

  const handleReset = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setUserPromptTemplate(DEFAULT_USER_PROMPT_TEMPLATE);
    setFollowUpSystemPrompt(DEFAULT_FOLLOW_UP_SYSTEM_PROMPT);
    setFollowUpUserPromptTemplate(DEFAULT_FOLLOW_UP_USER_PROMPT_TEMPLATE);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">
            Prompt Settings
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-neutral-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('system')}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'system'
                ? 'text-neutral-900 border-b-2 border-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            System
          </button>
          <button
            onClick={() => setActiveTab('user')}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'user'
                ? 'text-neutral-900 border-b-2 border-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            User Template
          </button>
          <button
            onClick={() => setActiveTab('followup-system')}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'followup-system'
                ? 'text-neutral-900 border-b-2 border-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Follow-up System
          </button>
          <button
            onClick={() => setActiveTab('followup-user')}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'followup-user'
                ? 'text-neutral-900 border-b-2 border-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Follow-up Template
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'system' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                System Prompt
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                This prompt sets the behavior and personality of the AI for initial outreach emails.
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full h-80 px-4 py-3 bg-white border border-neutral-200 rounded-lg input-field resize-none font-mono text-sm text-neutral-900"
              />
            </div>
          )}
          {activeTab === 'user' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                User Prompt Template
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                Template for the user message. Use placeholders: {'{{companyUrl}}'}, {'{{companyContent}}'}, {'{{profileName}}'}, {'{{profileFirm}}'}, {'{{profileRole}}'}
              </p>
              <textarea
                value={userPromptTemplate}
                onChange={(e) => setUserPromptTemplate(e.target.value)}
                className="w-full h-80 px-4 py-3 bg-white border border-neutral-200 rounded-lg input-field resize-none font-mono text-sm text-neutral-900"
              />
            </div>
          )}
          {activeTab === 'followup-system' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Follow-up System Prompt
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                This prompt sets the behavior for generating follow-up emails.
              </p>
              <textarea
                value={followUpSystemPrompt}
                onChange={(e) => setFollowUpSystemPrompt(e.target.value)}
                className="w-full h-80 px-4 py-3 bg-white border border-neutral-200 rounded-lg input-field resize-none font-mono text-sm text-neutral-900"
              />
            </div>
          )}
          {activeTab === 'followup-user' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Follow-up User Prompt Template
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                Template for follow-up emails. Use placeholders: {'{{companyName}}'}, {'{{companySummary}}'}, {'{{companyUrl}}'}, {'{{originalEmail}}'}, {'{{previousFollowUps}}'}, {'{{followUpNumber}}'}, {'{{profileName}}'}, {'{{profileFirm}}'}
              </p>
              <textarea
                value={followUpUserPromptTemplate}
                onChange={(e) => setFollowUpUserPromptTemplate(e.target.value)}
                className="w-full h-80 px-4 py-3 bg-white border border-neutral-200 rounded-lg input-field resize-none font-mono text-sm text-neutral-900"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50 rounded-b-xl">
          <button
            onClick={handleReset}
            className="btn px-4 py-2 text-sm text-neutral-600 border border-neutral-200 rounded-lg bg-white"
          >
            Reset to Default
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn px-4 py-2 text-sm text-neutral-600 border border-neutral-200 rounded-lg bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn px-4 py-2 text-sm text-white bg-neutral-900 rounded-lg"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
