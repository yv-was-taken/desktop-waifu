import { CharacterCanvas } from './components/character';
import { ChatPanel } from './components/chat';
import { SettingsModal, TitleBar, SlidingPanel } from './components/ui';
import { useAppStore } from './store';

// Check if we're in overlay mode (desktop pet mode)
const isOverlayMode = new URLSearchParams(window.location.search).get('overlay') === 'true';

function OverlayMode() {
  const chatPanelOpen = useAppStore((state) => state.ui.chatPanelOpen);
  const setChatPanelOpen = useAppStore((state) => state.setChatPanelOpen);

  const handleCanvasClick = () => {
    setChatPanelOpen(!chatPanelOpen);
  };

  return (
    <div className="w-screen h-screen flex flex-row" style={{ background: 'transparent' }}>
      {/* Chat panel area - fixed width on left, content slides in */}
      <div className="w-[500px] h-full flex-shrink-0 overflow-hidden">
        <div
          className="w-[500px] h-full bg-[#1a1a2e] flex flex-col transition-transform duration-300 ease-in-out"
          style={{ transform: chatPanelOpen ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          <ChatPanel onClose={() => setChatPanelOpen(false)} />
        </div>
      </div>

      {/* Character canvas - fixed on right, clicking opens panel */}
      <div
        className="w-[240px] h-full cursor-pointer flex-shrink-0"
        onClick={handleCanvasClick}
      >
        <CharacterCanvas />
      </div>

      <SettingsModal />
    </div>
  );
}

function App() {
  // Overlay mode: character with sliding chat panel
  if (isOverlayMode) {
    return <OverlayMode />;
  }

  // Normal mode: full app with chat
  return (
    <div className="w-screen h-screen p-[5%]">
      <TitleBar />

      <div className="w-full h-full flex flex-row">
        {/* Character - 50% width */}
        <div className="w-1/2 h-full">
          <CharacterCanvas />
        </div>

        {/* Chat - 50% width */}
        <div className="w-1/2 h-full bg-[#1a1a2e]">
          <ChatPanel />
        </div>
      </div>

      <SettingsModal />
    </div>
  );
}

export default App;
