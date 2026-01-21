import { useEffect } from 'react';
import { useAppStore } from '../../store';
import { defaultModels } from '../../lib/llm';
import { personalities } from '../../lib/personalities';
import { characters } from '../../characters';
import type { LLMProviderType, PersonalityId, DetailLevel } from '../../types';

export function SettingsModal() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const setScaleSliderDragging = useAppStore((state) => state.setScaleSliderDragging);

  // Track when scale slider drag ends (mouseup anywhere on document)
  useEffect(() => {
    const handlePointerUp = () => {
      setScaleSliderDragging(false);
    };
    document.addEventListener('pointerup', handlePointerUp);
    return () => document.removeEventListener('pointerup', handlePointerUp);
  }, [setScaleSliderDragging]);

  if (!settings.showSettings) return null;

  const handleProviderChange = (provider: LLMProviderType) => {
    updateSettings({
      llmProvider: provider,
      llmModel: defaultModels[provider][0],
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-96 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white text-lg font-semibold">Settings</h2>
          <button
            onClick={toggleSettings}
            className="text-gray-400 hover:text-white transition-colors cursor-grab"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* LLM Provider */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">LLM Provider</label>
            <select
              value={settings.llmProvider}
              onChange={(e) => handleProviderChange(e.target.value as LLMProviderType)}
              className="w-full bg-gray-700 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">Model</label>
            <select
              value={settings.llmModel}
              onChange={(e) => updateSettings({ llmModel: e.target.value })}
              className="w-full bg-gray-700 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              {defaultModels[settings.llmProvider].map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">API Key</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
              placeholder="Enter your API key"
              className="w-full bg-gray-700 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>

          {/* Personality Section Divider */}
          <div className="pt-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-700 pb-2">
              Personality & Behavior
            </div>
          </div>

          {/* Personality Selection */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">Personality</label>
            <select
              value={settings.selectedPersonality}
              onChange={(e) => updateSettings({ selectedPersonality: e.target.value as PersonalityId })}
              className="w-full bg-gray-700 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              {Object.values(personalities).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {personalities[settings.selectedPersonality].description}
            </p>
          </div>

          {/* Detail Level */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">Response Detail</label>
            <div className="flex gap-2">
              {(['concise', 'balanced', 'detailed'] as DetailLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => updateSettings({ detailLevel: level })}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    settings.detailLevel === level
                      ? 'bg-teal-400 text-gray-900'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Subject Selection (for Assistant mode) */}
          {settings.selectedPersonality === 'assistant' && (
            <div>
              <label className="block text-sm text-gray-300 mb-2">Subject Expertise</label>
              <select
                value={settings.customSubject ? 'custom' : settings.assistantSubject}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    updateSettings({ customSubject: settings.customSubject || '' });
                  } else {
                    updateSettings({ assistantSubject: e.target.value, customSubject: '' });
                  }
                }}
                className="w-full bg-gray-700 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {personalities.assistant.predefinedSubjects?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
                <option value="custom">Custom Subject...</option>
              </select>
              {(settings.customSubject || settings.assistantSubject === 'custom') && (
                <input
                  type="text"
                  value={settings.customSubject}
                  onChange={(e) => updateSettings({ customSubject: e.target.value })}
                  placeholder="Enter custom subject area..."
                  className="w-full mt-2 bg-gray-700 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400"
                />
              )}
            </div>
          )}

          {/* Display Section Divider */}
          <div className="pt-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-700 pb-2">
              Display
            </div>
          </div>

          {/* Character Selection */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">Character</label>
            <select
              value={settings.selectedCharacter}
              onChange={(e) => updateSettings({ selectedCharacter: e.target.value })}
              className="w-full bg-gray-700 text-black rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              {Object.values(characters).map((c) => (
                <option key={c.config.id} value={c.config.id}>
                  {c.config.name}
                </option>
              ))}
            </select>
          </div>

          {/* Character Scale */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Character Scale: {settings.characterScale.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.characterScale}
              onPointerDown={() => setScaleSliderDragging(true)}
              onChange={(e) => updateSettings({ characterScale: parseFloat(e.target.value) })}
              onPointerUp={() => {
                setScaleSliderDragging(false);
                window.location.reload();
              }}
              className="w-full accent-teal-400"
            />
          </div>

          {/* Chat Scale */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Chat Scale: {(settings.chatScale ?? 1.0).toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.chatScale ?? 1.0}
              onPointerDown={() => setScaleSliderDragging(true)}
              onChange={(e) => updateSettings({ chatScale: parseFloat(e.target.value) })}
              className="w-full accent-teal-400"
            />
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Font Size: {settings.fontSize ?? 14}px
            </label>
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              value={settings.fontSize ?? 14}
              onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
              className="w-full accent-teal-400"
            />
          </div>

          {/* Always on Top */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Always on Top</label>
            <button
              onClick={() => updateSettings({ alwaysOnTop: !settings.alwaysOnTop })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.alwaysOnTop ? 'bg-teal-400' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.alwaysOnTop ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-700">
          <button
            onClick={toggleSettings}
            className="w-full bg-gradient-to-r from-teal-400 to-cyan-400 text-white rounded-lg py-2 font-medium text-sm hover:opacity-90 transition-opacity cursor-grab"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
