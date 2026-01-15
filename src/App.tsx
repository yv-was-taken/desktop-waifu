import { CharacterCanvas } from './components/character';
import { ChatPanel } from './components/chat';
import { SettingsModal, TitleBar } from './components/ui';

function App() {
  return (
    <div className="h-screen w-screen flex items-center bg-[#1a1a2e] overflow-hidden">
      {/* Title bar for window controls */}
      <TitleBar />

      {/* Main content area with character */}
      <div className="flex-1 flex flex-col">
        <CharacterCanvas />
      </div>

      {/* Chat panel on the right */}
      <ChatPanel />

      {/* Settings modal */}
      <SettingsModal />
    </div>
  );
}

export default App;
