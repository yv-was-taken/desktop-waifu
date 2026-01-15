import { getCurrentWindow } from '@tauri-apps/api/window';

export function TitleBar() {
  const appWindow = getCurrentWindow();

  const handleMinimize = () => appWindow.minimize();
  const handleClose = () => appWindow.close();

  return (
    <div className="absolute top-0 left-0 right-0 h-8 flex items-center justify-end px-2 drag-region z-50">
      <div className="flex gap-1 no-drag">
        <button
          onClick={handleMinimize}
          className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500/80 transition-colors"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
