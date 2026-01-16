import { CharacterCanvas } from './components/character';
import { ChatPanel } from './components/chat';
import { SettingsModal, TitleBar } from './components/ui';

function App() {
  return (
    <div className="w-screen h-screen p-[5%] bg-[#1a1a2e]">
      <TitleBar />

      <div className="w-full h-full flex flex-row">
        {/* Character - 50% width */}
        <div className="w-1/2 h-full">
          <CharacterCanvas />
        </div>

        {/* Chat - 50% width */}
        <div className="w-1/2 h-full">
          <ChatPanel />
        </div>
      </div>

      <SettingsModal />
    </div>
  );
}

export default App;
